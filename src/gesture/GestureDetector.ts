import { Point3D, SwipeEvent } from '../types';

export interface HandGestureState {
  hand: 'L' | 'R';
  palmCenter: Point3D;
  clenchRatio: number;
  isClosed: boolean;
  velocityX: number;
  velocityY: number;
}

export interface SwipeStreakPoint {
  x: number;
  y: number;
  alpha: number;
  color: string;
  timestampMs: number;
}

interface PointHistoryItem {
  x: number;
  y: number;
  t: number;
}

export class GestureDetector {
  private rClenchSmoothed = 0;
  private lClenchSmoothed = 0;
  private rIsClosed = false;
  private lIsClosed = false;

  private rHistory: PointHistoryItem[] = [];
  private lHistory: PointHistoryItem[] = [];

  private lastRSwipeTime = 0;
  private lastLSwipeTime = 0;
  private swipeCooldownMs = 450;

  private streakPoints: SwipeStreakPoint[] = [];

  reset(): void {
    this.rClenchSmoothed = 0;
    this.lClenchSmoothed = 0;
    this.rIsClosed = false;
    this.lIsClosed = false;
    this.rHistory = [];
    this.lHistory = [];
    this.streakPoints = [];
  }

  private dist3D(a: Point3D, b: Point3D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  computeHandGeometry(landmarks: Point3D[]): {
    palmCenter: Point3D;
    handScale: number;
  } {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];

    const palmCenter: Point3D = {
      x: (wrist.x + middleMcp.x) * 0.5,
      y: (wrist.y + middleMcp.y) * 0.5,
      z: (wrist.z + middleMcp.z) * 0.5,
    };

    const handScale = Math.max(0.04, this.dist3D(wrist, middleMcp));
    return { palmCenter, handScale };
  }

  computeClenchRatio(landmarks: Point3D[]): number {
    const { palmCenter, handScale } = this.computeHandGeometry(landmarks);

    const tipIndices = [4, 8, 12, 16, 20];
    let totalDist = 0;

    for (const idx of tipIndices) {
      const tip = landmarks[idx];
      totalDist += this.dist3D(tip, palmCenter);
    }

    const avgDist = (totalDist / tipIndices.length) / handScale;

    const openDist = 1.35;
    const closedDist = 0.52;

    const rawRatio = 1 - (avgDist - closedDist) / (openDist - closedDist);
    return Math.max(0, Math.min(1, rawRatio));
  }

  /**
   * Process a frame's hand landmarks to detect clench state and swipes.
   * Uses peak-stroke search across the last 50-250ms so stationary frames
   * prior to the swipe motion do not dilute the velocity.
   */
  process(
    handType: 'L' | 'R',
    landmarks: Point3D[],
    nowMs: number
  ): {
    gestureState: HandGestureState;
    swipe: SwipeEvent | null;
  } {
    const { palmCenter } = this.computeHandGeometry(landmarks);
    const rawClench = this.computeClenchRatio(landmarks);

    const isRight = handType === 'R';
    let smoothed: number;
    let isClosed: boolean;

    if (isRight) {
      this.rClenchSmoothed = this.rClenchSmoothed * 0.65 + rawClench * 0.35;
      smoothed = this.rClenchSmoothed;
      if (this.rIsClosed) {
        if (smoothed < 0.36) this.rIsClosed = false;
      } else {
        if (smoothed > 0.44) this.rIsClosed = true;
      }
      isClosed = this.rIsClosed;
    } else {
      this.lClenchSmoothed = this.lClenchSmoothed * 0.65 + rawClench * 0.35;
      smoothed = this.lClenchSmoothed;
      if (this.lIsClosed) {
        if (smoothed < 0.36) this.lIsClosed = false;
      } else {
        if (smoothed > 0.44) this.lIsClosed = true;
      }
      isClosed = this.lIsClosed;
    }

    const history = isRight ? this.rHistory : this.lHistory;
    history.push({ x: palmCenter.x, y: palmCenter.y, t: nowMs });

    // Prune history older than 300ms
    const cutoff = nowMs - 300;
    while (history.length > 0 && history[0].t < cutoff) {
      history.shift();
    }

    let velX = 0;
    let velY = 0;
    let swipe: SwipeEvent | null = null;

    // Search for maximum horizontal displacement in the recent 45ms to 240ms window
    if (history.length >= 2) {
      let maxAbsDx = 0;
      let bestDx = 0;
      let bestDt = 0;

      for (let i = history.length - 2; i >= 0; i--) {
        const past = history[i];
        const dt = (nowMs - past.t) / 1000;
        if (dt >= 0.045 && dt <= 0.25) {
          const dx = palmCenter.x - past.x;
          if (Math.abs(dx) > maxAbsDx) {
            maxAbsDx = Math.abs(dx);
            bestDx = dx;
            bestDt = dt;
          }
        }
      }

      if (bestDt > 0) {
        velX = bestDx / bestDt;
        const lastSwipe = isRight ? this.lastRSwipeTime : this.lastLSwipeTime;
        const canSwipe = nowMs - lastSwipe > this.swipeCooldownMs;

        // Threshold: at least 0.08 screen width moved and at least 0.80 width/sec velocity
        if (canSwipe && maxAbsDx >= 0.08 && Math.abs(velX) >= 0.80) {
          const direction: 'left' | 'right' = bestDx > 0 ? 'right' : 'left';
          const color = isRight ? '#818cf8' : '#f43f5e';

          if (isRight) {
            this.lastRSwipeTime = nowMs;
            swipe = { hand: 'R', direction, timestampMs: nowMs };
          } else {
            this.lastLSwipeTime = nowMs;
            swipe = { hand: 'L', direction, timestampMs: nowMs };
          }

          this.addStreakPoints(history, color, nowMs);
          // Clear history after trigger to prevent backswing re-triggering
          if (isRight) this.rHistory = [];
          else this.lHistory = [];
        }
      }
    }

    const gestureState: HandGestureState = {
      hand: handType,
      palmCenter,
      clenchRatio: smoothed,
      isClosed,
      velocityX: velX,
      velocityY: velY,
    };

    return { gestureState, swipe };
  }

  private addStreakPoints(history: PointHistoryItem[], color: string, nowMs: number): void {
    for (const pt of history) {
      this.streakPoints.push({
        x: pt.x,
        y: pt.y,
        alpha: 1.0,
        color,
        timestampMs: nowMs,
      });
    }
  }

  getStreakPoints(nowMs: number): SwipeStreakPoint[] {
    this.streakPoints = this.streakPoints
      .map((p) => {
        const age = nowMs - p.timestampMs;
        const alpha = Math.max(0, 1 - age / 400);
        return { ...p, alpha };
      })
      .filter((p) => p.alpha > 0.02);

    return this.streakPoints;
  }
}
