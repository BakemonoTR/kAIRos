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
  private swipeCooldownMs = 320;

  // Wall bump state ("duvara çarptırma")
  private leftWallArmed = true;
  private rightWallArmed = true;
  private lastLeftWallTime = 0;
  private lastRightWallTime = 0;
  private wallCooldownMs = 450;

  private streakPoints: SwipeStreakPoint[] = [];

  reset(): void {
    this.rClenchSmoothed = 0;
    this.lClenchSmoothed = 0;
    this.rIsClosed = false;
    this.lIsClosed = false;
    this.rHistory = [];
    this.lHistory = [];
    this.leftWallArmed = true;
    this.rightWallArmed = true;
    this.lastLeftWallTime = 0;
    this.lastRightWallTime = 0;
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

  private computeJointCurl(mcp: Point3D, pip: Point3D, tip: Point3D): number {
    const v1x = pip.x - mcp.x;
    const v1y = pip.y - mcp.y;
    const v1z = pip.z - mcp.z;

    const v2x = tip.x - pip.x;
    const v2y = tip.y - pip.y;
    const v2z = tip.z - pip.z;

    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

    if (mag1 < 0.005 || mag2 < 0.005) {
      return 0; // Degenerate / unpopulated mock joints
    }

    const cosTheta = Math.max(
      -1,
      Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / (mag1 * mag2))
    );
    // When straight: cosTheta ~ 1.0 -> curl = 0
    // When 90 deg: cosTheta ~ 0.0 -> curl = 0.67
    // When tightly curled into fist: cosTheta ~ -0.5 -> curl = 1.0
    const curl = (1 - cosTheta) / 1.5;
    return Math.max(0, Math.min(1, curl));
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

    const distRatio = Math.max(0, Math.min(1, 1 - (avgDist - closedDist) / (openDist - closedDist)));

    // Knuckle curl from anatomical PIP joints: completely invariant to moving hand left/right
    if (landmarks.length >= 21) {
      const c1 = this.computeJointCurl(landmarks[5], landmarks[6], landmarks[8]);
      const c2 = this.computeJointCurl(landmarks[9], landmarks[10], landmarks[12]);
      const c3 = this.computeJointCurl(landmarks[13], landmarks[14], landmarks[16]);
      const c4 = this.computeJointCurl(landmarks[17], landmarks[18], landmarks[20]);
      const c5 = this.computeJointCurl(landmarks[1], landmarks[2], landmarks[4]);

      const validCurls = [c1, c2, c3, c4, c5].filter((c) => c > 0);
      if (validCurls.length >= 3) {
        const avgCurl = (c1 + c2 + c3 + c4 + c5) / 5;
        return Math.max(0, Math.min(1, 0.70 * avgCurl + 0.30 * distRatio));
      }
    }

    return distRatio;
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
        if (smoothed < 0.38) this.rIsClosed = false;
      } else {
        if (smoothed > 0.52) this.rIsClosed = true;
      }
      isClosed = this.rIsClosed;
    } else {
      this.lClenchSmoothed = this.lClenchSmoothed * 0.65 + rawClench * 0.35;
      smoothed = this.lClenchSmoothed;
      if (this.lIsClosed) {
        if (smoothed < 0.38) this.lIsClosed = false;
      } else {
        if (smoothed > 0.52) this.lIsClosed = true;
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

    // Compute bounds across all landmarks
    let minX = palmCenter.x;
    let maxX = palmCenter.x;
    for (let i = 0; i < landmarks.length; i++) {
      const lx = landmarks[i].x;
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
    }

    // Wall Bump Detection ("Duvara Çarptırma")
    let isLeftWallBump = false;
    let isRightWallBump = false;

    if (!isRight) {
      // Left hand arming: re-arm when hand is in the playing area
      if (palmCenter.x >= 0.22) {
        this.leftWallArmed = true;
      }
      // Left wall hit: hand hits or reaches the left edge of the camera
      const canBumpLeft = nowMs - this.lastLSwipeTime > this.wallCooldownMs && nowMs - this.lastLeftWallTime > this.wallCooldownMs;
      if (
        this.leftWallArmed &&
        (minX <= 0.12 || palmCenter.x <= 0.16) &&
        palmCenter.y >= 0.25 &&
        canBumpLeft
      ) {
        isLeftWallBump = true;
        this.leftWallArmed = false;
        this.lastLeftWallTime = nowMs;
        this.lastLSwipeTime = nowMs;
      }
    } else {
      // Right hand arming: re-arm when hand is in the playing area
      if (palmCenter.x <= 0.78) {
        this.rightWallArmed = true;
      }
      // Right wall hit: hand hits or reaches the right edge of the camera
      const canBumpRight = nowMs - this.lastRSwipeTime > this.wallCooldownMs && nowMs - this.lastRightWallTime > this.wallCooldownMs;
      if (
        this.rightWallArmed &&
        (maxX >= 0.88 || palmCenter.x >= 0.84) &&
        canBumpRight
      ) {
        isRightWallBump = true;
        this.rightWallArmed = false;
        this.lastRightWallTime = nowMs;
        this.lastRSwipeTime = nowMs;
      }
    }

    let velX = 0;
    let velY = 0;
    let swipe: SwipeEvent | null = null;

    if (isLeftWallBump) {
      swipe = { hand: 'L', direction: 'left', timestampMs: nowMs };
      this.addStreakPoints(
        [
          { x: 0.08, y: palmCenter.y, t: nowMs },
          { x: 0.04, y: palmCenter.y, t: nowMs },
          { x: 0.01, y: palmCenter.y, t: nowMs },
        ],
        '#39ff14',
        nowMs
      );
      this.lHistory = [];
    } else if (isRightWallBump) {
      swipe = { hand: 'R', direction: 'right', timestampMs: nowMs };
      this.addStreakPoints(
        [
          { x: 0.92, y: palmCenter.y, t: nowMs },
          { x: 0.96, y: palmCenter.y, t: nowMs },
          { x: 0.99, y: palmCenter.y, t: nowMs },
        ],
        '#39ff14',
        nowMs
      );
      this.rHistory = [];
    }

    let isLeftDrumSwipe = false;
    let isRightSynthSwipe = false;
    let isDownwardPresetSwipe = false;

    // Search for swipe strokes across any interval in the recent 30ms to 240ms window
    if (!swipe && history.length >= 2) {
      let peakVelX = 0;
      let peakVelY = 0;

      for (let i = history.length - 2; i >= 0; i--) {
        const past = history[i];
        const dt = (nowMs - past.t) / 1000;
        if (dt >= 0.030 && dt <= 0.24) {
          const dx = palmCenter.x - past.x;
          const dy = palmCenter.y - past.y;
          const vX = dx / dt;
          const vY = dy / dt;

          if (Math.abs(vX) > Math.abs(peakVelX)) peakVelX = vX;
          if (vY > peakVelY) peakVelY = vY;

          // Left Drum Swipe: Left hand moving LEFT (towards edge)
          const nearLeftEdge = palmCenter.x <= 0.25;
          const minLeftDist = nearLeftEdge ? -0.025 : -0.032;
          const minLeftVel = nearLeftEdge ? -0.30 : -0.38;

          if (!isRight && palmCenter.y >= 0.25 && dx <= minLeftDist && vX <= minLeftVel) {
            isLeftDrumSwipe = true;
          }

          // Right Synth Swipe: Right hand moving RIGHT (towards outer edge)
          if (isRight && dx >= 0.035 && vX >= 0.38) {
            isRightSynthSwipe = true;
          }

          // Downward Preset Swipe: Right hand moving DOWN with open hand
          if (isRight && smoothed < 0.42 && !isClosed && dy >= 0.075 && vY >= 0.55) {
            isDownwardPresetSwipe = true;
          }
        }
      }

      velX = peakVelX;
      velY = peakVelY;

      const lastSwipe = isRight ? this.lastRSwipeTime : this.lastLSwipeTime;
      const canSwipe = nowMs - lastSwipe > this.swipeCooldownMs;

      if (canSwipe) {
        if (isDownwardPresetSwipe) {
          const direction = 'down';
          const color = '#38bdf8'; // Sky cyan streak
          this.lastRSwipeTime = nowMs;
          this.lastRightWallTime = nowMs;
          swipe = { hand: 'R', direction, timestampMs: nowMs };
          this.addStreakPoints(history, color, nowMs);
          this.rHistory = [];
        } else if (isRightSynthSwipe) {
          const direction = 'right';
          const color = '#818cf8'; // Indigo streak
          this.lastRSwipeTime = nowMs;
          this.lastRightWallTime = nowMs;
          swipe = { hand: 'R', direction, timestampMs: nowMs };
          this.addStreakPoints(history, color, nowMs);
          this.rHistory = [];
        } else if (isLeftDrumSwipe) {
          const direction = 'left';
          const color = '#f43f5e'; // Rose streak
          this.lastLSwipeTime = nowMs;
          this.lastLeftWallTime = nowMs;
          swipe = { hand: 'L', direction, timestampMs: nowMs };
          this.addStreakPoints(history, color, nowMs);
          this.lHistory = [];
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
