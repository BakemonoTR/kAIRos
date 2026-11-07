import { FingerId, LivePhraseMetrics, LooperStatus } from '../types';
import { AudioEngine } from './AudioEngine';

interface DrumLoopHit {
  fingerId: FingerId;
  velocity: number;
  phaseSec: number; // offset from 0 to masterLoopDuration
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

  // BPM & Unified Master Loop Timing (4 / 8 / 12 / 16 bars grid)
  private bpm = 120;
  private masterLoopDuration = 0; // 0 = not yet established
  private masterLoopStartTime = 0;

  // Drum Phrase & Looper State
  private pendingDrumHits: Array<{ fingerId: FingerId; velocity: number; timeSec: number }> = [];
  private drumHits: DrumLoopHit[] = [];
  private drumIsPlaying = false;
  private nextScheduleTime = 0;
  private drumPhraseStartTime = 0;
  private lastDrumHitTime = 0;

  // Synth Phrase & Looper State
  private synthLayers: ActiveSynthLayer[] = [];
  private synthPhraseStartTime = 0;
  private lastSynthActiveTime = 0;
  private synthIsCapturing = false;

  init(ctx: AudioContext, audioEngine: AudioEngine, masterDestination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.audioEngine = audioEngine;
    this.masterDestination = masterDestination;

    // Allocate 16 seconds circular buffer at current sample rate (supports up to 4 bars at 60 bpm)
    const sr = ctx.sampleRate;
    this.bufferCapacitySamples = sr * 16;
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

    const dummySilence = ctx.createGain();
    dummySilence.gain.value = 0;
    this.recordInputGain.connect(this.recorderNode);
    this.recorderNode.connect(dummySilence);
    dummySilence.connect(ctx.destination);

    this.masterLoopStartTime = ctx.currentTime;
  }

