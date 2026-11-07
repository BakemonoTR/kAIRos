export interface MetronomeState {
  enabled: boolean;
  bpm: number;
  currentBeat: number; // 1, 2, 3, 4
  isTick: boolean;
  isDownbeat: boolean;
  hovered: boolean;
}

export class Metronome {
  private ctx: AudioContext | null = null;
  private destination: AudioNode | null = null;
  private enabled = false;
  private bpm = 120;
  private nextTickTime = 0;
  private currentBeat = 1; // 1, 2, 3, 4
  private isHovered = false;

  init(ctx: AudioContext, destination: AudioNode): void {
    this.ctx = ctx;
    this.destination = destination;
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  getBpm(): number {
    return this.bpm;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  toggle(): boolean {
    if (this.enabled) {
      this.stop();
    } else {
      this.start();
    }
    return this.enabled;
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    if (this.ctx) {
      this.nextTickTime = this.ctx.currentTime + 0.05;
      this.currentBeat = 1;
    }
    this.playToneFeedback(true);
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.playToneFeedback(false);
  }

  private playToneFeedback(on: boolean): void {
    if (!this.ctx || !this.destination) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      if (on) {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
      } else {
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.06);
      }
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // Audio context may be suspended or uninitialized
    }
  }

  update(masterStartTime = 0, masterDuration = 0): MetronomeState {
    if (!this.enabled || !this.ctx || !this.destination) {
      return {
        enabled: this.enabled,
        bpm: this.bpm,
        currentBeat: this.currentBeat,
        isTick: false,
        isDownbeat: false,
        hovered: this.isHovered,
      };
    }

    const now = this.ctx.currentTime;
    const beatSec = 60 / this.bpm;
    const lookahead = 0.12; // 120ms lookahead

    // Align with master loop if one is active
    if (masterDuration > 0 && masterStartTime > 0) {
      const elapsed = now - masterStartTime;
      const beatIdx = Math.floor(elapsed / beatSec);
      const targetTime = masterStartTime + (beatIdx + 1) * beatSec;
      if (this.nextTickTime < now) {
        this.nextTickTime = Math.max(now, targetTime - beatSec);
      }
    } else {
      if (this.nextTickTime < now) {
        this.nextTickTime = now;
      }
    }

    // Schedule any upcoming clicks in lookahead window
    while (this.nextTickTime < now + lookahead) {
      let beatNum = 1;
      if (masterDuration > 0 && masterStartTime > 0) {
        const beatIndex = Math.round((this.nextTickTime - masterStartTime) / beatSec);
        beatNum = (((beatIndex % 4) + 4) % 4) + 1;
      } else {
        beatNum = this.currentBeat;
      }

      this.scheduleClick(beatNum === 1, this.nextTickTime);
      this.currentBeat = (beatNum % 4) + 1;
      this.nextTickTime += beatSec;
    }

    // Current real-time visual phase
    let visualBeat = 1;
    let visualPhase = 0;
    if (masterDuration > 0 && masterStartTime > 0) {
      const elapsed = Math.max(0, now - masterStartTime);
      const beatProgress = elapsed / beatSec;
      visualBeat = (Math.floor(beatProgress) % 4) + 1;
      visualPhase = beatProgress % 1.0;
    } else {
      // Free-running phase
      const elapsed = Math.max(0, now - (this.nextTickTime - beatSec));
      visualBeat = this.currentBeat === 1 ? 4 : this.currentBeat - 1;
      visualPhase = Math.min(1.0, elapsed / beatSec);
    }

    const isTick = visualPhase < 0.22;
    const isDownbeat = visualBeat === 1 && isTick;

    return {
      enabled: this.enabled,
      bpm: this.bpm,
      currentBeat: visualBeat,
      isTick,
      isDownbeat,
      hovered: this.isHovered,
    };
  }

  private scheduleClick(isDownbeat: boolean, time: number): void {
    if (!this.ctx || !this.destination) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 1400 : 900, time);
      gain.gain.setValueAtTime(isDownbeat ? 0.35 : 0.22, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);

      osc.connect(gain);
      gain.connect(this.destination);

      osc.start(time);
      osc.stop(time + 0.04);
    } catch {
      // Audio error safety
    }
  }
}

