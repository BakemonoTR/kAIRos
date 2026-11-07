import { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  AppMode,
  FINGER_METAS,
  FingerId,
  MappedFinger,
  MappedHandsResult,
  Point3D,
} from '../types';

function dist2D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Returns normalized flexion (0 = straight, ~1 = 90 deg bent, ~2 = folded)
 * from 3 sequential joints (mcp -> pip -> tip).
 */
function computeJointFlexion(mcp: Point3D, pip: Point3D, tip: Point3D): number {
  const v1x = pip.x - mcp.x;
  const v1y = pip.y - mcp.y;
  const v1z = pip.z - mcp.z;

  const v2x = tip.x - pip.x;
  const v2y = tip.y - pip.y;
  const v2z = tip.z - pip.z;

  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z) || 1e-5;
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z) || 1e-5;
  const cosTheta = Math.max(
    -1,
    Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / (mag1 * mag2))
  );
  return 1 - cosTheta; // 0 when collinear, increases as finger curls
}

interface HandTrack {
  landmarks: Point3D[];
  center: Point3D;
  lastSeenMs: number;
}

const HOLD_MS = 120; // keep a briefly-lost hand alive to bridge detector flicker
const CONTINUITY_MS = 600; // how long a previous hand position is trusted for identity
const HANDEDNESS_EMA = 0.25;

function palmCenter(lms: Point3D[]): Point3D {
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0, z = 0;
  for (const i of ids) {
    x += lms[i].x;
    y += lms[i].y;
    z += lms[i].z;
  }
  return { x: x / ids.length, y: y / ids.length, z: z / ids.length };
}

/**
 * Anatomical chirality detection in mirrored screen coordinates.
 * In mirrored view:
 * - User's Right Hand: Pinky is to the right of Index (pinkyMcp.x > indexMcp.x),
 *   and Thumb is to the left of Pinky (thumbTip.x < pinkyMcp.x).
 * - User's Left Hand: Pinky is to the left of Index (pinkyMcp.x < indexMcp.x),
 *   and Thumb is to the right of Pinky (thumbTip.x > pinkyMcp.x).
 * This geometric relationship holds true in both dorsal (palm down/piano pose)
 * and palmar (palm facing camera) playing styles.
 */
function determineHandChirality(landmarks: Point3D[]): 'L' | 'R' | null {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];
  const thumbTip = landmarks[4];

  const palmScale = Math.max(0.04, dist2D(wrist, middleMcp));
  const knuckleDeltaX = (pinkyMcp.x - indexMcp.x) / palmScale;
  const thumbDeltaX = (thumbTip.x - pinkyMcp.x) / palmScale;

  // 2D cross product of wrist->middleMcp and wrist->indexMcp for orientation stability
  const vMiddleX = middleMcp.x - wrist.x;
  const vMiddleY = middleMcp.y - wrist.y;
  const vIndexX = indexMcp.x - wrist.x;
  const vIndexY = indexMcp.y - wrist.y;
  const crossZ = vMiddleX * vIndexY - vMiddleY * vIndexX;

  let score = 0;
  if (knuckleDeltaX > 0.12) score += 2;
  else if (knuckleDeltaX < -0.12) score -= 2;

  if (thumbDeltaX < -0.15) score += 1;
  else if (thumbDeltaX > 0.15) score -= 1;

  if (crossZ > 0.002) score -= 1;
  else if (crossZ < -0.002) score += 1;

  if (score >= 2) return 'R';
  if (score <= -2) return 'L';
  return null;
}

export class FingerMapper {
  private tracks: { L: HandTrack | null; R: HandTrack | null } = { L: null, R: null };
  // Smoothed probability that a lone visible hand is the user's RIGHT hand
  private loneRightProb = 0.5;
  private loneLabel: 'L' | 'R' | null = null;

