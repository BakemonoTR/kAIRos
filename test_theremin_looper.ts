import { GestureDetector } from './src/gesture/GestureDetector';
import { TapDetector } from './src/gesture/TapDetector';
import { ThereminEngine } from './src/audio/ThereminEngine';
import { AirLooper } from './src/audio/AirLooper';
import { Metronome } from './src/audio/Metronome';
import { FingerMapper } from './src/tracking/FingerMapper';
import { AppSettings, FINGER_METAS, FingerId, Point3D, SlotData } from './src/types';

function createMockHand(clench: 'open' | 'closed', x = 0.5, y = 0.5): Point3D[] {
  const lms: Point3D[] = [];
  const wrist = { x, y: y + 0.15, z: 0 };
  const middleMcp = { x, y: y - 0.05, z: 0 };
  const palmCenter = { x, y: (wrist.y + middleMcp.y) * 0.5, z: 0 };

  for (let i = 0; i <= 20; i++) {
    lms.push({ x, y, z: 0 });
  }
  lms[0] = wrist;
  lms[9] = middleMcp;

  const tipRadius = clench === 'closed' ? 0.08 : 0.28;
  const tipIndices = [4, 8, 12, 16, 20];
  for (const idx of tipIndices) {
    lms[idx] = { x: palmCenter.x, y: palmCenter.y - tipRadius, z: 0 };
  }

  return lms;
}

