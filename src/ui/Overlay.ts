import {
  AppMode,
  FINGER_METAS,
  FingerId,
  LivePhraseMetrics,
  LooperStatus,
  MappedHandsResult,
  SlotData,
  ThereminState,
} from '../types';
import { SwipeStreakPoint } from '../gesture/GestureDetector';

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

interface HitRipple {
  fingerId: FingerId;
  velocity: number;
  startedAt: number;
}

export interface RenderViewport {
  offsetX: number;
  offsetY: number;
  drawWidth: number;
  drawHeight: number;
}

interface ToastBanner {
  text: string;
  color: string;
  startedAt: number;
}

export class Overlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ripples: HitRipple[] = [];
  private pressedSet = new Set<FingerId>();

  // Theremin & Looper additions
  private appMode: AppMode = 'fingers';
  private thereminState: ThereminState | null = null;
  private streakPoints: SwipeStreakPoint[] = [];
  private looperStatus: LooperStatus | null = null;
  private liveMetrics: LivePhraseMetrics | null = null;

  // Phrase capture live feedback
  private isDrumCapturing = false;
  private pendingDrumCount = 0;
  private isSynthCapturing = false;
  private toast: ToastBanner | null = null;
  private wallHitLeftMs = 0;
  private wallHitRightMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context alınamadı.');
    this.ctx = ctx;
  }

  setAppMode(mode: AppMode): void {
    this.appMode = mode;
  }

  setThereminState(state: ThereminState | null): void {
    this.thereminState = state;
  }

  setStreakPoints(streaks: SwipeStreakPoint[]): void {
    this.streakPoints = streaks;
  }

  setLooperStatus(status: LooperStatus | null): void {
    this.looperStatus = status;
  }

  setLivePhraseMetrics(metrics: LivePhraseMetrics | null): void {
    this.liveMetrics = metrics;
  }

  setCapturingState(drumCapturing: boolean, drumCount: number, synthCapturing: boolean): void {
    this.isDrumCapturing = drumCapturing;
    this.pendingDrumCount = drumCount;
    this.isSynthCapturing = synthCapturing;
  }

  showToast(text: string, color = '#39ff14'): void {
    this.toast = {
      text,
      color,
      startedAt: performance.now(),
    };
  }

  triggerWallBump(hand: 'L' | 'R', nowMs = performance.now()): void {
    if (hand === 'L') {
      this.wallHitLeftMs = nowMs;
    } else {
      this.wallHitRightMs = nowMs;
    }
  }

  triggerHit(fingerId: FingerId, velocity: number, nowMs = performance.now()): void {
    this.pressedSet.add(fingerId);
    this.ripples.push({
      fingerId,
      velocity,
      startedAt: nowMs,
    });
  }

  releaseHit(fingerId: FingerId): void {
    this.pressedSet.delete(fingerId);
  }

  computeContainViewport(
    containerW: number,
    containerH: number,
    videoW: number,
    videoH: number
  ): RenderViewport {
    if (!videoW || !videoH) {
      return { offsetX: 0, offsetY: 0, drawWidth: containerW, drawHeight: containerH };
    }
    const containerRatio = containerW / containerH;
    const videoRatio = videoW / videoH;

    let drawWidth = containerW;
    let drawHeight = containerH;
    let offsetX = 0;
    let offsetY = 0;

    if (containerRatio > videoRatio) {
      drawHeight = containerH;
      drawWidth = drawHeight * videoRatio;
      offsetX = (containerW - drawWidth) / 2;
    } else {
      drawWidth = containerW;
      drawHeight = drawWidth / videoRatio;
      offsetY = (containerH - drawHeight) / 2;
    }

    return { offsetX, offsetY, drawWidth, drawHeight };
  }

  render(
    mapped: MappedHandsResult,
    slots: SlotData[],
    video: HTMLVideoElement,
    nowMs = performance.now()
  ): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    this.ctx.save();
    this.ctx.scale(dpr, dpr);
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    const vp = this.computeContainViewport(
      rect.width,
      rect.height,
      video.videoWidth,
      video.videoHeight
    );

    this.drawSceneOnContext(this.ctx, vp, mapped, slots, nowMs);
    this.ctx.restore();
  }

  drawSceneOnContext(
    ctx: CanvasRenderingContext2D,
    vp: RenderViewport,
    mapped: MappedHandsResult,
    slots: SlotData[],
    nowMs: number
  ): void {
    const toX = (nx: number) => vp.offsetX + nx * vp.drawWidth;
    const toY = (ny: number) => vp.offsetY + ny * vp.drawHeight;

    this.ripples = this.ripples.filter((r) => nowMs - r.startedAt < 340);

    // 1. Subtle hand skeleton lines
    for (const handObj of mapped.rawHands) {
      const lms = handObj.landmarks;
      const isRightHand = handObj.hand === 'R';
      const isThereminRight = this.appMode === 'theremin' && isRightHand;

      ctx.save();
      ctx.strokeStyle = isThereminRight ? 'rgba(129, 140, 248, 0.45)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = isThereminRight ? 2.5 : 2;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(toX(lms[a].x), toY(lms[a].y));
        ctx.lineTo(toX(lms[b].x), toY(lms[b].y));
      }
      ctx.stroke();

      ctx.fillStyle = isThereminRight ? 'rgba(165, 180, 252, 0.6)' : 'rgba(226, 232, 240, 0.45)';
      for (let i = 0; i < lms.length; i++) {
        if (i === 4 || i === 8 || i === 12 || i === 16 || i === 20) continue;
        ctx.beginPath();
        ctx.arc(toX(lms[i].x), toY(lms[i].y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. Fingertip colored dots + labels + hit ripples
    for (const [fingerId, fData] of mapped.fingers.entries()) {
      if (this.appMode === 'theremin' && fingerId >= 5) {
        continue;
      }

      const slot = slots[fingerId];
      const meta = FINGER_METAS[fingerId];
      if (!slot || !meta) continue;

      const x = toX(fData.tip.x);
      const y = toY(fData.tip.y);
      const isEnabled = slot.enabled;
      const isPressed = this.pressedSet.has(fingerId);

      for (const ripple of this.ripples) {
        if (ripple.fingerId !== fingerId) continue;
        const progress = Math.min(1, (nowMs - ripple.startedAt) / 340);
        const radius = 12 + progress * (28 + ripple.velocity * 22);
        const alpha = (1 - progress) * 0.85;

        ctx.save();
        ctx.strokeStyle = meta.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3 * (1 - progress * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      if (!isEnabled) {
        ctx.globalAlpha = 0.28;
      }

      const baseRadius = isPressed ? 13 : 9;
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = isPressed ? 22 : 8;

      ctx.fillStyle = meta.color;
      ctx.beginPath();
      ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      if (isEnabled) {
        ctx.shadowBlur = 0;
        const tag = meta.shortLabel;
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        const textW = ctx.measureText(tag).width;
        const pillW = textW + 10;
        const pillH = 17;
        const px = x - pillW / 2;
        const py = y - baseRadius - 22;

        ctx.fillStyle = 'rgba(11, 13, 19, 0.78)';
        ctx.beginPath();
        ctx.roundRect(px, py, pillW, pillH, 6);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, x, py + pillH / 2 + 0.5);
      }

      ctx.restore();
    }

    // 3. Theremin Mode Visuals (Right Hand Energy Orb & Pitch Axis)
    if (this.appMode === 'theremin' && this.thereminState) {
      this.drawThereminVisuals(ctx, vp, this.thereminState, nowMs);
    }

    // 4. Swipe Streaks & Particle Trails
    if (this.streakPoints.length > 0) {
      this.drawSwipeStreaks(ctx, vp);
    }

    // 4B. Wall Collision Shockwaves ("Duvara Çarptırma Efekti")
    this.drawWallShockwaves(ctx, vp, nowMs);

    // 5. Looper HUD Overlay & Live Phrase Recording Badges
    if (this.appMode === 'theremin') {
      this.drawRetroDigitalHud(ctx, vp, nowMs);
    }

    // 6. Celebratory Toast Notification
    if (this.toast) {
      const elapsed = nowMs - this.toast.startedAt;
      if (elapsed < 2400) {
        const progress = elapsed / 2400;
        const alpha = progress < 0.12 ? progress / 0.12 : progress > 0.75 ? (1 - progress) / 0.25 : 1;
        this.drawToastBanner(ctx, vp, this.toast, alpha);
      } else {
        this.toast = null;
      }
    }
  }

  private drawDigitalText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color = '#39ff14',
    align: CanvasTextAlign = 'left'
  ): void {
    ctx.save();
    ctx.font = `700 ${fontSize}px "Share Tech Mono", "VT323", "Courier New", Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    // Crisp high-contrast outline to pop against any background without box shapes
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(text, x, y);

    // Phosphor glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    // Inner brightness pass
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    ctx.restore();
  }

  private drawThereminVisuals(
    ctx: CanvasRenderingContext2D,
    vp: RenderViewport,
    tState: ThereminState,
    nowMs: number
  ): void {
    const toX = (nx: number) => vp.offsetX + nx * vp.drawWidth;
    const toY = (ny: number) => vp.offsetY + ny * vp.drawHeight;

    const x = toX(tState.handX);
    const y = toY(tState.handY);

    ctx.save();

    // Vertical Pitch Guide Laser
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(x, vp.offsetY);
    ctx.lineTo(x, vp.offsetY + vp.drawHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const tickSteps = 8;
    ctx.fillStyle = 'rgba(57, 255, 20, 0.45)';
    for (let i = 0; i <= tickSteps; i++) {
      const ty = vp.offsetY + (vp.drawHeight * (0.15 + (i / tickSteps) * 0.7));
      ctx.fillRect(x - 6, ty, 12, 1);
    }

    const clench = tState.clenchRatio;
    const isPlaying = tState.active;

    if (isPlaying) {
      const orbRadius = 24 + clench * 22;
      const grad = ctx.createRadialGradient(x, y, 4, x, y, orbRadius);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.35, 'rgba(74, 222, 128, 0.85)');
      grad.addColorStop(0.7, 'rgba(57, 255, 20, 0.45)');
      grad.addColorStop(1, 'rgba(34, 197, 94, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius, 0, Math.PI * 2);
      ctx.fill();

      const rotAngle = (nowMs * 0.004) % (Math.PI * 2);
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius * 1.15, rotAngle, rotAngle + Math.PI * 1.4);
      ctx.stroke();

      const pulse = Math.sin(nowMs * 0.01) * 6;
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius * 1.35 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      const noteLabel = `[ NOTE: ${tState.noteName} • ${Math.round(tState.pitchHz)} HZ ]`;
      this.drawDigitalText(ctx, noteLabel, x, y - orbRadius - 26, 14, '#39ff14', 'center');
    } else {
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();

      const promptText = '[ YUMRUK YAP = ÇAL ]';
      this.drawDigitalText(ctx, promptText, x, y - 28, 12, '#39ff14', 'center');
    }

    ctx.restore();
  }

  private drawSwipeStreaks(ctx: CanvasRenderingContext2D, vp: RenderViewport): void {
    const toX = (nx: number) => vp.offsetX + nx * vp.drawWidth;
    const toY = (ny: number) => vp.offsetY + ny * vp.drawHeight;

    ctx.save();
    for (const pt of this.streakPoints) {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = pt.alpha * 0.85;
      ctx.shadowColor = pt.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(toX(pt.x), toY(pt.y), 7 * pt.alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawWallShockwaves(ctx: CanvasRenderingContext2D, vp: RenderViewport, nowMs: number): void {
    // Left Wall Laser Shockwave
    const elapsedL = nowMs - this.wallHitLeftMs;
    if (elapsedL < 450) {
      const progress = elapsedL / 450;
      const alpha = (1 - progress) * 0.95;
      const x = vp.offsetX + 2;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 8 * (1 - progress * 0.5);
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 24;

      ctx.beginPath();
      ctx.moveTo(x, vp.offsetY);
      ctx.lineTo(x, vp.offsetY + vp.drawHeight);
      ctx.stroke();

      this.drawDigitalText(
        ctx,
        '◄◄ SOL DUVAR ÇARPTI : DAVUL DÖNGÜLENDİ ◄◄',
        vp.offsetX + 35,
        vp.offsetY + vp.drawHeight / 2,
        14,
        '#39ff14',
        'left'
      );
      ctx.restore();
    }

    // Right Wall Laser Shockwave
    const elapsedR = nowMs - this.wallHitRightMs;
    if (elapsedR < 450) {
      const progress = elapsedR / 450;
      const alpha = (1 - progress) * 0.95;
      const x = vp.offsetX + vp.drawWidth - 2;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 8 * (1 - progress * 0.5);
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 24;

      ctx.beginPath();
      ctx.moveTo(x, vp.offsetY);
      ctx.lineTo(x, vp.offsetY + vp.drawHeight);
      ctx.stroke();

      this.drawDigitalText(
        ctx,
        '►► SAĞ DUVAR ÇARPTI : SYNTH DÖNGÜLENDİ ►►',
        vp.offsetX + vp.drawWidth - 35,
        vp.offsetY + vp.drawHeight / 2,
        14,
        '#39ff14',
        'right'
      );
      ctx.restore();
    }
  }

  private drawRetroDigitalHud(
    ctx: CanvasRenderingContext2D,
    vp: RenderViewport,
    nowMs: number
  ): void {
    const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));
    const isBlink = Math.sin(nowMs * 0.008) > 0;
    const neonGreen = '#39ff14';

    const m = this.liveMetrics;
    const drumStatus = m ? m.drum.status : this.isDrumCapturing ? 'recording' : this.looperStatus?.drumIsPlaying ? 'looping' : 'idle';
    const synthStatus = m ? m.synth.status : this.isSynthCapturing ? 'recording' : (this.looperStatus?.synthLayersCount ?? 0) > 0 ? 'looping' : 'idle';

    const yLine1 = vp.offsetY + vp.drawHeight - 44;
    const yLine2 = vp.offsetY + vp.drawHeight - 20;

    // --- LEFT HAND (DRUMS) HUD ---
    const xLeft = vp.offsetX + 20;
    if (drumStatus === 'recording') {
      const bar = m ? m.drum.bar : 1;
      const beat = m ? m.drum.beat : 1;
      const targetBeats = m ? m.drum.targetBeats : 2;
      const hits = m ? m.drum.hitsCount : this.pendingDrumCount;
      const recDot = isBlink ? '●' : '○';
      this.drawDigitalText(
        ctx,
        `[L-DRUM] ${recDot} REC :: ${pad2(targetBeats)} VURUŞ HEDEF (ÖLÇÜ ${pad2(bar)} • VURUŞ ${pad2(beat)})`,
        xLeft,
        yLine1,
        15,
        neonGreen,
        'left'
      );
      this.drawDigitalText(
        ctx,
        `>> ${hits} NOTA | ◄ SOL DUVARA ÇARPTIR = DÖNGÜLE <<`,
        xLeft,
        yLine2,
        13,
        neonGreen,
        'left'
      );
    } else if (drumStatus === 'looping') {
      const totalBeats = m ? m.drum.totalBeats : 2;
      const totalBars = m ? m.drum.totalBars : 1;
      const beat = m ? m.drum.beat : 1;
      const hits = m ? m.drum.hitsCount : this.looperStatus?.drumEventsCount ?? 0;
      this.drawDigitalText(
        ctx,
        `[L-DRUM] PLAY ▶ :: ${pad2(totalBeats)} VURUŞ (${pad2(totalBars)} ÖLÇÜ) • VURUŞ ${pad2(beat)} [${hits} NOTA]`,
        xLeft,
        yLine1,
        15,
        neonGreen,
        'left'
      );
      this.drawDigitalText(
        ctx,
        `>> VURARAK EKLE | ◄ SOL DUVARA ÇARPTIR = OVERDUB <<`,
        xLeft,
        yLine2,
        13,
        neonGreen,
        'left'
      );
    } else {
      this.drawDigitalText(
        ctx,
        `[L-DRUM] HAZIR :: 2-VURUŞ ADIM [BEKLEMEDE]`,
        xLeft,
        yLine1,
        15,
        neonGreen,
        'left'
      );
      this.drawDigitalText(
        ctx,
        `>> PARMAKLARLA VUR • ◄ SOL DUVARA ÇARPTIR = DÖNGÜLE <<`,
        xLeft,
        yLine2,
        13,
        neonGreen,
        'left'
      );
    }

    // --- RIGHT HAND (SYNTH) HUD ---
    const xRight = vp.offsetX + vp.drawWidth - 20;
    if (synthStatus === 'recording') {
      const bar = m ? m.synth.bar : 1;
      const beat = m ? m.synth.beat : 1;
      const targetBeats = m ? m.synth.targetBeats : 2;
      const recDot = isBlink ? '●' : '○';
      this.drawDigitalText(
        ctx,
        `[R-SYNTH] ${recDot} REC :: ${pad2(targetBeats)} VURUŞ HEDEF (ÖLÇÜ ${pad2(bar)} • VURUŞ ${pad2(beat)})`,
        xRight,
        yLine1,
        15,
        neonGreen,
        'right'
      );
      this.drawDigitalText(
        ctx,
        `>> SAĞ DUVARA ÇARPTIR ► = DÖNGÜLE | AŞAĞI = SES <<`,
        xRight,
        yLine2,
        13,
        neonGreen,
        'right'
      );
    } else if (synthStatus === 'looping') {
      const totalBeats = m ? m.synth.totalBeats : 2;
      const totalBars = m ? m.synth.totalBars : 1;
      const beat = m ? m.synth.beat : 1;
      const layers = m ? m.synth.layersCount : this.looperStatus?.synthLayersCount ?? 0;
      this.drawDigitalText(
        ctx,
        `[R-SYNTH] PLAY ▶ :: ${pad2(totalBeats)} VURUŞ (${pad2(totalBars)} ÖLÇÜ) • VURUŞ ${pad2(beat)} [KATMAN ${pad2(layers)}]`,
        xRight,
        yLine1,
        15,
        neonGreen,
        'right'
      );
      this.drawDigitalText(
        ctx,
        `>> YUMRUKLA ÇAL | SAĞ DUVARA ÇARPTIR ► = OVERDUB <<`,
        xRight,
        yLine2,
        13,
        neonGreen,
        'right'
      );
    } else {
      this.drawDigitalText(
        ctx,
        `[R-SYNTH] HAZIR :: 2-VURUŞ ADIM [BEKLEMEDE]`,
        xRight,
        yLine1,
        15,
        neonGreen,
        'right'
      );
      this.drawDigitalText(
        ctx,
        `>> YUMRUK YAP VE ÇAL • SAĞ DUVARA ÇARPTIR ► = DÖNGÜLE <<`,
        xRight,
        yLine2,
        13,
        neonGreen,
        'right'
      );
    }

    // --- TOP CENTER (MASTER LOOP & BAR METRICS) ---
    const xCenter = vp.offsetX + vp.drawWidth / 2;
    const yTop = vp.offsetY + 24;
    const bpm = m ? m.bpm : 120;
    if (m && m.master.active) {
      this.drawDigitalText(
        ctx,
        `::: MASTER ${bpm} BPM | DÖNGÜ: ${pad2(m.master.totalBeats)} VURUŞ (${pad2(m.master.totalBars)} ÖLÇÜ) • VURUŞ ${pad2(m.master.beat)} :::`,
        xCenter,
        yTop,
        14,
        neonGreen,
        'center'
      );
    } else {
      this.drawDigitalText(
        ctx,
        `::: BEATCAM DUVAR LOOPER • 2-VURUŞ ADIM • ${bpm} BPM :::`,
        xCenter,
        yTop,
        14,
        neonGreen,
        'center'
      );
    }
  }

  private drawToastBanner(
    ctx: CanvasRenderingContext2D,
    vp: RenderViewport,
    toast: ToastBanner,
    alpha: number
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    const bannerText = `>>> ${toast.text.toUpperCase()} <<<`;
    const bx = vp.offsetX + vp.drawWidth / 2;
    const by = vp.offsetY + 52;

    this.drawDigitalText(ctx, bannerText, bx, by, 16, '#39ff14', 'center');

    ctx.restore();
  }
}
