import {
  BusId,
  CustomSynthFilterType,
  FingerId,
  FingerMixerChannel,
  FxSlotInstance,
  MixerBusData,
  SynthPresetType,
} from '../types';
import { SynthGenerator, GeneratedSynthResult } from './SynthGenerator';

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = Math.max(0, amount) * 160;
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  if (k <= 0.01) {
    for (let i = 0; i < n; i++) curve[i] = (i * 2) / n - 1;
    return curve;
  }
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Studio-quality stereo Hall/Plate impulse response with:
 * - Discrete stereo early reflections for room depth
 * - Progressive high-frequency air damping along the tail
 * - RMS normalization so reverb wet signal has rich, clear presence
 */
function buildStudioImpulseResponse(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = Math.max(0.35, Math.min(5.0, durationSec));
  const len = Math.max(1, Math.floor(sr * dur));
  const buf = ctx.createBuffer(2, len, sr);

  // Early reflection tap times (ms) & stereo panning weights
  const earlyTaps: Array<[number, number, number]> = [
    [0.004, 0.55, 0.30],
    [0.011, 0.28, 0.58],
    [0.019, 0.48, 0.22],
    [0.027, 0.18, 0.46],
    [0.036, 0.38, 0.34],
    [0.044, 0.22, 0.36],
  ];

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);

    // 1. Early reflections
    for (const [tSec, gL, gR] of earlyTaps) {
      const idx = Math.floor(tSec * sr);
      if (idx < len) {
        data[idx] += (ch === 0 ? gL : gR) * (Math.random() > 0.3 ? 1 : -1);
      }
    }

    // 2. Smooth stereo-decorrelated late tail with progressive HF damping
    let lpState = 0;
    let rmsSum = 0;
    const attackSamples = Math.max(1, Math.floor(sr * 0.022));
    for (let i = 0; i < len; i++) {
      const tNorm = i / len;
      const attack = i < attackSamples ? i / attackSamples : 1.0;
      const decay = Math.pow(1 - tNorm, 2.25);
      // Progressive damping: starts bright, gets warmer as tail decays
      const dampCoeff = 0.22 + (1 - tNorm) * 0.62;
      const white = Math.random() * 2 - 1;
      lpState = lpState + dampCoeff * (white - lpState);
      const sample = data[i] + lpState * decay * attack;
      data[i] = sample;
      rmsSum += sample * sample;
    }

    // Normalize energy so short & long reverbs both hit strongly
    const rms = Math.sqrt(rmsSum / len) || 1;
    const targetRms = 0.19;
    const normGain = Math.min(4.5, targetRms / rms);
    for (let i = 0; i < len; i++) {
      data[i] *= normGain;
    }
  }

  return buf;
}

function makeBitcrushCurve(bits: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const step = Math.pow(2, Math.max(1, Math.min(12, Math.round(bits))) - 1);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.round(x * step) / step;
  }
  return curve;
}

interface LiveSlotNodes {
  slotId: string;
  type: FxSlotInstance['type'];
  dryGain: GainNode;
  wetGain: GainNode;
  cleanup: () => void;
  updateParams: (slot: FxSlotInstance, ctx: AudioContext) => void;
}

interface LiveBusGraph {
  id: BusId;
  input: GainNode;
  output: GainNode;
  analyser: AnalyserNode;
  meterBuf: Float32Array<ArrayBuffer>;
  slots: LiveSlotNodes[];
  signature: string;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<FingerId, AudioBuffer>();
  private oneHitBuffers = new Map<number, AudioBuffer>();
  private masterVolume = 0.85;

  private fingerMixer = new Map<FingerId, FingerMixerChannel>();
  private mixerBusesData: Record<BusId, MixerBusData> | null = null;
  private liveBuses = new Map<BusId, LiveBusGraph>();
  private irCache = new Map<string, AudioBuffer>();
  private fingerPeakState = new Map<FingerId, { peak: number; timeMs: number }>();

  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;

      // Safety brickwall limiter so transient peaks never hard-clip MediaStreamAudioDestination
      const safetyLimiter = this.ctx.createDynamicsCompressor();
      safetyLimiter.threshold.value = -1.5;
      safetyLimiter.knee.value = 3;
      safetyLimiter.ratio.value = 16;
      safetyLimiter.attack.value = 0.002;
      safetyLimiter.release.value = 0.08;

