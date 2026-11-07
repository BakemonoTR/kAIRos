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
  private swipeCooldownMs = 600;

  private streakPoints: SwipeStreakPoint[] = [];

  /**
   * Resets gesture tracker states
   */
  reset(): void {
    this.rClenchSmoothed = 0;
    this.lClenchSmoothed = 0;
    this.rIsClosed = false;
    this.lIsClosed = false;
    this.rHistory = [];
    this.lHistory = [];
    this.streakPoints = [];
  }

  /**
   * Computes 3D distance between two points
   */
  private dist3D(a: Point3D, b: Point3D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculates palm center and hand scale from MediaPipe landmarks
   */
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

  /**
   * Calculates hand clench ratio (0 = fully open, 1 = tight fist)
   * Uses normalized distances of fingertips to palm center.
   */
  computeClenchRatio(landmarks: Point3D[]): number {
    const { palmCenter, handScale } = this.computeHandGeometry(landmarks);

    // Tips: 4 (thumb), 8 (index), 12 (middle), 16 (ring), 20 (pinky)
    const tipIndices = [4, 8, 12, 16, 20];
    let totalDist = 0;

    for (const idx of tipIndices) {
      const tip = landmarks[idx];
      totalDist += this.dist3D(tip, palmCenter);
    }

    const avgDist = (totalDist / tipIndices.length) / handScale;

    // Open hand tip distance to palm center is ~1.30 - 1.65
    // Closed fist tip distance is ~0.45 - 0.65
    const openDist = 1.35;
    const closedDist = 0.52;

    const rawRatio = 1 - (avgDist - closedDist) / (openDist - closedDist);
    return Math.max(0, Math.min(1, rawRatio));
  }

  /**
   * Process a frame's hand landmarks to detect clench state and swipes
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

    // Smooth clench ratio
    const isRight = handType === 'R';
    let smoothed: number;
    let isClosed: boolean;

    if (isRight) {
      this.rClenchSmoothed = this.rClenchSmoothed * 0.65 + rawClench * 0.35;
      smoothed = this.rClenchSmoothed;
      // Hysteresis threshold
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

    // Maintain history for swipe detection (window of ~200ms)
    const history = isRight ? this.rHistory : this.lHistory;
    history.push({ x: palmCenter.x, y: palmCenter.y, t: nowMs });

    // Prune history older than 260ms
    const cutoff = nowMs - 260;
    while (history.length > 0 && history[0].t < cutoff) {
      history.shift();
    }

    // Velocity computation over recent ~120-180ms
    let velX = 0;
    let velY = 0;
    let swipe: SwipeEvent | null = null;

    if (history.length >= 3) {
      const oldest = history[0];
      const dt = (nowMs - oldest.t) / 1000;
      if (dt > 0.06) {
        velX = (palmCenter.x - oldest.x) / dt;
        velY = (palmCenter.y - oldest.y) / dt;
        const dx = palmCenter.x - oldest.x;

        const lastSwipe = isRight ? this.lastRSwipeTime : this.lastLSwipeTime;
        const canSwipe = nowMs - lastSwipe > this.swipeCooldownMs;

        if (canSwipe) {
          // Right Hand: Swipe Right (outward throw towards right side)
          if (isRight && dx > 0.13 && velX > 1.35) {
            this.lastRSwipeTime = nowMs;
            swipe = { hand: 'R', direction: 'right', timestampMs: nowMs };
            this.addStreakPoints(history, '#818cf8', nowMs);
          }
          // Left Hand: Swipe Left (outward throw towards left side)
          else if (!isRight && dx < -0.13 && velX < -1.35) {
            this.lastLSwipeTime = nowMs;
            swipe = { hand: 'L', direction: 'left', timestampMs: nowMs };
            this.addStreakPoints(history, '#f43f5e', nowMs);
          }
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
    // Fade and prune streaks older than 400ms
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
