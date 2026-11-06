import { FingerId, SynthPresetType } from '../types';
import { SynthGenerator, GeneratedSynthResult } from './SynthGenerator';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private buffers = new Map<FingerId, AudioBuffer>();
  private masterVolume = 0.85;

  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;

      this.streamDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.connect(this.streamDest);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
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
    // Clone buffer so original ArrayBuffer stays intact for IndexedDB storage
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

  trigger(fingerId: FingerId, velocity = 0.85): void {
    const ctx = this.ensureContext();
    const buffer = this.buffers.get(fingerId);
    if (!buffer || !this.masterGain) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const clampedVel = Math.max(0.12, Math.min(1.0, velocity));
    gain.gain.setValueAtTime(clampedVel, ctx.currentTime);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(0);
  }
}