      this.streamDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(safetyLimiter);
      safetyLimiter.connect(this.ctx.destination);
      safetyLimiter.connect(this.streamDest);

      this.ensureBusGraph('master');
      if (this.mixerBusesData) {
        this.applyAllBuses(this.mixerBusesData);
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private ensureBusGraph(id: BusId): LiveBusGraph {
    const existing = this.liveBuses.get(id);
    if (existing) return existing;

    const ctx = this.ctx!;
    const input = ctx.createGain();
    const output = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const meterBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

    input.connect(output);
    output.connect(analyser);

    const graph: LiveBusGraph = {
      id,
      input,
      output,
      analyser,
      meterBuf,
      slots: [],
      signature: '',
    };
    this.liveBuses.set(id, graph);

    if (id === 'master') {
      output.connect(this.masterGain!);
    } else {
      const masterGraph = this.ensureBusGraph('master');
      output.connect(masterGraph.input);
    }

    return graph;
  }

  removeBusGraph(id: BusId): void {
    if (id === 'master') return;
    const graph = this.liveBuses.get(id);
    if (!graph) return;
    try {
      graph.input.disconnect();
      for (const s of graph.slots) s.cleanup();
      graph.output.disconnect();
      graph.analyser.disconnect();
    } catch {
      // ignore
    }
    this.liveBuses.delete(id);
    if (this.mixerBusesData) {
      delete this.mixerBusesData[id];
    }
  }

  private getOrCreateIr(sizeSec: number): AudioBuffer {
    const key = sizeSec.toFixed(1);
    const cached = this.irCache.get(key);
    if (cached) return cached;
    const ir = buildStudioImpulseResponse(this.ctx!, Number(key));
    this.irCache.set(key, ir);
    return ir;
  }

  private buildSlotChain(slot: FxSlotInstance): LiveSlotNodes & { entry: AudioNode; exit: AudioNode } {
    const ctx = this.ctx!;
    const entry = ctx.createGain();
    const exit = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    entry.connect(dryGain);
    dryGain.connect(exit);
    wetGain.connect(exit);

    let cleanup = () => {
      try {
        entry.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        exit.disconnect();
      } catch {
        // ignore
      }
    };
    let updateParams = (s: FxSlotInstance, c: AudioContext) => {
      const now = c.currentTime;
      const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
      const dry = s.enabled ? 1 - wet * 0.45 : 1;
      dryGain.gain.setTargetAtTime(dry, now, 0.015);
      wetGain.gain.setTargetAtTime(wet, now, 0.015);
    };

    if (slot.type === 'reverb') {
      const preDelay = ctx.createDelay(0.2);
      const convolver = ctx.createConvolver();
      const toneFilter = ctx.createBiquadFilter();
      toneFilter.type = 'lowpass';
      const makeupGain = ctx.createGain();
      makeupGain.gain.value = 1.85;

      let lastSize = Number(slot.params.size ?? 2.2);
      convolver.buffer = this.getOrCreateIr(lastSize);

      entry.connect(preDelay);
      preDelay.connect(convolver);
      convolver.connect(toneFilter);
      toneFilter.connect(makeupGain);
      makeupGain.connect(wetGain);

      const baseUpdate = updateParams;
      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        // Keep dry punch intact while letting wet tail bloom cleanly
        dryGain.gain.setTargetAtTime(s.enabled ? Math.max(0.35, 1 - wet * 0.55) : 1, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        preDelay.delayTime.setTargetAtTime(
          Math.max(0, Math.min(0.12, Number(s.params.preDelayMs ?? 20) / 1000)),
          now,
          0.02
        );
        toneFilter.frequency.setTargetAtTime(
          Math.max(800, Math.min(14000, Number(s.params.toneHz ?? 6200))),
          now,
          0.02
        );
        const newSize = Number(s.params.size ?? 2.2);
        if (Math.abs(newSize - lastSize) >= 0.1) {
          lastSize = newSize;
          convolver.buffer = this.getOrCreateIr(newSize);
        }
        void baseUpdate;
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          preDelay.disconnect();
          convolver.disconnect();
          toneFilter.disconnect();
          makeupGain.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'delay') {
      const delay = ctx.createDelay(1.5);
      const fb = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 4400;

      entry.connect(delay);
      delay.connect(tone);
      tone.connect(fb);
      fb.connect(delay);
      tone.connect(wetGain);

      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        delay.delayTime.setTargetAtTime(
          Math.max(0.03, Math.min(1.2, Number(s.params.timeMs ?? 240) / 1000)),
          now,
          0.02
        );
        fb.gain.setTargetAtTime(
          s.enabled ? Math.max(0, Math.min(0.85, Number(s.params.feedback ?? 0.42))) : 0,
          now,
          0.02
        );
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          delay.disconnect();
          fb.disconnect();
          tone.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'filter') {
      const filter = ctx.createBiquadFilter();
      entry.connect(filter);
      filter.connect(wetGain);

      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1 - wet, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        filter.type = (s.params.filterType as CustomSynthFilterType) ?? 'lowpass';
        filter.frequency.setTargetAtTime(
          Math.max(80, Math.min(18000, Number(s.params.cutoff ?? 3200))),
          now,
          0.015
        );
        filter.Q.setTargetAtTime(
          Math.max(0.5, Math.min(16, Number(s.params.q ?? 2.2))),
          now,
          0.015
        );
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          filter.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'drive') {
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x';
      const trim = ctx.createGain();
      trim.gain.value = 0.72;
      entry.connect(shaper);
      shaper.connect(trim);
      trim.connect(wetGain);

      let lastAmt = -1;
      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1 - wet, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        const amt = Number(s.params.amount ?? 0.45);
        if (Math.abs(amt - lastAmt) > 0.01) {
          lastAmt = amt;
          shaper.curve = makeDistortionCurve(amt);
        }
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          shaper.disconnect();
          trim.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'chorus') {
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.018;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      const lfoGain = ctx.createGain();
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();

      entry.connect(delay);
      delay.connect(wetGain);

      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1 - wet * 0.35, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        lfo.frequency.setTargetAtTime(
          Math.max(0.2, Math.min(8, Number(s.params.rateHz ?? 1.4))),
          now,
          0.02
        );
        lfoGain.gain.setTargetAtTime(
          Math.max(0, Math.min(0.012, Number(s.params.depthMs ?? 4.5) / 1000)),
          now,
          0.02
        );
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          lfo.stop();
          lfo.disconnect();
          lfoGain.disconnect();
          delay.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'compressor') {
      const comp = ctx.createDynamicsCompressor();
      entry.connect(comp);
      comp.connect(wetGain);

      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1 - wet, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        comp.threshold.setTargetAtTime(
          Math.max(-50, Math.min(0, Number(s.params.threshold ?? -18))),
          now,
          0.02
        );
        comp.ratio.setTargetAtTime(
          Math.max(1, Math.min(20, Number(s.params.ratio ?? 5))),
          now,
          0.02
        );
        comp.attack.setTargetAtTime(
          Math.max(0.001, Math.min(0.2, Number(s.params.attackMs ?? 8) / 1000)),
          now,
          0.02
        );
        comp.release.setTargetAtTime(
          Math.max(0.02, Math.min(1.0, Number(s.params.releaseMs ?? 140) / 1000)),
          now,
          0.02
        );
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          comp.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'eq3') {
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 120;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1200;
      mid.Q.value = 1.1;
      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 6000;

      entry.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(wetGain);

      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1 - wet, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        low.gain.setTargetAtTime(Math.max(-18, Math.min(18, Number(s.params.lowDb ?? 0))), now, 0.02);
        mid.gain.setTargetAtTime(Math.max(-18, Math.min(18, Number(s.params.midDb ?? 0))), now, 0.02);
        high.gain.setTargetAtTime(Math.max(-18, Math.min(18, Number(s.params.highDb ?? 0))), now, 0.02);
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          low.disconnect();
          mid.disconnect();
          high.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'phaser') {
      const ap1 = ctx.createBiquadFilter();
      const ap2 = ctx.createBiquadFilter();
      const ap3 = ctx.createBiquadFilter();
      ap1.type = 'allpass';
      ap2.type = 'allpass';
      ap3.type = 'allpass';
      ap1.Q.value = 3.0;
      ap2.Q.value = 3.0;
      ap3.Q.value = 3.0;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      const lfoGain = ctx.createGain();
      lfo.connect(lfoGain);
      lfoGain.connect(ap1.frequency);
      lfoGain.connect(ap2.frequency);
      lfoGain.connect(ap3.frequency);
      lfo.start();

      entry.connect(ap1);
      ap1.connect(ap2);
      ap2.connect(ap3);
      ap3.connect(wetGain);

      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1 - wet * 0.4, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        const baseHz = Math.max(150, Math.min(4000, Number(s.params.baseHz ?? 700)));
        ap1.frequency.setTargetAtTime(baseHz, now, 0.02);
        ap2.frequency.setTargetAtTime(baseHz * 1.4, now, 0.02);
        ap3.frequency.setTargetAtTime(baseHz * 1.9, now, 0.02);
        lfo.frequency.setTargetAtTime(Math.max(0.1, Math.min(8, Number(s.params.rateHz ?? 0.9))), now, 0.02);
        lfoGain.gain.setTargetAtTime(Math.max(50, Math.min(2500, Number(s.params.depthHz ?? 900))), now, 0.02);
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          lfo.stop();
          lfo.disconnect();
          lfoGain.disconnect();
          ap1.disconnect();
          ap2.disconnect();
          ap3.disconnect();
        } catch {
          // ignore
        }
      };
    } else if (slot.type === 'bitcrush') {
      const shaper = ctx.createWaveShaper();
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      entry.connect(shaper);
      shaper.connect(tone);
      tone.connect(wetGain);

      let lastBits = -1;
      updateParams = (s, c) => {
        const now = c.currentTime;
        const wet = s.enabled ? Math.max(0, Math.min(1, s.mix)) : 0;
        dryGain.gain.setTargetAtTime(1 - wet, now, 0.015);
        wetGain.gain.setTargetAtTime(wet, now, 0.015);
        const bits = Number(s.params.bits ?? 5);
        if (Math.abs(bits - lastBits) >= 0.5) {
          lastBits = bits;
          shaper.curve = makeBitcrushCurve(bits);
        }
        tone.frequency.setTargetAtTime(
          Math.max(600, Math.min(14000, Number(s.params.toneHz ?? 5500))),
          now,
          0.02
        );
      };
      const baseClean = cleanup;
      cleanup = () => {
        baseClean();
        try {
          shaper.disconnect();
          tone.disconnect();
        } catch {
          // ignore
        }
      };
    }

    updateParams(slot, ctx);
    return {
      slotId: slot.id,
      type: slot.type,
      dryGain,
      wetGain,
      cleanup,
      updateParams,
      entry,
      exit,
    };
  }