  getRecordInputNode(): GainNode | null {
    return this.recordInputGain;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  getBeatSec(): number {
    return 60 / this.bpm;
  }

  getLoopDurationSec(): number {
    return this.masterLoopDuration || this.getBeatSec() * 4;
  }

  getCurrentPhase(): number {
    if (!this.ctx) return 0;
    const dur = this.masterLoopDuration || this.getBeatSec() * 4;
    const elapsed = this.ctx.currentTime - this.masterLoopStartTime;
    return ((elapsed % dur) + dur) % dur;
  }

  isMasterLoopActive(): boolean {
    return this.drumIsPlaying || this.synthLayers.length > 0;
  }

  /**
   * Quantizes elapsed beats in strict 2-beat increments (2, 4, 6, 8, 10, 12, 16... beats):
   * <= 2 beats -> 2 beats (half bar)
   * 2 < beats <= 4 -> 4 beats (1 bar)
   * 4 < beats <= 6 -> 6 beats
   * 6 < beats <= 8 -> 8 beats (2 bars)
   * 8 < beats <= 10 -> 10 beats
   * 10 < beats <= 12 -> 12 beats (3 bars)
   * 12 < beats <= 16 -> 16 beats (4 bars)
   */
  calculateQuantizedBeats(rawElapsedBeats: number): number {
    // 0.25 beat tolerance for natural end-of-phrase release
    const effectiveBeats = Math.max(0.4, rawElapsedBeats - 0.25);
    const quantizedBeats = Math.max(2, Math.ceil(effectiveBeats / 2) * 2);
    return quantizedBeats;
  }

  playSwipeChime(type: 'drum' | 'synth'): void {
    if (!this.ctx || !this.masterDestination) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.masterDestination);

      if (type === 'drum') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.24);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(783.99, now + 0.07);
        osc.frequency.setValueAtTime(1046.5, now + 0.14);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.start(now);
        osc.stop(now + 0.34);
      }
    } catch (err) {
      console.warn('Swipe chime warning:', err);
    }
  }

  // ==================== DRUM LOOPER ====================

  recordDrumHit(fingerId: FingerId, velocity: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Reset phrase if more than 5.0 seconds of silence elapsed
    if (this.pendingDrumHits.length === 0 || now - this.lastDrumHitTime > 5.0) {
      this.drumPhraseStartTime = now;
      this.pendingDrumHits = [];
    }

    this.pendingDrumHits.push({ fingerId, velocity, timeSec: now });
    this.lastDrumHitTime = now;
  }

  isDrumCapturing(): boolean {
    if (!this.ctx) return false;
    return this.pendingDrumHits.length > 0 && this.ctx.currentTime - this.lastDrumHitTime <= 5.0;
  }

  getPendingDrumCount(): number {
    return this.pendingDrumHits.length;
  }

  /**
   * Commits the recorded drum hits into the master loop grid.
   * If master loop already exists (e.g. 8 beats), stays in that exact pattern time!
   */
  commitDrumLoop(): { addedCount: number; totalCount: number; durationSec: number; beatsCount: number } {
    if (!this.ctx) {
      return { addedCount: 0, totalCount: 0, durationSec: 0, beatsCount: 4 };
    }

    try {
      const now = this.ctx.currentTime;

      // Prune accidental hits caused by rapid hand flick during the swipe gesture (last 120ms only)
      // Keeps genuine final drum hits played right before the swipe intact
      const swipeWindowCutoff = now - 0.12;
      this.pendingDrumHits = this.pendingDrumHits.filter((h) => h.timeSec < swipeWindowCutoff);

      if (this.pendingDrumHits.length === 0) {
        return {
          addedCount: 0,
          totalCount: this.drumHits.length,
          durationSec: this.getLoopDurationSec(),
          beatsCount: Math.round(this.getLoopDurationSec() / this.getBeatSec()),
        };
      }

      this.playSwipeChime('drum');
      const beatSec = this.getBeatSec();
      let targetDur: number;

      const rawBeats = Math.max(0.4, (now - this.drumPhraseStartTime) / beatSec);
      const phraseBeats = this.calculateQuantizedBeats(rawBeats);
      const phraseDur = phraseBeats * beatSec;

      if (this.isMasterLoopActive() && this.masterLoopDuration > 0) {
        // Master loop already exists (e.g. from synth or prior loop)
        const masterBeats = Math.round(this.masterLoopDuration / beatSec);
        if (rawBeats <= masterBeats + 0.25) {
          targetDur = this.masterLoopDuration;
        } else {
          const qBeats = this.calculateQuantizedBeats(rawBeats);
          targetDur = Math.max(this.masterLoopDuration, qBeats * beatSec);
          this.masterLoopDuration = targetDur;
        }
      } else {
        // First loop establishes master grid
        targetDur = phraseDur;
        this.masterLoopDuration = targetDur;
        this.masterLoopStartTime = this.drumPhraseStartTime;
      }

      if (!this.drumIsPlaying) {
        this.drumHits = [];
        this.drumIsPlaying = true;
      }

      const dur = this.masterLoopDuration;
      let addedCount = 0;

      // Map pending hits onto loop grid.
      // If the recorded drum phrase is shorter than the master loop duration (e.g. 2-beat groove in a 4 or 8-beat song),
      // tile the groove across the entire master duration so drums NEVER stop playing!
      const stepDur = Math.min(phraseDur, dur);

      for (const hit of this.pendingDrumHits) {
        const basePhase = ((hit.timeSec - this.masterLoopStartTime) % stepDur + stepDur) % stepDur;
        for (let offset = basePhase; offset < dur - 0.01; offset += stepDur) {
          this.drumHits.push({
            fingerId: hit.fingerId,
            velocity: hit.velocity,
            phaseSec: offset,
          });
          addedCount++;
        }
      }

      this.pendingDrumHits = [];
      this.nextScheduleTime = now;
      const beatsCount = Math.round(dur / beatSec);

      return {
        addedCount,
        totalCount: this.drumHits.length,
        durationSec: dur,
        beatsCount,
      };
    } catch (err) {
      console.error('commitDrumLoop hatası:', err);
      return {
        addedCount: 0,
        totalCount: this.drumHits.length,
        durationSec: this.getLoopDurationSec(),
        beatsCount: 4,
      };
    }
  }

  clearDrumLoop(): void {
    this.drumHits = [];
    this.pendingDrumHits = [];
    this.drumIsPlaying = false;
    this.drumPhraseStartTime = 0;
    this.lastDrumHitTime = 0;
    this.nextScheduleTime = 0;
    if (this.synthLayers.length === 0) {
      this.masterLoopDuration = 0;
      this.masterLoopStartTime = 0;
    }
  }

  // ==================== SYNTH LOOPER ====================

  markSynthActive(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (!this.synthIsCapturing || now - this.lastSynthActiveTime > 5.0) {
      this.synthPhraseStartTime = now;
      this.synthIsCapturing = true;
    }
    this.lastSynthActiveTime = now;
  }

  isSynthCapturing(): boolean {
    if (!this.ctx) return false;
    return this.synthIsCapturing && this.ctx.currentTime - this.lastSynthActiveTime <= 5.0;
  }

  /**
   * Commits the synth phrase into the master loop grid.
   * If master loop already exists (e.g. 8 beats), records in sync with the full 8-beat pattern!
   */
  commitSynthLoop(): { layerIndex: number; totalLayers: number; durationSec: number; beatsCount: number } {
    if (
      !this.ctx ||
      !this.masterDestination ||
      !this.circularBufferL ||
      !this.circularBufferR
    ) {
      return { layerIndex: 0, totalLayers: 0, durationSec: 0, beatsCount: 4 };
    }

    try {
      const now = this.ctx.currentTime;
      const timeSinceActive = now - this.lastSynthActiveTime;

      if (this.synthPhraseStartTime === 0 || timeSinceActive > 6.0) {
        return {
          layerIndex: 0,
          totalLayers: this.synthLayers.length,
          durationSec: this.getLoopDurationSec(),
          beatsCount: Math.round(this.getLoopDurationSec() / this.getBeatSec()),
        };
      }

      this.playSwipeChime('synth');
      const beatSec = this.getBeatSec();
      const oldMasterDur = this.masterLoopDuration;
      let targetDur: number;

      const rawBeats = Math.max(0.4, (now - this.synthPhraseStartTime) / beatSec);

      if (this.isMasterLoopActive() && this.masterLoopDuration > 0) {
        // Master loop already exists! Lock to full master pattern
        const masterBeats = Math.round(this.masterLoopDuration / beatSec);
        if (rawBeats <= masterBeats + 0.25) {
          targetDur = this.masterLoopDuration;
        } else {
          const qBeats = this.calculateQuantizedBeats(rawBeats);
          targetDur = Math.max(this.masterLoopDuration, qBeats * beatSec);
          this.masterLoopDuration = targetDur;
        }
      } else {
        // First loop establishes master grid
        const qBeats = this.calculateQuantizedBeats(rawBeats);
        targetDur = qBeats * beatSec;
        this.masterLoopDuration = targetDur;
        const pruneSec = 0.15;
        this.masterLoopStartTime = now - pruneSec - targetDur;
      }

      // If master loop duration expanded, tile existing drum hits across the new duration so drums don't stop!
      if (this.drumHits.length > 0 && targetDur > oldMasterDur && oldMasterDur > 0) {
        const existingHits = [...this.drumHits];
        for (let t = oldMasterDur; t < targetDur - 0.01; t += oldMasterDur) {
          for (const h of existingHits) {
            this.drumHits.push({
              fingerId: h.fingerId,
              velocity: h.velocity,
              phaseSec: h.phaseSec + t,
            });
          }
        }
      }

      const dur = targetDur;
      const sr = this.ctx.sampleRate;
      const numSamples = Math.floor(dur * sr);
      const cap = this.bufferCapacitySamples;

      const layerBuffer = this.ctx.createBuffer(2, numSamples, sr);
      const outL = layerBuffer.getChannelData(0);
      const outR = layerBuffer.getChannelData(1);

      // Extract exactly one master cycle [phase 0.0 -> phase dur] from circular buffer
      // aligned to this.masterLoopStartTime so synth and drums are in 100% lockstep sync
      const pruneSec = 0.15;
      const audioEndTime = now - pruneSec;
      const T0 = this.masterLoopStartTime;

      const phaseAtAudioEnd = ((audioEndTime - T0) % dur + dur) % dur;
      const cycleEndTime = audioEndTime - phaseAtAudioEnd;
      const cycleStartTime = cycleEndTime - dur;

      const ageSec = Math.max(dur, now - cycleStartTime);
      const startIdx = (this.writeIndex - Math.floor(ageSec * sr) + cap) % cap;

      for (let i = 0; i < numSamples; i++) {
        const idx = (startIdx + i) % cap;
        outL[i] = this.circularBufferL[idx];
        outR[i] = this.circularBufferR[idx];
      }

      // 15ms crossfade at loop seam
      const crossfadeSamples = Math.min(Math.floor(sr * 0.015), Math.floor(numSamples * 0.1));
      for (let i = 0; i < crossfadeSamples; i++) {
        const t = i / crossfadeSamples;
        outL[i] *= t;
        outR[i] *= t;
        const tailIdx = numSamples - 1 - i;
        outL[tailIdx] *= t;
        outR[tailIdx] *= t;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = layerBuffer;
      source.loop = true;

      const layerGain = this.ctx.createGain();
      layerGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      source.connect(layerGain);
      layerGain.connect(this.masterDestination);

      // Current master phase at this exact moment
      const currentPhase = ((now - T0) % dur + dur) % dur;
      const safeOffset = Math.max(0, Math.min(dur - 0.01, currentPhase));

      try {
        source.start(now, safeOffset);
      } catch {
        source.start(now);
      }

      this.synthLayers.push({
        source,
        gain: layerGain,
        buffer: layerBuffer,
      });

      this.synthPhraseStartTime = now;
      const beatsCount = Math.round(dur / beatSec);

      return {
        layerIndex: this.synthLayers.length,
        totalLayers: this.synthLayers.length,
        durationSec: dur,
        beatsCount,
      };
    } catch (err) {
      console.error('commitSynthLoop hatası:', err);
      return {
        layerIndex: 0,
        totalLayers: this.synthLayers.length,
        durationSec: this.getLoopDurationSec(),
        beatsCount: 4,
      };
    }
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
    this.synthPhraseStartTime = 0;
    this.lastSynthActiveTime = 0;
    this.synthIsCapturing = false;
    if (!this.drumIsPlaying) {
      this.masterLoopDuration = 0;
      this.masterLoopStartTime = 0;
    }
  }

  clearAll(): void {
    this.clearDrumLoop();
    this.clearSynthLoop();
    this.masterLoopDuration = 0;
    this.masterLoopStartTime = 0;
    this.nextScheduleTime = 0;
  }

  update(): void {
    if (!this.ctx || !this.audioEngine || !this.drumIsPlaying || this.drumHits.length === 0) {
      return;
    }

    try {
      const now = this.ctx.currentTime;
      const dur = this.masterLoopDuration || this.getBeatSec() * 2;
      const T0 = this.masterLoopStartTime;

      if (this.nextScheduleTime < now) {
        this.nextScheduleTime = now;
      }

      // High-precision Web Audio lookahead scheduler (120ms window)
      const lookaheadSec = 0.12;
      const scheduleUntil = now + lookaheadSec;

      const startCycle = Math.floor((this.nextScheduleTime - T0) / dur);
      const endCycle = Math.floor((scheduleUntil - T0) / dur) + 1;

      for (let cycle = startCycle; cycle <= endCycle; cycle++) {
        const cycleStart = T0 + cycle * dur;
        for (const hit of this.drumHits) {
          const hitTime = cycleStart + hit.phaseSec;
          if (hitTime >= this.nextScheduleTime && hitTime < scheduleUntil) {
            this.audioEngine.trigger(hit.fingerId, hit.velocity, Math.max(now, hitTime));
          }
        }
      }

      this.nextScheduleTime = scheduleUntil;
    } catch (err) {
      console.warn('AirLooper update hatası:', err);
    }
  }

  getStatus(): LooperStatus {
    return {
      synthLayersCount: this.synthLayers.length,
      synthIsPlaying: this.synthLayers.length > 0,
      drumEventsCount: this.drumHits.length,
      drumIsPlaying: this.drumIsPlaying,
    };
  }

  getLivePhraseMetrics(): LivePhraseMetrics {
    const beatSec = this.getBeatSec();
    const now = this.ctx ? this.ctx.currentTime : 0;

    // Master loop phase
    const masterDuration = this.masterLoopDuration || beatSec * 4;
    const masterTotalBeats = Math.max(2, Math.round(masterDuration / beatSec));
    const masterBars = Math.max(1, Math.round(masterTotalBeats / 4));
    const masterPhaseSec = this.getCurrentPhase();
    const currentPhaseBeats = masterPhaseSec / beatSec;
    const masterBar = Math.floor(currentPhaseBeats / 4) + 1;
    const masterBeat = (Math.floor(currentPhaseBeats) % 4) + 1;

    // Drum phrase metrics
    let drumStatus: 'idle' | 'recording' | 'looping' = 'idle';
    let drumBar = 1;
    let drumBeat = 1;
    let drumTargetBeats = 2;
    let drumTargetBars = 1;
    let drumTotalBeats = masterTotalBeats;
    let drumTotalBars = masterBars;

    if (this.isDrumCapturing()) {
      drumStatus = 'recording';
      const elapsed = Math.max(0, now - this.drumPhraseStartTime);
      const elapsedBeats = elapsed / beatSec;
      drumBar = Math.floor(elapsedBeats / 4) + 1;
      drumBeat = (Math.floor(elapsedBeats) % 4) + 1;
      drumTargetBeats = this.calculateQuantizedBeats(elapsedBeats);
      drumTargetBars = Math.max(1, Math.round(drumTargetBeats / 4));
      drumTotalBeats = drumTargetBeats;
      drumTotalBars = drumTargetBars;
    } else if (this.drumIsPlaying) {
      drumStatus = 'looping';
      drumBar = masterBar;
      drumBeat = masterBeat;
      drumTotalBeats = masterTotalBeats;
      drumTotalBars = masterBars;
    }

    // Synth phrase metrics
    let synthStatus: 'idle' | 'recording' | 'looping' = 'idle';
    let synthBar = 1;
    let synthBeat = 1;
    let synthTargetBeats = 2;
    let synthTargetBars = 1;
    let synthTotalBeats = masterTotalBeats;
    let synthTotalBars = masterBars;

    if (this.isSynthCapturing()) {
      synthStatus = 'recording';
      const elapsed = Math.max(0, now - this.synthPhraseStartTime);
      const elapsedBeats = elapsed / beatSec;
      synthBar = Math.floor(elapsedBeats / 4) + 1;
      synthBeat = (Math.floor(elapsedBeats) % 4) + 1;
      synthTargetBeats = this.calculateQuantizedBeats(elapsedBeats);
      synthTargetBars = Math.max(1, Math.round(synthTargetBeats / 4));
      synthTotalBeats = synthTargetBeats;
      synthTotalBars = synthTargetBars;
    } else if (this.synthLayers.length > 0) {
      synthStatus = 'looping';
      synthBar = masterBar;
      synthBeat = masterBeat;
      synthTotalBeats = masterTotalBeats;
      synthTotalBars = masterBars;
    }

    return {
      bpm: this.bpm,
      drum: {
        status: drumStatus,
        bar: drumBar,
        beat: drumBeat,
        hitsCount: drumStatus === 'recording' ? this.pendingDrumHits.length : this.drumHits.length,
        targetBars: drumTargetBars,
        targetBeats: drumTargetBeats,
        totalBars: drumTotalBars,
        totalBeats: drumTotalBeats,
      },
      synth: {
        status: synthStatus,
        bar: synthBar,
        beat: synthBeat,
        layersCount: this.synthLayers.length,
        targetBars: synthTargetBars,
        targetBeats: synthTargetBeats,
        totalBars: synthTotalBars,
        totalBeats: synthTotalBeats,
      },
      master: {
        active: this.isMasterLoopActive(),
        bar: masterBar,
        beat: masterBeat,
        totalBars: masterBars,
        totalBeats: masterTotalBeats,
      },
    };
  }
}
