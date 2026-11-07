import {
  AppMode,
  FINGER_METAS,
  FingerId,
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

  // Phrase capture live feedback
  private isDrumCapturing = false;
  private pendingDrumCount = 0;
  private isSynthCapturing = false;
  private toast: ToastBanner | null = null;

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

  setCapturingState(drumCapturing: boolean, drumCount: number, synthCapturing: boolean): void {
    this.isDrumCapturing = drumCapturing;
    this.pendingDrumCount = drumCount;
    this.isSynthCapturing = synthCapturing;
  }

  showToast(text: string, color = '#6366f1'): void {
    this.toast = {
      text,
      color,
      startedAt: performance.now(),
    };
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

    // 5. Looper HUD Overlay & Live Phrase Recording Badges
    if (this.appMode === 'theremin' && this.looperStatus) {
      this.drawLooperHud(ctx, vp, this.looperStatus, nowMs);
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
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(x, vp.offsetY);
    ctx.lineTo(x, vp.offsetY + vp.drawHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const tickSteps = 8;
    ctx.fillStyle = 'rgba(165, 180, 252, 0.35)';
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
      grad.addColorStop(0.35, 'rgba(129, 140, 248, 0.85)');
      grad.addColorStop(0.7, 'rgba(99, 102, 241, 0.45)');
      grad.addColorStop(1, 'rgba(79, 70, 229, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius, 0, Math.PI * 2);
      ctx.fill();

      const rotAngle = (nowMs * 0.004) % (Math.PI * 2);
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#6366f1';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius * 1.15, rotAngle, rotAngle + Math.PI * 1.4);
      ctx.stroke();

      const pulse = Math.sin(nowMs * 0.01) * 6;
      ctx.strokeStyle = 'rgba(199, 210, 254, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius * 1.35 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowBlur = 0;
      const noteLabel = `🎵 ${tState.noteName} • ${Math.round(tState.pitchHz)} Hz`;
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      const textW = ctx.measureText(noteLabel).width;
      const bw = textW + 20;
      const bh = 26;
      const bx = x - bw / 2;
      const by = y - orbRadius - 40;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(noteLabel, x, by + bh / 2);
    } else {
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '600 11px Inter, system-ui, sans-serif';
      const promptText = '✊ Yumruk Yap = Çal';
      const textW = ctx.measureText(promptText).width;
      const pw = textW + 14;
      const ph = 20;
      const px = x - pw / 2;
      const py = y - 36;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 6);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(promptText, x, py + ph / 2);
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

  private drawLooperHud(
    ctx: CanvasRenderingContext2D,
    vp: RenderViewport,
    status: LooperStatus,
    nowMs: number
  ): void {
    ctx.save();
    const margin = 16;
    const pillH = 34;

    // Pulse alpha for recording dots
    const pulseAlpha = 0.5 + Math.sin(nowMs * 0.008) * 0.5;

    // Left Hand Drum Looper Badge
    let drumText = '';
    let drumBorderColor = '#64748b';
    if (this.isDrumCapturing) {
      drumText = `🔴 Kaydediliyor (${this.pendingDrumCount} Vuruş) • Swipe'la = Döngüle`;
      drumBorderColor = `rgba(244, 63, 94, ${0.5 + pulseAlpha * 0.5})`;
    } else if (status.drumIsPlaying) {
      drumText = `🥁 Sol El Davul: ${status.drumEventsCount} Vuruş ▶ (Döngüde) • Swipe = Overdub`;
      drumBorderColor = '#f43f5e';
    } else {
      drumText = `🥁 Sol El Davul (Çalmaya başla, swipe = döngüle)`;
      drumBorderColor = '#475569';
    }

    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const dW = ctx.measureText(drumText).width + 24;
    const dX = vp.offsetX + margin;
    const dY = vp.offsetY + vp.drawHeight - pillH - margin;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = drumBorderColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(dX, dY, dW, pillH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(drumText, dX + 12, dY + pillH / 2);

    // Right Hand Synth Looper Badge
    let synthText = '';
    let synthBorderColor = '#64748b';
    if (this.isSynthCapturing) {
      synthText = `🔴 Synth Kaydediliyor • Swipe'la = Döngüle`;
      synthBorderColor = `rgba(129, 140, 248, ${0.5 + pulseAlpha * 0.5})`;
    } else if (status.synthLayersCount > 0) {
      synthText = `🎹 Synth: ${status.synthLayersCount} Katman ▶ (Döngüde) • Swipe = Overdub`;
      synthBorderColor = '#818cf8';
    } else {
      synthText = `🎹 Sağ El Synth (Yumrukla çal, swipe = döngüle)`;
      synthBorderColor = '#475569';
    }

    const sW = ctx.measureText(synthText).width + 24;
    const sX = vp.offsetX + vp.drawWidth - sW - margin;
    const sY = dY;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = synthBorderColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(sX, sY, sW, pillH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(synthText, sX + 12, sY + pillH / 2);

    ctx.restore();
  }

  private drawToastBanner(
    ctx: CanvasRenderingContext2D,
    vp: RenderViewport,
    toast: ToastBanner,
    alpha: number
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.font = '700 14px Inter, system-ui, sans-serif';
    const textW = ctx.measureText(toast.text).width;
    const bw = textW + 36;
    const bh = 38;
    const bx = vp.offsetX + (vp.drawWidth - bw) / 2;
    const by = vp.offsetY + 22;

    ctx.shadowColor = toast.color;
    ctx.shadowBlur = 20;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = toast.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toast.text, bx + bw / 2, by + bh / 2);

    ctx.restore();
  }
}