  private syncBus(busData: MixerBusData): void {
    if (!this.ctx) return;
    const graph = this.ensureBusGraph(busData.id);

    const now = this.ctx.currentTime;
    const targetGain = busData.muted ? 0 : Math.max(0, Math.min(1.5, busData.volume));
    graph.output.gain.setTargetAtTime(targetGain, now, 0.015);

    const newSig = busData.fxSlots.map((s) => `${s.id}:${s.type}`).join('|');
    if (newSig !== graph.signature) {
      // Rebuild serial chain cleanly
      graph.input.disconnect();
      for (const old of graph.slots) old.cleanup();
      graph.slots = [];
      graph.signature = newSig;

      let prev: AudioNode = graph.input;
      for (const slot of busData.fxSlots) {
        const built = this.buildSlotChain(slot);
        prev.connect(built.entry);
        prev = built.exit;
        graph.slots.push(built);
      }
      prev.connect(graph.output);
    } else {
      // Fast live param update without rebuilding graph
      for (let i = 0; i < busData.fxSlots.length; i++) {
        graph.slots[i]?.updateParams(busData.fxSlots[i], this.ctx);
      }
    }
  }

  hydrateMixer(
    fingerMixer: Record<number, FingerMixerChannel>,
    mixerBuses: Record<BusId, MixerBusData>
  ): void {
    for (let i = 0; i < 10; i++) {
      if (fingerMixer[i]) {
        this.fingerMixer.set(i as FingerId, { ...fingerMixer[i] });
      }
    }
    this.mixerBusesData = mixerBuses;
    if (this.ctx) {
      this.applyAllBuses(mixerBuses);
    }
  }

