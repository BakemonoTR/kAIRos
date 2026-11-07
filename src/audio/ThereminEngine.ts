import { CustomSynthParams, ThereminPreset, ThereminScale } from '../types';

export interface ThereminNoteInfo {
  frequency: number;
  noteName: string;
  midiNote: number;
}

export const THEREMIN_PRESETS: ThereminPreset[] = [
  'cosmic',
  'cyber',
  'dreampad',
  'chiptune',
  'cello',
  'custom',
];

export const THEREMIN_PRESET_LABELS: Record<ThereminPreset, string> = {
  cosmic: 'Cosmic sine',
  cyber: 'Cyber lead',
  dreampad: 'Dream pad',
  chiptune: '8-bit square',
  cello: 'Cello vox',
  custom: 'Custom synth',
};

const PENTATONIC_INTERVALS = [0, 3, 5, 7, 10]; // Minor Pentatonic (C, Eb, F, G, Bb)
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const BLUES_INTERVALS = [0, 3, 5, 6, 7, 10];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class ThereminEngine {
  private ctx: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private wetNode: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private vcaGain: GainNode | null = null;

  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  private currentPreset: ThereminPreset = 'cosmic';
  private currentScale: ThereminScale = 'pentatonic';
  private reverbAmount = 0.65;
  private customParams: CustomSynthParams = {
    osc1Wave: 'sawtooth',
    osc2Wave: 'triangle',
    osc2Octave: 0,
    osc2Detune: 12,
    filterType: 'lowpass',
    filterQ: 4.0,
    vibratoRate: 5.0,
    vibratoDepth: 4.5,
    glide: 0.03,
  };
  private active = false;
  private currentFreq = 440;
  private currentNoteName = 'A4';

  init(ctx: AudioContext, masterDestination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;

    // Main output
    this.outputNode = ctx.createGain();
    this.outputNode.gain.value = 0.85;

    // VCA (Voltage Controlled Amplifier) for gate / envelope
    this.vcaGain = ctx.createGain();
    this.vcaGain.gain.setValueAtTime(0, ctx.currentTime);

    // Filter
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(2500, ctx.currentTime);
    this.filterNode.Q.setValueAtTime(3.5, ctx.currentTime);

    // Reverb / Space Delay Network for atmospheric tail
    this.delayNode = ctx.createDelay();
    this.delayNode.delayTime.setValueAtTime(0.32, ctx.currentTime);

    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.55 * this.reverbAmount, ctx.currentTime);

    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(1800, ctx.currentTime);

    this.wetNode = ctx.createGain();
    this.wetNode.gain.setValueAtTime(this.reverbAmount * 0.75, ctx.currentTime);

    // Dry chain: VCA -> Filter -> Output -> master
    this.vcaGain.connect(this.filterNode);
    this.filterNode.connect(this.outputNode);

    // Wet chain: Filter -> Delay -> DelayFilter -> Feedback -> Delay
    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(delayFilter);
    delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    delayFilter.connect(this.wetNode);
    this.wetNode.connect(this.outputNode);

    this.outputNode.connect(masterDestination);

    this.rebuildOscillators();
  }

  getOutputNode(): GainNode | null {
    return this.outputNode;
  }

  getPreset(): ThereminPreset {
    return this.currentPreset;
  }

  isActive(): boolean {
    return this.active;
  }

  cycleNextPreset(): { preset: ThereminPreset; name: string } {
    const idx = THEREMIN_PRESETS.indexOf(this.currentPreset);
    const next = THEREMIN_PRESETS[(idx + 1) % THEREMIN_PRESETS.length];
    this.setPreset(next);
    return { preset: next, name: THEREMIN_PRESET_LABELS[next] };
  }

  playPresetChangeChime(): void {
    if (!this.ctx || !this.outputNode) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.0, now + 0.08); // A5

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.outputNode);

      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // Audio fallback
    }
  }

  setPreset(preset: ThereminPreset): void {
    this.currentPreset = preset;
    this.rebuildOscillators();
  }

  getCustomParams(): CustomSynthParams {
    return { ...this.customParams };
  }

  setCustomParams(patch: Partial<CustomSynthParams>): CustomSynthParams {
    this.customParams = { ...this.customParams, ...patch };
    if (this.currentPreset === 'custom') {
      if (this.ctx && this.osc1 && this.osc2 && this.lfo && this.lfoGain && this.filterNode) {
        const now = this.ctx.currentTime;
        this.osc1.type = this.customParams.osc1Wave;
        this.osc2.type = this.customParams.osc2Wave;
        this.osc2.detune.setTargetAtTime(this.customParams.osc2Detune, now, 0.02);
        const osc2Mult = Math.pow(2, this.customParams.osc2Octave);
        this.osc2.frequency.setTargetAtTime(this.currentFreq * osc2Mult, now, 0.02);
        this.filterNode.type = this.customParams.filterType;
        this.filterNode.Q.setTargetAtTime(this.customParams.filterQ, now, 0.02);
        this.lfo.frequency.setTargetAtTime(this.customParams.vibratoRate, now, 0.02);
        this.lfoGain.gain.setTargetAtTime(this.customParams.vibratoDepth, now, 0.02);
      } else {
        this.rebuildOscillators();
      }
    }
    return { ...this.customParams };
  }

  setScale(scale: ThereminScale): void {
    this.currentScale = scale;
  }

  setReverbAmount(amount: number): void {
    this.reverbAmount = Math.max(0, Math.min(1, amount));
    if (this.delayFeedback && this.wetNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.delayFeedback.gain.setTargetAtTime(0.68 * this.reverbAmount, now, 0.05);
      this.wetNode.gain.setTargetAtTime(0.85 * this.reverbAmount, now, 0.05);
    }
  }

  private rebuildOscillators(): void {
    if (!this.ctx || !this.vcaGain) return;

    // Stop and disconnect old oscillators
    if (this.osc1) {
      try { this.osc1.stop(); this.osc1.disconnect(); } catch { /* ignore */ }
    }
    if (this.osc2) {
      try { this.osc2.stop(); this.osc2.disconnect(); } catch { /* ignore */ }
    }
    if (this.lfo) {
      try { this.lfo.stop(); this.lfo.disconnect(); } catch { /* ignore */ }
    }

    const now = this.ctx.currentTime;

    this.osc1 = this.ctx.createOscillator();
    this.osc2 = this.ctx.createOscillator();
    this.lfo = this.ctx.createOscillator();
    this.lfoGain = this.ctx.createGain();

    switch (this.currentPreset) {
      case 'cosmic': // Classic Theremin
        this.osc1.type = 'sine';
        this.osc2.type = 'sine';
        this.lfo.frequency.setValueAtTime(5.8, now); // vibrato
        this.lfoGain.gain.setValueAtTime(4.5, now);
        this.filterNode!.type = 'lowpass';
        this.filterNode!.Q.setValueAtTime(2.0, now);
        break;

      case 'cyber': // Resonant Cyber Lead
        this.osc1.type = 'sawtooth';
        this.osc2.type = 'sawtooth';
        this.osc2.detune.setValueAtTime(11, now);
        this.lfo.frequency.setValueAtTime(4.2, now);
        this.lfoGain.gain.setValueAtTime(3.0, now);
        this.filterNode!.type = 'lowpass';
        this.filterNode!.Q.setValueAtTime(6.0, now);
        break;

      case 'dreampad': // Lush Ambient Pad
        this.osc1.type = 'triangle';
        this.osc2.type = 'sawtooth';
        this.osc2.detune.setValueAtTime(-14, now);
        this.lfo.frequency.setValueAtTime(3.0, now);
        this.lfoGain.gain.setValueAtTime(6.0, now);
        this.filterNode!.type = 'lowpass';
        this.filterNode!.Q.setValueAtTime(1.5, now);
        break;

      case 'chiptune': // 8-Bit Retro Square
        this.osc1.type = 'square';
        this.osc2.type = 'square';
        this.osc2.detune.setValueAtTime(7, now);
        this.lfo.frequency.setValueAtTime(7.5, now);
        this.lfoGain.gain.setValueAtTime(2.0, now);
        this.filterNode!.type = 'lowpass';
        this.filterNode!.Q.setValueAtTime(3.0, now);
        break;

      case 'cello': // Smooth Cello-Vox
        this.osc1.type = 'triangle';
        this.osc2.type = 'sawtooth';
        this.lfo.frequency.setValueAtTime(5.2, now);
        this.lfoGain.gain.setValueAtTime(5.5, now);
        this.filterNode!.type = 'bandpass';
        this.filterNode!.Q.setValueAtTime(2.5, now);
        break;

      case 'custom': // User-configured Custom Synth
        this.osc1.type = this.customParams.osc1Wave;
        this.osc2.type = this.customParams.osc2Wave;
        this.osc2.detune.setValueAtTime(this.customParams.osc2Detune, now);
        this.lfo.frequency.setValueAtTime(this.customParams.vibratoRate, now);
        this.lfoGain.gain.setValueAtTime(this.customParams.vibratoDepth, now);
        this.filterNode!.type = this.customParams.filterType;
        this.filterNode!.Q.setValueAtTime(this.customParams.filterQ, now);
        break;
    }

    // Connect LFO vibrato to osc1 frequency
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.osc1.frequency);

    const osc2Mult = this.currentPreset === 'custom' ? Math.pow(2, this.customParams.osc2Octave) : 1;
    this.osc1.frequency.setValueAtTime(this.currentFreq, now);
    this.osc2.frequency.setValueAtTime(this.currentFreq * osc2Mult, now);

    this.osc1.connect(this.vcaGain);
    this.osc2.connect(this.vcaGain);

    this.osc1.start(now);
    this.osc2.start(now);
    this.lfo.start(now);
  }

  /**
   * Quantizes a normalized Y (0 = top, 1 = bottom) to frequency & note name.
   */
  computePitch(handY: number): ThereminNoteInfo {
    // Invert: top (handY ~0.15) = high pitch, bottom (handY ~0.85) = low pitch
    const clampedY = Math.max(0.12, Math.min(0.88, handY));
    const norm = 1 - (clampedY - 0.12) / (0.88 - 0.12); // 0 (low) .. 1 (high)

    const baseMidi = 48; // C3
    const maxMidi = 84;  // C6 (3 full octaves range)
    const exactMidi = baseMidi + norm * (maxMidi - baseMidi);

    let finalMidi = exactMidi;

    if (this.currentScale !== 'continuous') {
      const rootMidi = 48; // C
      const rounded = Math.round(exactMidi);
      const semitone = (rounded - rootMidi) % 12;
      const octave = Math.floor((rounded - rootMidi) / 12);

      let allowedIntervals: number[];
      switch (this.currentScale) {
        case 'pentatonic':
          allowedIntervals = PENTATONIC_INTERVALS;
          break;
        case 'blues':
          allowedIntervals = BLUES_INTERVALS;
          break;
        case 'major':
          allowedIntervals = MAJOR_INTERVALS;
          break;
        default:
          allowedIntervals = Array.from({ length: 12 }, (_, i) => i);
      }

      // Snap to nearest allowed interval
      let bestDist = Infinity;
      let bestInterval = allowedIntervals[0];
      for (const inv of allowedIntervals) {
        const dist = Math.abs(semitone - inv);
        if (dist < bestDist) {
          bestDist = dist;
          bestInterval = inv;
        }
      }
      finalMidi = rootMidi + octave * 12 + bestInterval;
    }

    // MIDI to Hz formula: 440 * 2^((midi - 69) / 12)
    const freq = 440 * Math.pow(2, (finalMidi - 69) / 12);

    const roundedMidi = Math.round(finalMidi);
    const noteOctave = Math.floor(roundedMidi / 12) - 1;
    const noteName = `${NOTE_NAMES[((roundedMidi % 12) + 12) % 12]}${noteOctave}`;

    return { frequency: freq, noteName, midiNote: roundedMidi };
  }

  /**
   * Maps hand clench ratio (0 = completely open, 1 = full fist) to normalized volume (0..1 = 0%..100%).
   * - Open hand (<= 0.19): 0% (silent)
   * - Semi-open / lightly cupped (0.25..0.55): low-to-mid volume (~6%..49%)
   * - Full fist (>= 0.82): 100% volume (1.0)
   */
  computeVolume(clenchRatio: number): number {
    const threshold = this.active ? 0.16 : 0.19;
    if (clenchRatio <= threshold) {
      return 0;
    }
    const norm = Math.max(0, Math.min(1, (clenchRatio - 0.19) / (0.82 - 0.19)));
    return Math.pow(norm, 1.35);
  }

  /**
   * Updates real-time theremin parameters from hand tracking.
   * clenchRatio: 0 (hand completely open) to 1 (fist / closed hand).
   * handX: 0 to 1 across screen.
   * handY: 0 to 1 height on screen.
   */
  updateGesture(clenchRatio: number, handX: number, handY: number): {
    active: boolean;
    frequency: number;
    noteName: string;
    volume: number;
    brightness: number;
  } {
    const pitchInfo = this.computePitch(handY);
    this.currentFreq = pitchInfo.frequency;
    this.currentNoteName = pitchInfo.noteName;
    const cutoffFreq = 400 + Math.pow(Math.max(0.05, Math.min(0.95, handX)), 1.8) * 8000;
    const dynamicVolume = this.computeVolume(clenchRatio);
    const isPlaying = dynamicVolume > 0;

    if (!this.ctx || !this.vcaGain || !this.filterNode) {
      this.active = isPlaying;
      return {
        active: this.active,
        frequency: this.currentFreq,
        noteName: this.currentNoteName,
        volume: dynamicVolume,
        brightness: cutoffFreq,
      };
    }

    const now = this.ctx.currentTime;

    // Cutoff frequency controlled by hand X (left = darker, right = brighter)
    this.filterNode.frequency.setTargetAtTime(cutoffFreq, now, 0.03);

    // Pitch smooth portamento
    const portamentoTime =
      this.currentPreset === 'custom'
        ? this.customParams.glide
        : this.currentScale === 'continuous'
          ? 0.04
          : 0.025;
    if (this.osc1 && this.osc2) {
      const osc2Mult = this.currentPreset === 'custom' ? Math.pow(2, this.customParams.osc2Octave) : 1;
      this.osc1.frequency.setTargetAtTime(pitchInfo.frequency, now, portamentoTime);
      this.osc2.frequency.setTargetAtTime(pitchInfo.frequency * osc2Mult, now, portamentoTime);
    }

    if (isPlaying) {
      this.active = true;
      const acousticGain = Math.pow(dynamicVolume, 1.15) * 0.90;
      this.vcaGain.gain.setTargetAtTime(acousticGain, now, 0.025);
    } else {
      if (this.active) {
        this.active = false;
        // Release tail: fade out VCA over ~140ms while delay/reverb rings out
        this.vcaGain.gain.setTargetAtTime(0, now, 0.14);
      }
    }

    return {
      active: this.active,
      frequency: this.currentFreq,
      noteName: this.currentNoteName,
      volume: dynamicVolume,
      brightness: cutoffFreq,
    };
  }

  silence(): void {
    if (this.vcaGain && this.ctx) {
      this.active = false;
      this.vcaGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }
}