  /**
   * Converts raw MediaPipe landmarks to mirrored screen coordinates (x = 1 - x)
   * and maps each detected hand to FingerIds 0..9.
   * Hand identity is stabilised with position + temporal continuity instead of
   * trusting per-frame handedness (which flips when the back of the hand is shown).
   */
  map(
    result: HandLandmarkerResult | null,
    nowMs = performance.now(),
    appMode?: AppMode
  ): MappedHandsResult {
    const fingers = new Map<FingerId, MappedFinger>();
    const rawHands: MappedHandsResult['rawHands'] = [];

    const handednessArray = result?.handedness ?? result?.handednesses;
    const detected = (result?.landmarks ?? []).map((lms, idx) => {
      const mirrored: Point3D[] = lms.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
      const cat = handednessArray?.[idx]?.[0];
      // Unmirrored input → MediaPipe's label is inverted relative to the user
      const rawRight = cat?.categoryName === 'Left' ? 1 : 0;
      const score = cat?.score ?? 0.5;
      const rightProb = 0.5 + (rawRight - 0.5) * score;
      return { landmarks: mirrored, center: palmCenter(mirrored), rightProb };
    });

    const assigned: { L: Point3D[] | null; R: Point3D[] | null } = { L: null, R: null };

    if (detected.length >= 2) {
      // Two hands: screen position is the most reliable cue (hands rarely cross on a keyboard)
      const sorted = [...detected].sort((a, b) => a.center.x - b.center.x);
      assigned.L = sorted[0].landmarks;
      assigned.R = sorted[sorted.length - 1].landmarks;
      this.loneLabel = null;
      this.loneRightProb = 0.5;
    } else if (detected.length === 1) {
      const d = detected[0];
      this.loneRightProb =
        this.loneRightProb * (1 - HANDEDNESS_EMA) + d.rightProb * HANDEDNESS_EMA;

      let label: 'L' | 'R' | null = null;
      const MAX_CONTINUITY_JUMP = 0.25;

      // In Theremin mode, screen side is absolute anchor to prevent Theremin jumping to Left hand
      if (appMode === 'theremin') {
        label = d.center.x < 0.48 ? 'L' : 'R';
      } else {
        // 1) Spatial continuity with recently tracked hands
        const distL =
          this.tracks.L && nowMs - this.tracks.L.lastSeenMs < CONTINUITY_MS
            ? Math.hypot(this.tracks.L.center.x - d.center.x, this.tracks.L.center.y - d.center.y)
            : Infinity;
        const distR =
          this.tracks.R && nowMs - this.tracks.R.lastSeenMs < CONTINUITY_MS
            ? Math.hypot(this.tracks.R.center.x - d.center.x, this.tracks.R.center.y - d.center.y)
            : Infinity;

        if (distL < MAX_CONTINUITY_JUMP && distR < MAX_CONTINUITY_JUMP) {
          if (distL < distR * 0.75) label = 'L';
          else if (distR < distL * 0.75) label = 'R';
        } else if (distL < MAX_CONTINUITY_JUMP && distR === Infinity) {
          label = 'L';
        } else if (distR < MAX_CONTINUITY_JUMP && distL === Infinity) {
          label = 'R';
        }

        const isFarLeft = d.center.x < 0.40;
        const isFarRight = d.center.x > 0.60;

        if (label === 'R' && isFarLeft && distL === Infinity) label = null;
        if (label === 'L' && isFarRight && distR === Infinity) label = null;

        // 2) Anatomical chirality check (invariant under piano and upright poses)
        if (!label) {
          const anatomy = determineHandChirality(d.landmarks);
          if (anatomy) {
            if (anatomy === 'R' && isFarLeft) label = 'L';
            else if (anatomy === 'L' && isFarRight) label = 'R';
            else label = anatomy;
          }
        }

        // 3) Keep previous lone label if consistent with position
        if (!label && this.loneLabel) {
          const expectedSide = this.loneLabel === 'L' ? d.center.x < 0.6 : d.center.x > 0.4;
          if (expectedSide) {
            label = this.loneLabel;
          }
        }

        // 4) Fresh hand fallback: screen side (mirrored: left half < 0.5 is Left, right half >= 0.5 is Right)
        if (!label) {
          if (isFarLeft) label = 'L';
          else if (isFarRight) label = 'R';
          else if (this.loneRightProb > 0.65) label = 'R';
          else if (this.loneRightProb < 0.35) label = 'L';
          else label = d.center.x < 0.5 ? 'L' : 'R';
        }
      }

      this.loneLabel = label;
      assigned[label] = d.landmarks;
    } else {
      this.loneLabel = null;
    }

    // Update tracks / hold briefly-lost hands
    for (const side of ['L', 'R'] as const) {
      const lms = assigned[side];
      if (lms) {
        this.tracks[side] = { landmarks: lms, center: palmCenter(lms), lastSeenMs: nowMs };
      } else {
        const t = this.tracks[side];
        if (t && nowMs - t.lastSeenMs < HOLD_MS) {
          // Only hold if the other hand isn't now occupying that position
          const other = assigned[side === 'L' ? 'R' : 'L'];
          const clash =
            other &&
            Math.hypot(palmCenter(other).x - t.center.x, palmCenter(other).y - t.center.y) < 0.08;
          if (!clash) assigned[side] = t.landmarks;
        }
      }
    }

    for (const hand of ['L', 'R'] as const) {
      const landmarks = assigned[hand];
      if (!landmarks) continue;
      rawHands.push({ hand, landmarks });

      const wrist = landmarks[0];
      const indexMcp = landmarks[5];
      const middleMcp = landmarks[9];
      const pinkyMcp = landmarks[17];

      // Hand size normalization (wrist -> middle MCP, clamped for stability)
      const palmLen = dist2D(wrist, middleMcp);
      const palmWidth = dist2D(indexMcp, pinkyMcp);
      const handScale = Math.max(0.04, Math.max(palmLen, palmWidth * 1.1));

      for (const meta of FINGER_METAS) {
        if (meta.hand !== hand) continue;

        const tip = landmarks[meta.tipLandmark];
        const pip = landmarks[meta.pipLandmark];
        const mcp = landmarks[meta.mcpLandmark];

        let rawBend: number;
        if (meta.isThumb) {
          // Thumb tap in air piano / drums:
          // 1) Full downward swing from the CMC basal joint (landmark 1 at the wrist)
          // 2) Tip flexion relative to MCP joint (landmark 2)
          // 3) Joint curl along the thumb ray
          // 4) Inward travel toward palm center (wrist + middle MCP midpoint)
          const cmc = landmarks[1];
          const downCmc = (tip.y - cmc.y) / handScale;
          const downMcp = (tip.y - mcp.y) / handScale;
          const flex = computeJointFlexion(cmc, mcp, tip);
          const palmCenterPt: Point3D = {
            x: (wrist.x + middleMcp.x) * 0.5,
            y: (wrist.y + middleMcp.y) * 0.5,
            z: (wrist.z + middleMcp.z) * 0.5,
          };
          const inwardPalm = Math.max(0, 0.75 - dist2D(tip, palmCenterPt) / handScale);
          rawBend = 0.80 * downCmc + 0.35 * downMcp + 0.40 * flex + 0.30 * inwardPalm;
        } else {
          // Piano strike = downward motion (+Y) + active joint flexion (curl)
          // Higher flexion weight amplifies intentional strikes and suppresses passive dragging
          const downRatio = (tip.y - mcp.y) / handScale;
          const flex = computeJointFlexion(mcp, pip, tip);
          rawBend = 0.80 * downRatio + 0.45 * flex;
        }

        fingers.set(meta.id, {
          fingerId: meta.id,
          hand,
          tip,
          pip,
          mcp,
          wrist,
          indexMcp,
          pinkyMcp,
          handScale,
          rawBend,
        });
      }
    }

    return { fingers, rawHands };
  }
}
