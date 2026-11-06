import { SynthPresetType } from '../types';

const PENTATONIC_FREQS = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.00, // A5
];

const PENTATONIC_NAMES = [
  'C4', 'D4', 'E4', 'G4', 'A4',
  'C5', 'D5', 'E5', 'G5', 'A5',
];

const PRESET_TYPES: SynthPresetType[] = ['kick', 'snare', 'hat', 'pluck', 'bell'];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoiseBuffer(ctx: BaseAudioContext, durationSec: number, rng: () => number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = rng() * 2 - 1;
  }
  return buffer;
}

export interface GeneratedSynthResult {
  buffer: AudioBuffer;
  synthType: SynthPresetType;
  label: string;
}

export class SynthGenerator {
  static pickRandomType(seed: number): SynthPresetType {
    const rng = mulberry32(seed);
    return PRESET_TYPES[Math.floor(rng() * PRESET_TYPES.length)];
  }

  static async generate(
    seed: number,
    forcedType?: SynthPresetType,
    sampleRate = 44100
  ): Promise<GeneratedSynthResult> {
    const rng = mulberry32(seed);
    const synthType = forcedType ?? PRESET_TYPES[Math.floor(rng() * PRESET_TYPES.length)];

    switch (synthType) {
      case 'kick':
        return this.renderKick(rng, sampleRate);
      case 'snare':
        return this.renderSnare(rng, sampleRate);
      case 'hat':
        return this.renderHat(rng, sampleRate);
      case 'pluck':
        return this.renderPluck(rng, sampleRate);
      case 'bell':
        return this.renderBell(rng, sampleRate);
    }
  }

  private static async renderKick(
    rng: () => number,
    sampleRate: number
  ): Promise<GeneratedSynthResult> {
    const duration = 0.42 + rng() * 0.18;
    const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);

    const startFreq = 135 + rng() * 65;
    const endFreq = 40 + rng() * 16;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, 0);
    osc.frequency.exponentialRampToValueAtTime(endFreq, 0.09 + rng() * 0.05);
    osc.frequency.exponentialRampToValueAtTime(endFreq * 0.85, duration);

    gain.gain.setValueAtTime(0.95, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    // Punch transient click
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(750 + rng() * 400, 0);
    clickOsc.frequency.exponentialRampToValueAtTime(90, 0.018);
    clickGain.gain.setValueAtTime(0.35, 0);
    clickGain.gain.exponentialRampToValueAtTime(0.001, 0.02);

    osc.connect(gain).connect(ctx.destination);
    clickOsc.connect(clickGain).connect(ctx.destination);

    osc.start(0);
    osc.stop(duration);
    clickOsc.start(0);
    clickOsc.stop(0.022);

    const buffer = await ctx.startRendering();
    return {
      buffer,
      synthType: 'kick',
      label: `Synth Kick (${Math.round(endFreq)}Hz)`,
    };
  }

  private static async renderSnare(
    rng: () => number,
    sampleRate: number
  ): Promise<GeneratedSynthResult> {
    const duration = 0.24 + rng() * 0.14;
    const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);

    // Filtered noise snap
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, duration, rng);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const centerFreq = 1400 + rng() * 1500;
    filter.frequency.setValueAtTime(centerFreq, 0);
    filter.Q.setValueAtTime(0.8 + rng() * 0.9, 0);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, 0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, duration);

    noise.connect(filter).connect(noiseGain).connect(ctx.destination);

    // Tonal body
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    const bodyFreq = 165 + rng() * 75;
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(bodyFreq * 1.4, 0);
    bodyOsc.frequency.exponentialRampToValueAtTime(bodyFreq, 0.05);

    bodyGain.gain.setValueAtTime(0.55, 0);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, 0.11);

    bodyOsc.connect(bodyGain).connect(ctx.destination);

    noise.start(0);
    bodyOsc.start(0);
    bodyOsc.stop(0.12);

    const buffer = await ctx.startRendering();
    return {
      buffer,
      synthType: 'snare',
      label: `Synth Snare (${Math.round(bodyFreq)}Hz)`,
    };
  }

  private static async renderHat(
    rng: () => number,
    sampleRate: number
  ): Promise<GeneratedSynthResult> {
    const isOpen = rng() > 0.68;
    const duration = isOpen ? 0.28 + rng() * 0.14 : 0.075 + rng() * 0.055;
    const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, duration, rng);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(6500 + rng() * 2800, 0);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.68, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    noise.connect(hp).connect(gain).connect(ctx.destination);
    noise.start(0);

    const buffer = await ctx.startRendering();
    return {
      buffer,
      synthType: 'hat',
      label: isOpen ? 'Synth Open Hat' : 'Synth Closed Hat',
    };
  }

  private static async renderPluck(
    rng: () => number,
    sampleRate: number
  ): Promise<GeneratedSynthResult> {
    const noteIdx = Math.floor(rng() * PENTATONIC_FREQS.length);
    const freq = PENTATONIC_FREQS[noteIdx];
    const noteName = PENTATONIC_NAMES[noteIdx];
    const duration = 0.45 + rng() * 0.25;

    const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(freq, 0);
    osc2.frequency.setValueAtTime(freq * 1.004, 0);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.4 + rng() * 2.5, 0);
    filter.frequency.setValueAtTime(Math.min(9000, freq * (7 + rng() * 4)), 0);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, duration * 0.75);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, 0);
    gain.gain.linearRampToValueAtTime(0.55, 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(ctx.destination);

    osc1.start(0);
    osc2.start(0);
    osc1.stop(duration);
    osc2.stop(duration);

    const buffer = await ctx.startRendering();
    return {
      buffer,
      synthType: 'pluck',
      label: `Synth Pluck (${noteName})`,
    };
  }

  private static async renderBell(
    rng: () => number,
    sampleRate: number
  ): Promise<GeneratedSynthResult> {
    const noteIdx = Math.floor(rng() * PENTATONIC_FREQS.length);
    const freq = PENTATONIC_FREQS[noteIdx];
    const noteName = PENTATONIC_NAMES[noteIdx];
    const duration = 0.65 + rng() * 0.35;

    const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);

    const ratios = [2.0, 3.0, 3.5, 4.0];
    const ratio = ratios[Math.floor(rng() * ratios.length)];

    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const outGain = ctx.createGain();

    carrier.type = 'sine';
    modulator.type = 'sine';

    carrier.frequency.setValueAtTime(freq, 0);
    modulator.frequency.setValueAtTime(freq * ratio, 0);

    modGain.gain.setValueAtTime(freq * (1.6 + rng() * 1.8), 0);
    modGain.gain.exponentialRampToValueAtTime(1.0, duration * 0.6);

    outGain.gain.setValueAtTime(0.001, 0);
    outGain.gain.linearRampToValueAtTime(0.6, 0.004);
    outGain.gain.exponentialRampToValueAtTime(0.001, duration);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(outGain).connect(ctx.destination);

    carrier.start(0);
    modulator.start(0);
    carrier.stop(duration);
    modulator.stop(duration);

    const buffer = await ctx.startRendering();
    return {
      buffer,
      synthType: 'bell',
      label: `Synth Bell (${noteName})`,
    };
  }
}
