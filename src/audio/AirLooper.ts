import { FingerId, LooperStatus } from '../types';
import { AudioEngine } from './AudioEngine';

interface DrumLoopHit {
  fingerId: FingerId;
  velocity: number;
  phaseSec: number; // offset from 0 to loopDurationSec
}

interface ActiveSynthLayer {
  source: AudioBufferSourceNode;
  gain: GainNode;
  buffer: AudioBuffer;
}

export class AirLooper {
  private ctx: AudioContext | null = null;
  private audioEngine: AudioEngine | null = null;
  private masterDestination: AudioNode | null = null;

  // Audio capture from Theremin
  private recorderNode: ScriptProcessorNode | null = null;
  private recordInputGain: GainNode | null = null;
  private circularBufferL: Float32Array | null = null;
  private circularBufferR: Float32Array | null = null;
  private writeIndex = 0;
  private bufferCapacitySamples = 0;

  // BPM & Cycle
  private bpm = 120;
  private barsCount = 2; // 2 bars = 8 beats
  private loopStartTime = 0;

  // Drum Looper State
  private pendingDrumHits: Array<{ fingerId: FingerId; velocity: number; timeSec: number }> = [];
  private drumHits: DrumLoopHit[] = [];
  private drumIsPlaying = false;
  private lastScheduledPhase = 0;

  // Synth Looper State
  private synthLayers: ActiveSynthLayer[] = [];

  init(ctx: AudioContext, audioEngine: AudioEngine, masterDestination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.audioEngine = audioEngine;
    this.masterDestination = masterDestination;

    // Allocate 10 seconds circular buffer at current sample rate
    const sr = ctx.sampleRate;
    this.bufferCapacitySamples = sr * 10;
    this.circularBufferL = new Float32Array(this.bufferCapacitySamples);
    this.circularBufferR = new Float32Array(this.bufferCapacitySamples);
    this.writeIndex = 0;

    // Input gain for recording live theremin
    this.recordInputGain = ctx.createGain();
    this.recordInputGain.gain.value = 1.0;

    // ScriptProcessor to capture audio PCM frames into circular buffer
    this.recorderNode = ctx.createScriptProcessor(4096, 2, 2);
    this.recorderNode.onaudioprocess = (e) => {
      const inputL = e.inputBuffer.getChannelData(0);
      const inputR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inputL;
      const len = inputL.length;

      const bufL = this.circularBufferL;
      const bufR = this.circularBufferR;
      const cap = this.bufferCapacitySamples;
      if (!bufL || !bufR) return;

      let w = this.writeIndex;
      for (let i = 0; i < len; i++) {
        bufL[w] = inputL[i];
        bufR[w] = inputR[i];
        w = (w + 1) % cap;
      }
      this.writeIndex = w;
    };

    // Connect: input -> recorderNode -> dummy output to keep script processor alive
    const dummySilence = ctx.createGain();
    dummySilence.gain.value = 0;
    this.recordInputGain.connect(this.recorderNode);
    this.recorderNode.connect(dummySilence);
    dummySilence.connect(ctx.destination);

    this.loopStartTime = ctx.currentTime;
  }