  private applyAllBuses(mixerBuses: Record<BusId, MixerBusData>): void {
    for (const bus of Object.values(mixerBuses)) {
      if (bus) {
        this.syncBus(bus);
      }
    }
  }

  getBusPeakDb(busId: BusId): number {
    const graph = this.liveBuses.get(busId);
    if (!graph) return -60;
    graph.analyser.getFloatTimeDomainData(graph.meterBuf);
    let maxAbs = 0;
    for (let i = 0; i < graph.meterBuf.length; i++) {
      const a = Math.abs(graph.meterBuf[i]);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs < 0.0005) return -60;
    const db = 20 * Math.log10(maxAbs);
    return Math.max(-60, Math.min(6, db));
  }

  getFingerPeakDb(fingerId: FingerId): number {
    const st = this.fingerPeakState.get(fingerId);
    if (!st) return -60;
    const ageSec = (performance.now() - st.timeMs) / 1000;
    const decayed = st.peak * Math.exp(-ageSec * 7.5);
    if (decayed < 0.001) return -60;
    const db = 20 * Math.log10(decayed);
    return Math.max(-60, Math.min(6, db));
  }

  updateFingerChannel(fingerId: FingerId, channel: FingerMixerChannel): void {
    this.fingerMixer.set(fingerId, { ...channel });
  }

