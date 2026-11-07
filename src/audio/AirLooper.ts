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

  // BPM & Musical timing
  private bpm = 120;
  private loopStartTime = 0;

  // Drum Phrase & Looper State
  private pendingDrumHits: Array<{ fingerId: FingerId; velocity: number; timeSec: number }> = [];
  private drumHits: DrumLoopHit[] = [];
  private drumIsPlaying = false;
  private lastScheduledPhase = 0;
  private drumPhraseStartTime = 0;
  private lastDrumHitTime = 0;
  private activeDrumLoopDuration = 2.0;

  // Synth Phrase & Looper State
  private synthLayers: ActiveSynthLayer[] = [];
  private synthPhraseStartTime = 0;
  private lastSynthActiveTime = 0;
  private synthIsCapturing = false;
  private activeSynthLoopDuration = 2.0;

  init(ctx: AudioContext, audioEngine: AudioEngine, masterDestination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.audioEngine = audioEngine;
    this.masterDestination = masterDestination;

    // Allocate 12 seconds circular buffer at current sample rate
    const sr = ctx.sampleRate;
    this.bufferCapacitySamples = sr * 12;
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

    // Connect: input -> recorderNode -> dummy silence output
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
    return this.activeDrumLoopDuration;
  }

  getCurrentPhase(): number {
    if (!this.ctx) return 0;
    const dur = this.activeDrumLoopDuration || 2.0;
    const elapsed = this.ctx.currentTime - this.loopStartTime;
    return ((elapsed % dur) + dur) % dur;
  }

  /**
   * Plays an immediate sci-fi feedback chime tone when a swipe succeeds
   */
  playSwipeChime(type: 'drum' | 'synth'): void {
    if (!this.ctx || !this.masterDestination) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.masterDestination);

      if (type === 'drum') {
        // Upbeat punchy confirmation blip
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.24);
      } else {
        // Ethereal ascending crystal chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(783.99, now + 0.07); // G5
        osc.frequency.setValueAtTime(1046.5, now + 0.14); // C6
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.start(now);
        osc.stop(now + 0.34);
      }
    } catch (err) {
      console.warn('Swipe chime warning:', err);
    }
  }

  // ==================== DRUM LOOPER (5-SEC PHRASE CAPTURE) ====================

  /**
   * Called on every drum tap (Left Hand).
   * Automatically starts a new phrase if idle for more than 5 seconds.
   */
  recordDrumHit(fingerId: FingerId, velocity: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // If more than 5.0 seconds passed since the last hit, reset to a fresh phrase
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
   * Commits the recorded drum phrase to an ongoing loop.
   * If a loop is already playing, overdubs the new hits into the current loop cycle!
   */
  commitDrumLoop(): { addedCount: number; totalCount: number; durationSec: number } {
    if (!this.ctx) {
      return { addedCount: 0, totalCount: 0, durationSec: 0 };
    }

    try {
      const now = this.ctx.currentTime;
      if (this.pendingDrumHits.length === 0) {
        return {
          addedCount: 0,
          totalCount: this.drumHits.length,
          durationSec: this.activeDrumLoopDuration,
        };
      }

      // Play feedback audio cue
      this.playSwipeChime('drum');

      const beatSec = 60 / this.bpm;

      if (!this.drumIsPlaying) {
        // First loop creation: dynamically compute loop duration from actual phrase!
        const phraseDuration = Math.max(0.6, now - this.drumPhraseStartTime);
        // Snap to musical beats (min 2 beats)
        let beats = Math.max(2, Math.round(phraseDuration / beatSec));
        if (beats === 3) beats = 4;
        else if (beats >= 5 && beats <= 7) beats = 8;
        else if (beats >= 9 && beats <= 14) beats = 16;

        this.activeDrumLoopDuration = beats * beatSec;
        this.loopStartTime = this.drumPhraseStartTime;
        this.drumHits = [];
        this.lastScheduledPhase = 0;
        this.drumIsPlaying = true;
      }

      const dur = this.activeDrumLoopDuration;
      let addedCount = 0;

      for (const hit of this.pendingDrumHits) {
        const phase = ((hit.timeSec - this.loopStartTime) % dur + dur) % dur;
        this.drumHits.push({
          fingerId: hit.fingerId,
          velocity: hit.velocity,
          phaseSec: phase,
        });
        addedCount++;
      }

      this.pendingDrumHits = [];
      return {
        addedCount,
        totalCount: this.drumHits.length,
        durationSec: this.activeDrumLoopDuration,
      };
    } catch (err) {
      console.error('commitDrumLoop hatası:', err);
      return {
        addedCount: 0,
        totalCount: this.drumHits.length,
        durationSec: this.activeDrumLoopDuration,
      };
    }
  }

  clearDrumLoop(): void {
    this.drumHits = [];
    this.pendingDrumHits = [];
    this.drumIsPlaying = false;
    this.drumPhraseStartTime = 0;
    this.lastDrumHitTime = 0;
  }

  // ==================== SYNTH LOOPER (5-SEC PHRASE CAPTURE) ====================

  /**
   * Called while Theremin is actively sounding (fist closed).
   * Automatically marks phrase start and tracks activity.
   */
  markSynthActive(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // If more than 5.0 seconds passed since last sound, start a fresh phrase
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
   * Commits the recently played Theremin phrase as a looping audio layer.
   * Can be called multiple times to overdub and stack harmonies!
   */
  commitSynthLoop(): { layerIndex: number; totalLayers: number; durationSec: number } {
    if (
      !this.ctx ||
      !this.masterDestination ||
      !this.circularBufferL ||
      !this.circularBufferR
    ) {
      return { layerIndex: 0, totalLayers: 0, durationSec: 0 };
    }

    try {
      const now = this.ctx.currentTime;
      const timeSinceActive = now - this.lastSynthActiveTime;

      // Check if user played synth within the last 6 seconds
      if (this.synthPhraseStartTime === 0 || timeSinceActive > 6.0) {
        return {
          layerIndex: 0,
          totalLayers: this.synthLayers.length,
          durationSec: this.activeSynthLoopDuration,
        };
      }

      // Play feedback audio cue
      this.playSwipeChime('synth');

      const beatSec = 60 / this.bpm;
      const phraseDuration = Math.max(0.8, now - this.synthPhraseStartTime);

      // Snap to musical beats
      let beats = Math.max(2, Math.round(phraseDuration / beatSec));
      if (beats === 3) beats = 4;
      else if (beats >= 5 && beats <= 7) beats = 8;
      else if (beats >= 9 && beats <= 14) beats = 16;

      const dur = beats * beatSec;
      this.activeSynthLoopDuration = dur;

      const sr = this.ctx.sampleRate;
      const numSamples = Math.floor(dur * sr);
      const cap = this.bufferCapacitySamples;

      // Create an AudioBuffer for this layer
      const layerBuffer = this.ctx.createBuffer(2, numSamples, sr);
      const outL = layerBuffer.getChannelData(0);
      const outR = layerBuffer.getChannelData(1);

      const startIdx = (this.writeIndex - numSamples + cap) % cap;

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

      // Create looping source node
      const source = this.ctx.createBufferSource();
      source.buffer = layerBuffer;
      source.loop = true;

      const layerGain = this.ctx.createGain();
      layerGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      source.connect(layerGain);
      layerGain.connect(this.masterDestination);

      // Safe offset strictly clamped within [0, bufferDuration - 0.02]
      const currentPhase = this.getCurrentPhase();
      const bufferDuration = layerBuffer.duration;
      let safeOffset = 0;
      if (bufferDuration > 0.05) {
        safeOffset = (currentPhase % bufferDuration + bufferDuration) % bufferDuration;
        safeOffset = Math.max(0, Math.min(bufferDuration - 0.02, safeOffset));
      }

      try {
        source.start(this.ctx.currentTime, safeOffset);
      } catch {
        source.start(this.ctx.currentTime);
      }

      this.synthLayers.push({
        source,
        gain: layerGain,
        buffer: layerBuffer,
      });

      // Reset phrase start for next overdub layer
      this.synthPhraseStartTime = now;

      return {
        layerIndex: this.synthLayers.length,
        totalLayers: this.synthLayers.length,
        durationSec: dur,
      };
    } catch (err) {
      console.error('commitSynthLoop hatası:', err);
      return {
        layerIndex: 0,
        totalLayers: this.synthLayers.length,
        durationSec: this.activeSynthLoopDuration,
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
  }

  clearAll(): void {
    this.clearDrumLoop();
    this.clearSynthLoop();
  }

  /**
   * Scheduled on every animation frame to trigger drum loop hits in sync
   */
  update(): void {
    if (!this.ctx || !this.audioEngine || !this.drumIsPlaying || this.drumHits.length === 0) {
      return;
    }

    try {
      const currentPhase = this.getCurrentPhase();
      const prevPhase = this.lastScheduledPhase;
      const wrapped = currentPhase < prevPhase;

      for (const hit of this.drumHits) {
        const p = hit.phaseSec;
        let shouldTrigger = false;

        if (!wrapped) {
          if (p >= prevPhase && p < currentPhase) {
            shouldTrigger = true;
          }
        } else {
          if (p >= prevPhase || p < currentPhase) {
            shouldTrigger = true;
          }
        }

        if (shouldTrigger) {
          this.audioEngine.trigger(hit.fingerId, hit.velocity);
        }
      }

      this.lastScheduledPhase = currentPhase;
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
}
