import {
  AppSettings,
  FINGER_METAS,
  FingerId,
  MappedHandsResult,
  NoteOffEvent,
  SlotData,
  TapEvent,
} from '../types';

/**
 * One-Euro Filter (Casiez et al., CHI 2012), used for POSITION only.
 * Velocity is computed separately with light smoothing so peaks are not crushed.
 */
class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    private minCutoff = 1.0,
    private beta = 0.8,
    private dCutoff = 5.0
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x: number, tSec: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tSec;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.max(1 / 240, Math.min(0.1, tSec - this.tPrev));
    this.tPrev = tSec;
    const rawDx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dxPrev = aD * rawDx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const aX = this.alpha(cutoff, dt);
    this.xPrev = aX * x + (1 - aX) * this.xPrev;
    return this.xPrev;
  }

  reset(): void {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

type FingerPhase = 'IDLE' | 'PRESSED' | 'RELEASING' | 'SUPPRESSED';

interface FingerRuntimeState {
  phase: FingerPhase;
  posFilter: OneEuroFilter;
  pos: number | null; // filtered bend
  prevPos: number | null;
  prevRaw: number | null;
  prevT: number | null;
  vel: number; // lightly smoothed bend velocity (units/sec)
  velHistory: Array<{ t: number; v: number }>; // isolated velocity history for peak lookup
  restBend: number | null;
  calibratedRest: number | null;
  stillSinceMs: number;
  lastTriggerMs: number;
  lastSeenMs: number;
  warmupFrames: number;
  pressPeak: number;
  // per-frame scratch
  delta: number;
  present: boolean;
}

interface Candidate {
  fingerId: FingerId;
  hand: 'L' | 'R';
  peakVel: number;
  velocity: number;
}

// Tuning constants
const COOLDOWN_MS = 60;
const PEAK_WINDOW_MS = 60; // look-back window for velocity peak during strike
const NEIGHBOR_WINDOW_MS = 110; // after a hit, adjacent fingers need a stronger signal
const NEIGHBOR_PENALTY = 1.9;
const COMMON_MODE_K = 0.65; // how much of the other fingers' motion is subtracted
const CHORD_RATIO = 0.75; // a 2nd finger in same frame must reach 75% of winner's peak velocity
const RELEASE_FRACTION = 0.4; // release when bend drops 40% of downThreshold from its peak
const LOST_RESET_MS = 350;
const STILL_REQUIRED_MS = 250;
const BASELINE_RATE = 0.03;
const VEL_EMA = 0.40; // weight of newest position derivative

export class TapDetector {
  private states = new Map<FingerId, FingerRuntimeState>();
  private lastHitByFinger = new Map<FingerId, number>();

  private calibrating = false;
  private calibrationSamples = new Map<FingerId, number[]>();

  constructor() {
    for (const meta of FINGER_METAS) {
      this.states.set(meta.id, {
        phase: 'IDLE',
        posFilter: new OneEuroFilter(1.0, 0.8, 5.0),
        pos: null,
        prevPos: null,
        prevRaw: null,
        prevT: null,
        vel: 0,
        velHistory: [],
        restBend: null,
        calibratedRest: null,
        stillSinceMs: 0,
        lastTriggerMs: -1000,
        lastSeenMs: -1000,
        warmupFrames: 6,
        pressPeak: 0,
        delta: 0,
        present: false,
      });
    }
  }

  beginCalibration(): void {
    this.calibrating = true;
    this.calibrationSamples.clear();
    for (const meta of FINGER_METAS) this.calibrationSamples.set(meta.id, []);
  }

  finishCalibration(): number {
    this.calibrating = false;
    let count = 0;
    for (const [fingerId, samples] of this.calibrationSamples.entries()) {
      if (samples.length >= 5) {
        const sorted = [...samples].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const st = this.states.get(fingerId)!;
        st.calibratedRest = median;
        st.restBend = median;
        st.phase = 'IDLE';
        count++;
      }
    }
    this.calibrationSamples.clear();
    return count;
  }

  isCalibrating(): boolean {
    return this.calibrating;
  }

  private neighborsOf(meta: (typeof FINGER_METAS)[number]): FingerId[] {
    // Anatomical neighbors within the same hand, including thumb-index coupling
    const sameHand = FINGER_METAS.filter((m) => m.hand === meta.hand);
    const order = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    const myIdx = order.findIndex((o) => meta.code.endsWith(o));
    return sameHand
      .filter((m) => {
        const i = order.findIndex((o) => m.code.endsWith(o));
        return Math.abs(i - myIdx) === 1;
      })
      .map((m) => m.id);
  }

  process(
    mapped: MappedHandsResult,
    slots: SlotData[],
    settings: AppSettings,
    nowMs: number
  ): { taps: TapEvent[]; releases: NoteOffEvent[] } {
    const tSec = nowMs / 1000;
    const releases: NoteOffEvent[] = [];
    const candidates: Candidate[] = [];

    // ---------- Pass 1: update filters, velocity, delta for every finger ----------
    for (const meta of FINGER_METAS) {
      const st = this.states.get(meta.id)!;
      const fData = mapped.fingers.get(meta.id);
      st.present = !!fData;

      if (!fData) {
        if (st.phase === 'PRESSED' && nowMs - st.lastSeenMs > 100) {
          st.phase = 'IDLE';
          releases.push({ fingerId: meta.id, timestampMs: nowMs });
        }
        if (nowMs - st.lastSeenMs > LOST_RESET_MS) {
          st.posFilter.reset();
          st.pos = null;
          st.prevPos = null;
          st.prevRaw = null;
          st.prevT = null;
          st.vel = 0;
          st.velHistory = [];
          st.warmupFrames = 6;
          st.restBend = null; // Clean baseline reset so re-entering hand adapts to current posture
          if (st.phase === 'SUPPRESSED' || st.phase === 'RELEASING') st.phase = 'IDLE';
        }
        continue;
      }

      st.lastSeenMs = nowMs;
      const raw = fData.rawBend;
      st.pos = st.posFilter.filter(raw, tSec);

      // Velocity: computed from One-Euro filtered position to eliminate raw landmark jitter noise spikes
      if (st.prevPos !== null && st.prevT !== null) {
        const dt = Math.max(1 / 240, Math.min(0.1, tSec - st.prevT));
        const rawVel = (st.pos - st.prevPos) / dt;
        st.vel = VEL_EMA * rawVel + (1 - VEL_EMA) * st.vel;
      } else {
        st.vel = 0;
      }
      st.prevPos = st.pos;
      st.prevRaw = raw;
      st.prevT = tSec;

      if (this.calibrating) {
        this.calibrationSamples.get(meta.id)?.push(st.pos);
        continue;
      }

      if (st.restBend === null) {
        st.restBend = st.calibratedRest ?? st.pos;
      }
      st.delta = st.pos - st.restBend;
    }

    if (this.calibrating) return { taps: [], releases };

    // ---------- Pass 2: common-mode rejection + state machine ----------
    for (const meta of FINGER_METAS) {
      const fId = meta.id;
      const st = this.states.get(fId)!;
      if (!st.present || st.pos === null || st.restBend === null) continue;

      // Common-mode subtraction: subtract average motion of other fingers of the same hand
      // Isolates intentional finger movements from overall hand/wrist shifts
      let isolated = st.delta;
      let isolatedVel = st.vel;
      const others = FINGER_METAS.filter(
        (m) => m.hand === meta.hand && m.id !== fId
      )
        .map((m) => this.states.get(m.id)!)
        .filter((o) => o.present && o.pos !== null);

      if (others.length > 0) {
        const meanDelta = others.reduce((a, o) => a + Math.max(0, o.delta), 0) / others.length;
        const meanVel = others.reduce((a, o) => a + Math.max(0, o.vel), 0) / others.length;
        const k = meta.isThumb ? 0.50 : COMMON_MODE_K;
        isolated -= k * meanDelta;
        isolatedVel -= k * meanVel;
      }

      // Velocity peak history (isolated)
      st.velHistory.push({ t: nowMs, v: isolatedVel });
      while (st.velHistory.length && nowMs - st.velHistory[0].t > PEAK_WINDOW_MS) {
        st.velHistory.shift();
      }
      const peakVel = st.velHistory.reduce((m, h) => Math.max(m, h.v), -Infinity);

      // Baseline adaptation: only adapt while finger is steady and idle
      if (Math.abs(st.vel) < 0.45) {
        if (st.stillSinceMs === 0) st.stillSinceMs = nowMs;
      } else {
        st.stillSinceMs = 0;
      }
      const handBusy = FINGER_METAS.some(
        (m) => m.hand === meta.hand && this.states.get(m.id)!.phase === 'PRESSED'
      );
      if (
        st.phase === 'IDLE' &&
        !handBusy &&
        st.stillSinceMs !== 0 &&
        nowMs - st.stillSinceMs >= STILL_REQUIRED_MS
      ) {
        // If finger is lifted higher than restBend, adapt up faster to prevent stuck threshold
        const rate = st.pos < st.restBend ? 0.06 : BASELINE_RATE;
        const target =
          st.calibratedRest !== null ? 0.6 * st.calibratedRest + 0.4 * st.pos : st.pos;
        st.restBend += (target - st.restBend) * rate;
      }

      if (st.warmupFrames > 0) {
        st.warmupFrames--;
        // While warming up, track restBend tightly to current position
        if (st.calibratedRest === null) {
          st.restBend = st.pos;
        }
        continue;
      }

      const slot = slots[fId];
      if (!slot || !slot.enabled) {
        if (st.phase === 'PRESSED') releases.push({ fingerId: fId, timestampMs: nowMs });
        st.phase = 'IDLE';
        continue;
      }

      const sens = Math.max(0.35, settings.sensitivity);
      let downThreshold = (meta.isThumb ? 0.19 : 0.17) / sens;
      let velThreshold = settings.velocityThreshold / sens;
      const upThreshold = downThreshold * 0.45;

      // Neighbor penalty: an adjacent finger was just hit → require a stronger signal
      if (settings.sympathySuppression) {
        const recentNeighborHit = this.neighborsOf(meta).some((nId) => {
          const t = this.lastHitByFinger.get(nId);
          return t !== undefined && nowMs - t < NEIGHBOR_WINDOW_MS;
        });
        if (recentNeighborHit) {
          downThreshold *= NEIGHBOR_PENALTY;
          velThreshold *= NEIGHBOR_PENALTY;
        }
      }

      switch (st.phase) {
        case 'IDLE': {
          const cooled = nowMs - st.lastTriggerMs >= COOLDOWN_MS;
          // Crucial: finger must be actively moving downwards right now (not resting or lifting)
          const activelyMoving = isolatedVel > 0.20 * velThreshold;
          if (cooled && isolated >= downThreshold && peakVel >= velThreshold && activelyMoving) {
            const velocity = Math.min(
              1.0,
              Math.max(0.25, 0.32 + (peakVel - velThreshold) / (velThreshold * 2.4))
            );
            candidates.push({ fingerId: fId, hand: meta.hand, peakVel, velocity });
            st.phase = 'PRESSED';
            st.pressPeak = isolated;
          }
          break;
        }
        case 'PRESSED': {
          st.pressPeak = Math.max(st.pressPeak, isolated);
          const droppedFromPeak = isolated <= st.pressPeak - RELEASE_FRACTION * downThreshold;
          const liftingFast = st.vel < -0.4 * velThreshold;
          const reachedRest = isolated <= upThreshold;

          if (reachedRest || droppedFromPeak || liftingFast) {
            releases.push({ fingerId: fId, timestampMs: nowMs });
            st.velHistory = [];
            // If already back at rest, return to IDLE;
            // otherwise, enter RELEASING so it cannot re-trigger until fully released back up!
            st.phase = reachedRest ? 'IDLE' : 'RELEASING';
          }
          break;
        }
        case 'RELEASING': {
          // Locked in release: cannot re-trigger until finger rises back to rest position
          if (isolated <= upThreshold) {
            st.phase = 'IDLE';
            st.velHistory = [];
          }
          break;
        }
        case 'SUPPRESSED': {
          // Locked until the finger comes back up — prevents re-trigger on next frame
          if (isolated <= upThreshold || st.vel < -0.4 * velThreshold) {
            st.phase = 'IDLE';
            st.velHistory = [];
          }
          break;
        }
      }
    }

    if (candidates.length === 0) return { taps: [], releases };

    // ---------- Pass 3: per-hand dominance / chord resolution ----------
    const accepted: TapEvent[] = [];
    for (const hand of ['L', 'R'] as const) {
      const hc = candidates.filter((c) => c.hand === hand).sort((a, b) => b.peakVel - a.peakVel);
      if (hc.length === 0) continue;
      const winner = hc[0];

      for (const c of hc) {
        const isWinner = c === winner;
        const chordOk = !settings.sympathySuppression || c.peakVel >= winner.peakVel * CHORD_RATIO;
        const st = this.states.get(c.fingerId)!;
        if (isWinner || chordOk) {
          st.lastTriggerMs = nowMs;
          this.lastHitByFinger.set(c.fingerId, nowMs);
          accepted.push({ fingerId: c.fingerId, velocity: c.velocity, timestampMs: nowMs });
        } else {
          st.phase = 'SUPPRESSED';
        }
      }
    }

    return { taps: accepted, releases };
  }
}