  getRecordInputNode(): GainNode | null {
    return this.recordInputGain;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  getLoopDurationSec(): number {
    // 2 bars in 4/4 = 8 beats
    return (this.barsCount * 4 * 60) / this.bpm;
  }

  getCurrentPhase(): number {
    if (!this.ctx) return 0;
    const dur = this.getLoopDurationSec();
    const elapsed = this.ctx.currentTime - this.loopStartTime;
    return ((elapsed % dur) + dur) % dur;
  }

  // ==================== DRUM LOOPER ====================

  recordDrumHit(fingerId: FingerId, velocity: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.pendingDrumHits.push({ fingerId, velocity, timeSec: now });

    // Keep pending buffer within last 6 seconds
    const cutoff = now - 6;
    this.pendingDrumHits = this.pendingDrumHits.filter((h) => h.timeSec >= cutoff);
  }

  /**
   * Called when Left Hand swipes Left:
   * Commits recorded drum hits to loop, or overdubs if loop is already playing.
   */
  commitDrumLoop(): { addedCount: number; totalCount: number } {
    if (!this.ctx) return { addedCount: 0, totalCount: 0 };

    const dur = this.getLoopDurationSec();
    const now = this.ctx.currentTime;
    const windowStart = now - dur;

    // Extract hits from the last cycle window
    const newHits = this.pendingDrumHits.filter((h) => h.timeSec >= windowStart);

    if (!this.drumIsPlaying) {
      this.loopStartTime = now;
      this.lastScheduledPhase = 0;
      this.drumIsPlaying = true;
      this.drumHits = [];
    }

    // Convert hits to phase offsets
    for (const hit of newHits) {
      const phase = ((hit.timeSec - this.loopStartTime) % dur + dur) % dur;
      this.drumHits.push({
        fingerId: hit.fingerId,
        velocity: hit.velocity,
        phaseSec: phase,
      });
    }

    // Clear pending so we don't duplicate on next swipe
    this.pendingDrumHits = [];

    return { addedCount: newHits.length, totalCount: this.drumHits.length };
  }

  clearDrumLoop(): void {
    this.drumHits = [];
    this.pendingDrumHits = [];
    this.drumIsPlaying = false;
  }

  // ==================== SYNTH LOOPER ====================

  markSynthActive(): void {
    // Activity marker
  }

  /**
   * Called when Right Hand swipes Right:
   * Slices the last loop bar from circular buffer and overdubs it as a looping layer.
   */
  commitSynthLoop(): { layerIndex: number; totalLayers: number } {
    if (
      !this.ctx ||
      !this.masterDestination ||
      !this.circularBufferL ||
      !this.circularBufferR
    ) {
      return { layerIndex: 0, totalLayers: 0 };
    }

    const dur = this.getLoopDurationSec();
    const sr = this.ctx.sampleRate;
    const numSamples = Math.floor(dur * sr);
    const cap = this.bufferCapacitySamples;

    // Create an AudioBuffer for the layer
    const layerBuffer = this.ctx.createBuffer(2, numSamples, sr);
    const outL = layerBuffer.getChannelData(0);
    const outR = layerBuffer.getChannelData(1);

    // Read the last `numSamples` backwards from writeIndex
    const startIdx = (this.writeIndex - numSamples + cap) % cap;

    for (let i = 0; i < numSamples; i++) {
      const idx = (startIdx + i) % cap;
      outL[i] = this.circularBufferL[idx];
      outR[i] = this.circularBufferR[idx];
    }

    // 12ms crossfade at loop boundary to guarantee zero click/pop
    const crossfadeSamples = Math.min(Math.floor(sr * 0.012), Math.floor(numSamples * 0.1));
    for (let i = 0; i < crossfadeSamples; i++) {
      const t = i / crossfadeSamples; // 0 to 1
      // Head fades in
      outL[i] *= t;
      outR[i] *= t;
      // Tail fades out
      const tailIdx = numSamples - 1 - i;
      outL[tailIdx] *= t;
      outR[tailIdx] *= t;
    }

    // Create looping source node
    const source = this.ctx.createBufferSource();
    source.buffer = layerBuffer;
    source.loop = true;

    const layerGain = this.ctx.createGain();
    layerGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    source.connect(layerGain);
    layerGain.connect(this.masterDestination);

    // Calculate current loop phase so new layer starts in lockstep
    const currentPhase = this.getCurrentPhase();
    source.start(this.ctx.currentTime, currentPhase);

    this.synthLayers.push({
      source,
      gain: layerGain,
      buffer: layerBuffer,
    });

    return {
      layerIndex: this.synthLayers.length,
      totalLayers: this.synthLayers.length,
    };
  }

  clearSynthLoop(): void {
    for (const layer of this.synthLayers) {
      try {
        layer.source.stop();
        layer.source.disconnect();
        layer.gain.disconnect();
      } catch {
        // ignore
      }
    }
    this.synthLayers = [];
  }

  clearAll(): void {
    this.clearDrumLoop();
    this.clearSynthLoop();
  }

  /**
   * Scheduled on every animation frame to trigger drum loop hits
   */
  update(): void {
    if (!this.ctx || !this.audioEngine || !this.drumIsPlaying || this.drumHits.length === 0) {
      return;
    }

    const currentPhase = this.getCurrentPhase();
    const prevPhase = this.lastScheduledPhase;

    // Check if phase wrapped around
    const wrapped = currentPhase < prevPhase;

    for (const hit of this.drumHits) {
      const p = hit.phaseSec;
      let shouldTrigger = false;

      if (!wrapped) {
        if (p >= prevPhase && p < currentPhase) {
          shouldTrigger = true;
        }
      } else {
        // Wrapped around loop boundary
        if (p >= prevPhase || p < currentPhase) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        this.audioEngine.trigger(hit.fingerId, hit.velocity);
      }
    }

    this.lastScheduledPhase = currentPhase;
  }

  getStatus(): LooperStatus {
    return {
      synthLayersCount: this.synthLayers.length,
      synthIsPlaying: this.synthLayers.length > 0,
      drumEventsCount: this.drumHits.length,
      drumIsPlaying: this.drumIsPlaying,
    };
  }
}