function runTests() {
  console.log('=== RUNNING THEREMIN & LOOPER VERIFICATION TESTS ===');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      process.exit(1);
    } else {
      console.log(`✅ PASSED: ${msg}`);
      passed++;
    }
  }

  // 1. Test GestureDetector Clench Ratio
  const gd = new GestureDetector();
  const openHand = createMockHand('open');
  const openClench = gd.computeClenchRatio(openHand);
  assert(openClench < 0.35, `Open hand clench ratio should be low (got ${openClench.toFixed(2)})`);

  const closedHand = createMockHand('closed');
  const closedClench = gd.computeClenchRatio(closedHand);
  assert(closedClench > 0.65, `Closed fist clench ratio should be high (got ${closedClench.toFixed(2)})`);

  // 2. Test Hysteresis & Process
  const p1 = gd.process('R', openHand, 100);
  assert(!p1.gestureState.isClosed, 'Open hand should not be marked as closed');

  gd.process('R', closedHand, 150);
  const p2 = gd.process('R', closedHand, 200);
  assert(p2.gestureState.isClosed, 'Closed fist should trigger isClosed = true');

  // 3. Test Right Wall Bump on Right Hand (armed in play zone -> hits right wall)
  const gdSwipe = new GestureDetector();
  let rightSwipe = null;
  const tTimes = [1000, 1050, 1100];
  const tXs = [0.65, 0.78, 0.90];
  for (let i = 0; i < tTimes.length; i++) {
    const res = gdSwipe.process('R', createMockHand('open', tXs[i], 0.5), tTimes[i]);
    if (res.swipe) {
      rightSwipe = res.swipe;
      break;
    }
  }

  assert(rightSwipe !== null, 'Right hand hitting right wall after entering play zone should trigger commit');
  assert(rightSwipe?.direction === 'right', 'Swipe direction must be right');
  assert(rightSwipe?.hand === 'R', 'Swipe hand must be R');

  // Cooldown test: wall hit attempted 50ms later should be blocked
  const cooldownRes = gdSwipe.process('R', createMockHand('open', 0.91, 0.5), 1150);
  assert(cooldownRes.swipe === null, 'Wall bump cooldown should prevent immediate re-trigger');

  // 4. Test Left Wall Bump on Left Hand (armed in play zone -> hits left wall)
  const gdSwipeL = new GestureDetector();
  let leftSwipe = null;
  const lTimes = [2000, 2050, 2100];
  const lXs = [0.35, 0.22, 0.10];
  for (let i = 0; i < lTimes.length; i++) {
    const res = gdSwipeL.process('L', createMockHand('open', lXs[i], 0.5), lTimes[i]);
    if (res.swipe) {
      leftSwipe = res.swipe;
      break;
    }
  }

  assert(leftSwipe !== null, 'Left hand hitting left wall after entering play zone should trigger commit');
  assert(leftSwipe?.direction === 'left', 'Left hand swipe direction must be left');
  assert(leftSwipe?.hand === 'L', 'Left hand swipe hand must be L');

  // 4B. Test Mid-Screen Horizontal Movement Must NOT Falsely Commit Loop
  const gdMidMove = new GestureDetector();
  gdMidMove.process('L', createMockHand('open', 0.50, 0.5), 2500);
  gdMidMove.process('L', createMockHand('open', 0.42, 0.5), 2530);
  const midMoveRes = gdMidMove.process('L', createMockHand('open', 0.30, 0.5), 2580);
  assert(midMoveRes.swipe === null, 'Moving hand left in mid-screen without touching wall must NOT commit loop');

  // 4C. Test Left Hand Swiping RIGHT must NOT trigger drum swipe (drums only swipe left)
  const gdLeftRight = new GestureDetector();
  gdLeftRight.process('L', createMockHand('open', 0.25, 0.5), 2600);
  gdLeftRight.process('L', createMockHand('open', 0.50, 0.5), 2630);
  const lrRes = gdLeftRight.process('L', createMockHand('open', 0.90, 0.5), 2680);
  assert(lrRes.swipe === null, 'Left hand moving right must NOT trigger drum loop swipe');

  // 4D. Test Right Hand Swiping LEFT must NOT trigger synth swipe (synth only swipes right)
  const gdRightLeft = new GestureDetector();
  gdRightLeft.process('R', createMockHand('open', 0.65, 0.5), 2700);
  gdRightLeft.process('R', createMockHand('open', 0.40, 0.5), 2730);
  const rlRes = gdRightLeft.process('R', createMockHand('open', 0.10, 0.5), 2780);
  assert(rlRes.swipe === null, 'Right hand moving left must NOT trigger synth loop swipe');

  // 4E. Test Arm/Wrist Edge Touching Wall While Hand/Fingers Are Inside Frame Must NOT Trigger Commit
  const gdArmEdge = new GestureDetector();
  // First arm the left hand inside the play zone
  gdArmEdge.process('L', createMockHand('open', 0.30, 0.5), 3300);
  // Now create a posture where wrist/forearm (0,1,2) is against the left border (x=0.03)
  // while knuckles and fingertips are inside at x=0.18
  const armAtLeftBorder = createMockHand('open', 0.18, 0.5);
  armAtLeftBorder[0].x = 0.03; // wrist at left camera edge
  armAtLeftBorder[1].x = 0.05;
  armAtLeftBorder[2].x = 0.07;
  const armLeftRes = gdArmEdge.process('L', armAtLeftBorder, 3360);
  assert(armLeftRes.swipe === null, 'Forearm/wrist touching left camera edge while fingers are inside must NOT trigger loop commit');

  // Same for right arm entering from right camera edge (wrist at x=0.97, fingers at x=0.82)
  gdArmEdge.process('R', createMockHand('open', 0.70, 0.5), 3400);
  const armAtRightBorder = createMockHand('open', 0.82, 0.5);
  armAtRightBorder[0].x = 0.97; // wrist at right camera edge
  armAtRightBorder[1].x = 0.95;
  armAtRightBorder[2].x = 0.93;
  const armRightRes = gdArmEdge.process('R', armAtRightBorder, 3460);
  assert(armRightRes.swipe === null, 'Forearm/wrist touching right camera edge while fingers are inside must NOT trigger loop commit');

  // 5. Test Unarmed Hand Entering Frame from Camera Border Must NOT Trigger Until Entering Play Zone First
  const gdUnarmed = new GestureDetector();
  const spawnAtEdgeRes = gdUnarmed.process('L', createMockHand('open', 0.08, 0.5), 3500);
  assert(spawnAtEdgeRes.swipe === null, 'Hand appearing at screen edge before entering play zone must NOT trigger commit');
  // Enter play zone (x >= 0.22) to arm, then hit left wall (x <= 0.13)
  gdUnarmed.process('L', createMockHand('open', 0.28, 0.5), 3560);
  const armedHitRes = gdUnarmed.process('L', createMockHand('open', 0.09, 0.5), 3620);
  assert(armedHitRes.swipe !== null, 'Hand hitting left wall after arming in play zone must trigger commit');

  // 6. Test ThereminEngine Pitch Computation
  const te = new ThereminEngine();
  te.setScale('pentatonic');

  const lowNote = te.computePitch(0.85);
  const highNote = te.computePitch(0.15);

  assert(
    highNote.frequency > lowNote.frequency * 3,
    `Moving upward should significantly raise pitch (low: ${lowNote.frequency.toFixed(
      1
    )}Hz ${lowNote.noteName}, high: ${highNote.frequency.toFixed(1)}Hz ${highNote.noteName})`
  );

  // 7. Test Musical Measure Quantization in 2-Beat Steps (2, 4, 6, 8, 10, 12, 16 beats)
  const al = new AirLooper();
  assert(al.calculateQuantizedBeats(1.8) === 2, '1.8 beats phrase should quantize to 2 beats');
  assert(al.calculateQuantizedBeats(2.0) === 2, '2 beats phrase should quantize to 2 beats');
  assert(al.calculateQuantizedBeats(3.8) === 4, '3.8 beats phrase should quantize to 4 beats (1 bar)');
  assert(al.calculateQuantizedBeats(4.2) === 4, '4.2 beats phrase should quantize to 4 beats (1 bar)');
  assert(al.calculateQuantizedBeats(5.8) === 6, '5.8 beats phrase should quantize to 6 beats');
  assert(al.calculateQuantizedBeats(7.8) === 8, '7.8 beats phrase should quantize to 8 beats (2 bars)');
  assert(al.calculateQuantizedBeats(9.8) === 10, '9.8 beats phrase should quantize to 10 beats');
  assert(al.calculateQuantizedBeats(11.8) === 12, '11.8 beats phrase should quantize to 12 beats (3 bars)');

  // 7B. Test Live Phrase Metrics per hand
  const metrics = al.getLivePhraseMetrics();
  assert(metrics.drum !== undefined, 'Live metrics must include drum state');
  assert(metrics.synth !== undefined, 'Live metrics must include synth state');
  assert(metrics.master !== undefined, 'Live metrics must include master loop state');
  assert(metrics.drum.bar >= 1, 'Drum bar index must start at >= 1');
  assert(metrics.synth.bar >= 1, 'Synth bar index must start at >= 1');
  assert(metrics.drum.targetBeats >= 2, 'Drum target beats must be >= 2');
  assert(metrics.synth.targetBeats >= 2, 'Synth target beats must be >= 2');

  // 7C. Test Left Wall Bump ("Sol Duvara Çarptırma")
  const gdWallL = new GestureDetector();
  gdWallL.process('L', createMockHand('open', 0.35, 0.5), 3500); // playing in zone
  const wallLRes = gdWallL.process('L', createMockHand('open', 0.10, 0.5), 3600); // bump left wall
  assert(wallLRes.swipe !== null, 'Hitting left wall (x=0.10) must trigger left loop commit');
  assert(wallLRes.swipe?.hand === 'L', 'Left wall bump hand must be L');
  assert(wallLRes.swipe?.direction === 'left', 'Left wall bump direction must be left');

  // 7C2. Test that Left hand reaching into Metronome Top-Left Zone (y=0.15) does NOT trigger drum wall bump
  const gdWallLMetro = new GestureDetector();
  gdWallLMetro.process('L', createMockHand('open', 0.35, 0.5), 3500);
  const wallLMetroRes = gdWallLMetro.process('L', createMockHand('open', 0.10, 0.15), 3600); // top-left corner (metronome)
  assert(wallLMetroRes.swipe === null, 'Hand in top-left metronome corner (y < 0.25) must NOT trigger drum wall bump');

  // 7D. Test Right Wall Bump ("Sağ Duvara Çarptırma")
  const gdWallR = new GestureDetector();
  gdWallR.process('R', createMockHand('open', 0.65, 0.5), 3700); // playing in zone
  const wallRRes = gdWallR.process('R', createMockHand('open', 0.90, 0.5), 3800); // bump right wall
  assert(wallRRes.swipe !== null, 'Hitting right wall (x=0.90) must trigger right loop commit');
  assert(wallRRes.swipe?.hand === 'R', 'Right wall bump hand must be R');
  assert(wallRRes.swipe?.direction === 'right', 'Right wall bump direction must be right');

  // 8. Test Downward Swipe on Right Hand (Open hand)
  const gdDown = new GestureDetector();
  let downSwipe = null;
  const dTimes = [4000, 4050, 4100, 4150];
  const dYs = [0.20, 0.35, 0.52, 0.68];
  for (let i = 0; i < dTimes.length; i++) {
    const res = gdDown.process('R', createMockHand('open', 0.65, dYs[i]), dTimes[i]);
    if (res.swipe) {
      downSwipe = res.swipe;
      break;
    }
  }
  assert(downSwipe !== null, 'Right hand fast downward motion with open hand should trigger downward swipe');
  assert(downSwipe?.direction === 'down', 'Down swipe direction must be down');
  assert(downSwipe?.hand === 'R', 'Down swipe hand must be R');

  // 8B. Test that Clenched Fist moving down NEVER triggers downward swipe (prevents switching preset while making fist or playing low notes)
  const gdFistDown = new GestureDetector();
  let fistDownSwipe = null;
  for (let i = 0; i < dTimes.length; i++) {
    const res = gdFistDown.process('R', createMockHand('closed', 0.65, dYs[i]), dTimes[i]);
    if (res.swipe) {
      fistDownSwipe = res.swipe;
      break;
    }
  }
  assert(fistDownSwipe === null, 'Clenched fist moving down must NEVER trigger downward preset swipe');

  // 9. Test Theremin Preset Cycling
  const p1Preset = te.getPreset();
  const nextInfo = te.cycleNextPreset();
  assert(nextInfo.preset !== p1Preset, `cycleNextPreset should switch preset (from ${p1Preset} to ${nextInfo.preset})`);
  assert(te.getPreset() === nextInfo.preset, 'ThereminEngine current preset should match returned preset');

  // 10. Test Theremin Preset Names map all 5 presets
  const allPresets = ['cosmic', 'cyber', 'dreampad', 'chiptune', 'cello'] as const;
  for (let i = 0; i < 5; i++) {
    const c = te.cycleNextPreset();
    assert(allPresets.includes(c.preset), `Preset ${c.preset} should be a valid preset`);
  }

  // 11. Test Chirality Anchor in Theremin Mode
  const fm = new FingerMapper();
  // Hand at left side of screen (in unmirrored mpResult: x = 0.75 -> mirrored x = 0.25)
  const mockLeftMpResult = {
    landmarks: [createMockHand('open', 0.75, 0.5)],
    handednesses: [[{ categoryName: 'Left', score: 0.9 }]],
  } as any;
  const mappedL = fm.map(mockLeftMpResult, 5000, 'theremin');
  assert(mappedL.rawHands.length === 1, 'Should detect 1 hand');
  assert(mappedL.rawHands[0].hand === 'L', 'Left-side hand must strictly map to L in Theremin mode');

  // Hand at right side of screen (in unmirrored mpResult: x = 0.25 -> mirrored x = 0.75)
  const mockRightMpResult = {
    landmarks: [createMockHand('open', 0.25, 0.5)],
    handednesses: [[{ categoryName: 'Right', score: 0.9 }]],
  } as any;
  const mappedR = fm.map(mockRightMpResult, 5300, 'theremin');
  assert(mappedR.rawHands.length === 1, 'Should detect 1 hand');
  assert(mappedR.rawHands[0].hand === 'R', 'Right-side hand must strictly map to R in Theremin mode');

  // 12. Test Drum Loop Tiling across larger master grid
  const alTile = new AirLooper();
  const mockCtx = {
    currentTime: 10.0,
    sampleRate: 44100,
    createOscillator: () => ({
      type: '',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
    }),
    createGain: () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    }),
    createBuffer: () => ({
      duration: 2.0,
      getChannelData: () => new Float32Array(100),
    }),
    createBufferSource: () => ({ connect() {}, start() {}, buffer: null, loop: false }),
    createScriptProcessor: () => ({ connect() {}, onaudioprocess: null }),
    destination: {},
  } as any;
  const mockAudio = { trigger: () => {} } as any;
  const mockDest = {} as any;
  alTile.init(mockCtx, mockAudio, mockDest);

  // 12A. Record 2 beats of drums
  mockCtx.currentTime = 10.0;
  alTile.recordDrumHit(0, 0.85); // hit on beat 1
  mockCtx.currentTime = 10.5;
  alTile.recordDrumHit(1, 0.85); // hit on beat 2
  mockCtx.currentTime = 11.0;
  const drumRes = alTile.commitDrumLoop();
  assert(drumRes.beatsCount === 2, 'Initial drum loop should quantize to 2 beats');
  assert(drumRes.totalCount === 2, 'Initial drum hits should be 2');

  // 12B. Verify lookahead scheduler schedules hits with accurate Web Audio timestamp
  let scheduledHitTimes: number[] = [];
  const scheduledAudio = {
    trigger: (_fid: any, _vel: any, when?: number) => {
      if (when !== undefined) scheduledHitTimes.push(when);
    },
  } as any;
  (alTile as any).audioEngine = scheduledAudio;
  // Advance to 11.45 so upcoming hit at 11.50 falls in the 120ms lookahead window [11.45, 11.57)
  mockCtx.currentTime = 11.45;
  alTile.update();
  assert(scheduledHitTimes.length >= 1, 'Lookahead scheduler should schedule upcoming drum hits');
  assert(Math.abs(scheduledHitTimes[0] - 11.50) < 0.01, 'Scheduled hit time must be on master loop grid (expected 11.50)');

  // 13. Test Metronome Class
  const metro = new Metronome();
  assert(!metro.isEnabled(), 'Metronome should initially be disabled');
  const turnedOn = metro.toggle();
  assert(turnedOn === true && metro.isEnabled(), 'Metronome.toggle() should turn it ON');
  metro.setBpm(140);
  assert(metro.getBpm() === 140, 'Metronome BPM should update to 140');
  const turnedOff = metro.toggle();
  assert(turnedOff === false && !metro.isEnabled(), 'Metronome.toggle() again should turn it OFF');

  // 13B. Test Metronome Audio and Visual State
  const metroCtx = {
    currentTime: 100.0,
    createOscillator: () => ({
      type: '',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
    }),
    createGain: () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    }),
  } as any;
  const metroDest = {} as any;
  metro.init(metroCtx, metroDest);
  metro.start();
  assert(metro.isEnabled(), 'Metronome should be started');
  const mState = metro.update();
  assert(mState.enabled === true, 'MetronomeState.enabled should be true');
  assert(mState.bpm === 140, 'MetronomeState.bpm should be 140');
  assert(mState.currentBeat >= 1 && mState.currentBeat <= 4, 'MetronomeState.currentBeat should be in [1..4]');
  metro.stop();
  assert(!metro.isEnabled(), 'Metronome should be stopped');

  // 14. Comprehensive Finger Tap Diagnostic (Gentle / Partial Taps, Sympathy Suppression, Rolls & Re-Taps)
  const defaultSettings: AppSettings = {
    activeFingerCount: 10,
    sensitivity: 1.0,
    velocityThreshold: 1.35,
    sympathySuppression: true,
    masterVolume: 0.85,
    midiMapMode: 'drum',
    quantize: 'off',
    bpm: 120,
    multiTrackMidi: true,
    includeOverlayInVideo: true,
    recordResolution: '720p',
    liveMidiEnabled: false,
    selectedMidiOutputId: '',
    appMode: 'theremin',
    thereminPreset: 'cosmic',
    thereminScale: 'pentatonic',
    thereminReverb: 0.65,
  };

  const mockSlots: SlotData[] = FINGER_METAS.map((meta, idx) => ({
    fingerId: meta.id,
    enabled: true,
    sourceType: 'synth',
    sampleName: `Synth ${idx}`,
    synthSeed: 1000 + idx,
    synthType: meta.defaultSynthType,
    midiNote: meta.defaultDrumNote,
  }));

  // Build an anatomical left hand in upright camera-facing pose (matching user's camera posture)
  // bends: array of 5 bend amounts [L_thumb(0), L_index(1), L_middle(2), L_ring(3), L_pinky(4)] in [0..1]
  // where 0.0 is extended rest, and ~0.28 is a gentle partial tap (without folding all the way down!)
  function createAnatomicalLeftHand(bends: [number, number, number, number, number]): any {
    // Note: FingerMapper mirrors x -> 1 - x, so raw landmark x = 0.72 maps to screen x = 0.28 (Left side)
    const cx = 0.72;
    const cy = 0.55;
    const scale = 0.18;
    const lms: Point3D[] = new Array(21).fill(null).map(() => ({ x: cx, y: cy, z: 0 }));

    // Wrist (0) at bottom of palm
    lms[0] = { x: cx, y: cy + scale * 0.85, z: 0 };

    // Thumb (fingerId 0): CMC=1, MCP=2, IP=3, TIP=4
    const bThumb = bends[0];
    lms[1] = { x: cx - scale * 0.52, y: cy + scale * 0.48, z: 0 };
    lms[2] = { x: cx - scale * 0.72, y: cy + scale * (0.20 + 0.10 * bThumb), z: 0 };
    lms[3] = { x: cx - scale * (0.88 - 0.22 * bThumb), y: cy - scale * (0.04 - 0.22 * bThumb), z: 0 };
    lms[4] = {
      x: cx - scale * (1.02 - 0.45 * bThumb),
      y: cy - scale * (0.22 - 0.38 * bThumb),
      z: 0,
    };

    // Index (fingerId 1): MCP=5, PIP=6, DIP=7, TIP=8
    const bIdx = bends[1];
    lms[5] = { x: cx - scale * 0.40, y: cy - scale * 0.02, z: 0 };
    lms[6] = { x: cx - scale * 0.42, y: cy - scale * (0.50 - 0.18 * bIdx), z: -0.02 * bIdx };
    lms[7] = { x: cx - scale * 0.43, y: cy - scale * (0.80 - 0.45 * bIdx), z: -0.04 * bIdx };
    lms[8] = { x: cx - scale * 0.44, y: cy - scale * (1.04 - 0.76 * bIdx), z: -0.06 * bIdx };

    // Middle (fingerId 2): MCP=9, PIP=10, DIP=11, TIP=12
    const bMid = bends[2];
    lms[9] = { x: cx - scale * 0.12, y: cy - scale * 0.08, z: 0 };
    lms[10] = { x: cx - scale * 0.12, y: cy - scale * (0.60 - 0.20 * bMid), z: -0.02 * bMid };
    lms[11] = { x: cx - scale * 0.12, y: cy - scale * (0.92 - 0.50 * bMid), z: -0.04 * bMid };
    lms[12] = { x: cx - scale * 0.12, y: cy - scale * (1.18 - 0.82 * bMid), z: -0.06 * bMid };

    // Ring (fingerId 3): MCP=13, PIP=14, DIP=15, TIP=16
    const bRing = bends[3];
    lms[13] = { x: cx + scale * 0.16, y: cy - scale * 0.06, z: 0 };
    lms[14] = { x: cx + scale * 0.17, y: cy - scale * (0.55 - 0.20 * bRing), z: -0.02 * bRing };
    lms[15] = { x: cx + scale * 0.17, y: cy - scale * (0.86 - 0.48 * bRing), z: -0.04 * bRing };
    lms[16] = { x: cx + scale * 0.17, y: cy - scale * (1.10 - 0.80 * bRing), z: -0.06 * bRing };

    // Pinky (fingerId 4): MCP=17, PIP=18, DIP=19, TIP=20
    const bPinky = bends[4];
    lms[17] = { x: cx + scale * 0.45, y: cy, z: 0 };
    lms[18] = { x: cx + scale * 0.48, y: cy - scale * (0.42 - 0.18 * bPinky), z: -0.02 * bPinky };
    lms[19] = { x: cx + scale * 0.49, y: cy - scale * (0.68 - 0.42 * bPinky), z: -0.04 * bPinky };
    lms[20] = { x: cx + scale * 0.50, y: cy - scale * (0.88 - 0.72 * bPinky), z: -0.06 * bPinky };

    return {
      landmarks: [lms],
      handednesses: [[{ categoryName: 'Right', score: 0.95 }]],
    };
  }

  // 14A. Test that every single finger (0..4: Thumb, Index, Middle, Ring, Pinky) triggers on a GENTLE 28% tap
  // even when realistic anatomical sympathetic drag (50% on neighbors) is present!
  const fingerNames = ['L Thumb (0)', 'L Index (1)', 'L Middle (2)', 'L Ring (3)', 'L Pinky (4)'];
  for (let targetFinger = 0; targetFinger < 5; targetFinger++) {
    const mapper = new FingerMapper();
    const detector = new TapDetector();
    let t = 1000;

    // Warmup at rest (6 frames at 30fps = 33ms step)
    for (let f = 0; f < 6; f++) {
      t += 33;
      const mapped = mapper.map(createAnatomicalLeftHand([0, 0, 0, 0, 0]), t, 'theremin');
      detector.process(mapped, mockSlots, defaultSettings, t);
    }

    // Perform a gentle 28% tap over 2 frames (66ms), with realistic sympathetic drag on adjacent fingers!
    const tapProfile = [0.14, 0.28];
    const triggeredFingers: FingerId[] = [];
    for (const amt of tapProfile) {
      t += 33;
      const bends: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      bends[targetFinger] = amt;
      // Add realistic anatomical tendon pull on neighbors
      if (targetFinger === 3) {
        // Ring (3) pulls Middle (2) at 55% and Pinky (4) at 40%
        bends[2] = amt * 0.55;
        bends[4] = amt * 0.40;
      } else if (targetFinger === 2) {
        // Middle (2) pulls Ring (3) at 55% and Index (1) at 35%
        bends[3] = amt * 0.55;
        bends[1] = amt * 0.35;
      } else if (targetFinger === 4) {
        // Pinky (4) pulls Ring (3) at 40%
        bends[3] = amt * 0.40;
      } else if (targetFinger === 1) {
        // Index (1) pulls Middle (2) at 30%
        bends[2] = amt * 0.30;
      }
      const mapped = mapper.map(createAnatomicalLeftHand(bends), t, 'theremin');
      const { taps } = detector.process(mapped, mockSlots, defaultSettings, t);
      for (const tap of taps) triggeredFingers.push(tap.fingerId);
    }

    assert(
      triggeredFingers.includes(targetFinger as FingerId),
      `${fingerNames[targetFinger]} must trigger on a gentle 28% tap without full finger curl`
    );
    assert(
      triggeredFingers.length === 1 && triggeredFingers[0] === targetFinger,
      `${fingerNames[targetFinger]} gentle tap must NOT false-trigger sympathetic neighbors (got [${triggeredFingers.join(', ')}])`
    );
  }

  // 14B. Test fast sequential adjacent finger roll (Index(1) -> Middle(2) -> Ring(3), 100ms apart)
  {
    const mapper = new FingerMapper();
    const detector = new TapDetector();
    let t = 5000;
    for (let f = 0; f < 6; f++) {
      t += 33;
      detector.process(mapper.map(createAnatomicalLeftHand([0, 0, 0, 0, 0]), t, 'theremin'), mockSlots, defaultSettings, t);
    }

    const rollOrder: FingerId[] = [1, 2, 3]; // Index(1), Middle(2), Ring(3)
    const rollHits: FingerId[] = [];

    for (const fId of rollOrder) {
      // 2 frames down (66ms)
      for (const amt of [0.15, 0.30]) {
        t += 33;
        const bends: [number, number, number, number, number] = [0, 0, 0, 0, 0];
        bends[fId] = amt;
        if (fId === 2) bends[3] = amt * 0.45;
        if (fId === 3) bends[2] = amt * 0.45;
        const { taps } = detector.process(mapper.map(createAnatomicalLeftHand(bends), t, 'theremin'), mockSlots, defaultSettings, t);
        for (const tap of taps) rollHits.push(tap.fingerId);
      }
      // 1 frame release (33ms) before next finger starts!
      t += 33;
      detector.process(mapper.map(createAnatomicalLeftHand([0, 0, 0, 0, 0]), t, 'theremin'), mockSlots, defaultSettings, t);
    }

    assert(
      rollHits.length === 3 && rollHits[0] === 1 && rollHits[1] === 2 && rollHits[2] === 3,
      `Fast sequential roll (Index->Middle->Ring) must register all 3 hits cleanly (got [${rollHits.join(', ')}])`
    );
  }

  // 14C. Test rapid repeated taps on the same finger with only partial mid-air lift (not lifting all the way back to 0)
  {
    const mapper = new FingerMapper();
    const detector = new TapDetector();
    let t = 8000;
    for (let f = 0; f < 6; f++) {
      t += 33;
      detector.process(mapper.map(createAnatomicalLeftHand([0, 0, 0, 0, 0]), t, 'theremin'), mockSlots, defaultSettings, t);
    }

    let indexHits = 0;
    // Tap 1 on Index (1): go to 0.30
    for (const amt of [0.15, 0.30]) {
      t += 33;
      const { taps } = detector.process(mapper.map(createAnatomicalLeftHand([0, amt, 0, 0, 0]), t, 'theremin'), mockSlots, defaultSettings, t);
      indexHits += taps.filter((x) => x.fingerId === 1).length;
    }
    // Partial lift: only lift back up to 0.10 (NOT 0.0!) for 2 frames
    for (const amt of [0.12, 0.10]) {
      t += 33;
      detector.process(mapper.map(createAnatomicalLeftHand([0, amt, 0, 0, 0]), t, 'theremin'), mockSlots, defaultSettings, t);
    }
    // Tap 2 from mid-air (0.10 -> 0.32)
    for (const amt of [0.22, 0.32]) {
      t += 33;
      const { taps } = detector.process(mapper.map(createAnatomicalLeftHand([0, amt, 0, 0, 0]), t, 'theremin'), mockSlots, defaultSettings, t);
      indexHits += taps.filter((x) => x.fingerId === 1).length;
    }

    assert(
      indexHits === 2,
      `Rapid double-tap with partial mid-air release must register both hits (got ${indexHits})`
    );
  }

  // 15. Test Left-Hand Single-Finger Touch Mode ("Tek Parmaklı Dokunma Modu": Sol Avuç Kapatıp Açınca)
  {
    const gdPointer = new GestureDetector();
    assert(gdPointer.isLeftPointerMode() === false, 'Left pointer mode should initially be false');

    // Open left hand -> Close left palm -> Open left palm => toggles ON
    gdPointer.process('L', createMockHand('open', 0.35, 0.50), 10000);
    gdPointer.process('L', createMockHand('closed', 0.35, 0.50), 10040);
    gdPointer.process('L', createMockHand('closed', 0.35, 0.50), 10080);
    const open1 = gdPointer.process('L', createMockHand('open', 0.35, 0.50), 10120);
    const open2 = gdPointer.process('L', createMockHand('open', 0.35, 0.50), 10160);

    assert(gdPointer.isLeftPointerMode() === true, 'Closing and opening left palm must toggle leftPointerMode ON');
    assert(open1.pointerModeToggled || open2.pointerModeToggled, 'pointerModeToggled flag must be true on toggle frame');

    // While in leftPointerMode, hitting the left wall must NOT trigger drum loop commit
    const wallWhilePointer = gdPointer.process('L', createMockHand('open', 0.08, 0.50), 10700);
    assert(wallWhilePointer.swipe === null, 'Left wall bump must be disabled while in single-finger touch mode');

    // Close and open left palm again => toggles OFF
    gdPointer.process('L', createMockHand('closed', 0.35, 0.50), 11000);
    gdPointer.process('L', createMockHand('closed', 0.35, 0.50), 11040);
    const off1 = gdPointer.process('L', createMockHand('open', 0.35, 0.50), 11080);
    const off2 = gdPointer.process('L', createMockHand('open', 0.35, 0.50), 11120);

    assert(gdPointer.isLeftPointerMode() === false, 'Closing and opening left palm again must toggle leftPointerMode OFF');
    assert(off1.pointerModeToggled || off2.pointerModeToggled, 'pointerModeToggled flag must be true when toggling OFF');
  }

  console.log(`\n🎉 ALL ${passed}/${total} TESTS PASSED CLEANLY!`);
}

runTests();