  updateBus(busData: MixerBusData): void {
    if (!this.mixerBusesData) {
      this.mixerBusesData = {
        master: busData,
        bus1: busData,
        bus2: busData,
        bus3: busData,
      };
    }
    this.mixerBusesData[busData.id] = busData;
    if (this.ctx) {
      this.syncBus(busData);
    }
  }

  getMasterGain(): GainNode {
    this.ensureContext();
    return this.masterGain!;
  }

  getContext(): AudioContext {
    return this.ensureContext();
  }

  getCurrentTime(): number {
    return this.ensureContext().currentTime;
  }

  getSampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  getAudioStream(): MediaStream {
    this.ensureContext();
    return this.streamDest!.stream;
  }

  setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.01);
    }
  }

  setBuffer(fingerId: FingerId, buffer: AudioBuffer): void {
    this.buffers.set(fingerId, buffer);
  }

  hasBuffer(fingerId: FingerId): boolean {
    return this.buffers.has(fingerId);
  }

  async decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const copy = arrayBuffer.slice(0);
    return ctx.decodeAudioData(copy);
  }

  async assignSynthToSlot(
    fingerId: FingerId,
    seed: number,
    forcedType?: SynthPresetType
  ): Promise<GeneratedSynthResult> {
    const res = await SynthGenerator.generate(seed, forcedType, this.getSampleRate());
    this.buffers.set(fingerId, res.buffer);
    return res;
  }

  trigger(fingerId: FingerId, velocity = 0.85, when = 0): void {
    const ctx = this.ensureContext();
    const buffer = this.buffers.get(fingerId);
    if (!buffer || !this.masterGain) return;

    const ch = this.fingerMixer.get(fingerId);
    if (ch?.muted) return;
    const chVol = ch ? ch.volume : 1.0;
    if (chVol <= 0.005) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const clampedVel = Math.max(0.05, Math.min(1.5, velocity * chVol));
    const targetTime = when > 0 ? when : ctx.currentTime;
    gain.gain.setValueAtTime(clampedVel, targetTime);

    this.fingerPeakState.set(fingerId, { peak: clampedVel, timeMs: performance.now() });

    const busGraph = this.liveBuses.get(ch?.bus ?? 'master') ?? this.liveBuses.get('master');
    source.connect(gain);
    gain.connect(busGraph ? busGraph.input : this.masterGain);
    source.start(targetTime);
  }

  setOneHitBuffer(padId: number, buffer: AudioBuffer): void {
    this.oneHitBuffers.set(padId, buffer);
  }

  async assignSynthToOneHit(
    padId: number,
    seed: number,
    forcedType?: SynthPresetType
  ): Promise<GeneratedSynthResult> {
    const res = await SynthGenerator.generate(seed, forcedType, this.getSampleRate());
    this.oneHitBuffers.set(padId, res.buffer);
    return res;
  }

  triggerOneHit(padId: number, velocity = 0.92, when = 0): void {
    const ctx = this.ensureContext();
    const buffer = this.oneHitBuffers.get(padId);
    if (!buffer || !this.masterGain) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const clampedVel = Math.max(0.15, Math.min(1.0, velocity));
    const targetTime = when > 0 ? when : ctx.currentTime;
    gain.gain.setValueAtTime(clampedVel, targetTime);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(targetTime);
  }
}
