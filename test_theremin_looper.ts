import { GestureDetector } from './src/gesture/GestureDetector';
import { ThereminEngine } from './src/audio/ThereminEngine';
import { AirLooper } from './src/audio/AirLooper';
import { FingerMapper } from './src/tracking/FingerMapper';
import { Point3D } from './src/types';

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

  // 3. Test Swipe Right on Right Hand
  const gdSwipe = new GestureDetector();
  let rightSwipe = null;
  const tTimes = [1000, 1050, 1100, 1150];
  const tXs = [0.30, 0.40, 0.50, 0.62];
  for (let i = 0; i < tTimes.length; i++) {
    const res = gdSwipe.process('R', createMockHand('open', tXs[i], 0.5), tTimes[i]);
    if (res.swipe) {
      rightSwipe = res.swipe;
      break;
    }
  }

  assert(rightSwipe !== null, 'Right hand fast rightward motion should trigger swipe');
  assert(rightSwipe?.direction === 'right', 'Swipe direction must be right');
  assert(rightSwipe?.hand === 'R', 'Swipe hand must be R');

  // Cooldown test: swipe attempted 100ms later should be blocked
  const cooldownRes = gdSwipe.process('R', createMockHand('open', 0.85, 0.5), 1200);
  assert(cooldownRes.swipe === null, 'Swipe cooldown should prevent immediate re-trigger');

  // 4. Test Swipe Left on Left Hand
  const gdSwipeL = new GestureDetector();
  let leftSwipe = null;
  const lTimes = [2000, 2050, 2100, 2150];
  const lXs = [0.70, 0.60, 0.48, 0.35];
  for (let i = 0; i < lTimes.length; i++) {
    const res = gdSwipeL.process('L', createMockHand('open', lXs[i], 0.5), lTimes[i]);
    if (res.swipe) {
      leftSwipe = res.swipe;
      break;
    }
  }

  assert(leftSwipe !== null, 'Left hand fast leftward motion should trigger swipe');
  assert(leftSwipe?.direction === 'left', 'Left hand swipe direction must be left');
  assert(leftSwipe?.hand === 'L', 'Left hand swipe hand must be L');

  // 4B. Test Left Hand Short Flick to Left Near Screen Edge
  const gdEdge = new GestureDetector();
  gdEdge.process('L', createMockHand('open', 0.20, 0.5), 2500);
  gdEdge.process('L', createMockHand('open', 0.20, 0.5), 2530);
  const edgeRes = gdEdge.process('L', createMockHand('open', 0.13, 0.5), 2580);
  assert(edgeRes.swipe !== null, 'Short flick to left (0.07 distance near edge) must trigger swipe');
  assert(edgeRes.swipe?.direction === 'left', 'Direction must be left');
  assert(edgeRes.swipe?.hand === 'L', 'Hand must be L');

  // 4C. Test Left Hand Swiping RIGHT must NOT trigger drum swipe (drums only swipe left)
  const gdLeftRight = new GestureDetector();
  gdLeftRight.process('L', createMockHand('open', 0.20, 0.5), 2600);
  gdLeftRight.process('L', createMockHand('open', 0.20, 0.5), 2630);
  const lrRes = gdLeftRight.process('L', createMockHand('open', 0.35, 0.5), 2680);
  assert(lrRes.swipe === null, 'Left hand moving right must NOT trigger drum loop swipe');

  // 4D. Test Right Hand Swiping LEFT must NOT trigger synth swipe (synth only swipes right)
  const gdRightLeft = new GestureDetector();
  gdRightLeft.process('R', createMockHand('open', 0.65, 0.5), 2700);
  gdRightLeft.process('R', createMockHand('open', 0.65, 0.5), 2730);
  const rlRes = gdRightLeft.process('R', createMockHand('open', 0.48, 0.5), 2780);
  assert(rlRes.swipe === null, 'Right hand moving left must NOT trigger synth loop swipe');

  // 4E. Test Left Hand Flick at x = 0.20 (matching user photo)
  const gdUserEdge = new GestureDetector();
  gdUserEdge.process('L', createMockHand('open', 0.20, 0.5), 3300);
  gdUserEdge.process('L', createMockHand('open', 0.20, 0.5), 3330);
  const userEdgeRes = gdUserEdge.process('L', createMockHand('open', 0.17, 0.5), 3380);
  assert(userEdgeRes.swipe !== null, 'Short flick at x=0.20 (matching user photo) must trigger left drum swipe');
  assert(userEdgeRes.swipe?.direction === 'left', 'Direction must be left');

  // 5. Test Sudden Flick after Stationary Hand (Peak-stroke / no velocity dilution bug)
  const gdFlick = new GestureDetector();
  gdFlick.process('L', createMockHand('open', 0.50, 0.5), 3000);
  gdFlick.process('L', createMockHand('open', 0.50, 0.5), 3050);
  gdFlick.process('L', createMockHand('open', 0.50, 0.5), 3100);
  gdFlick.process('L', createMockHand('open', 0.50, 0.5), 3150);
  // Sudden flick to left: 0.50 -> 0.38 in 60ms (velocity = 2.0/s, dx = -0.12)
  const flickRes = gdFlick.process('L', createMockHand('open', 0.38, 0.5), 3210);
  assert(flickRes.swipe !== null, 'Sudden flick after stationary hold must trigger swipe without velocity dilution');
  assert(flickRes.swipe?.hand === 'L', 'Flick hand must be L');

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

  console.log(`\n🎉 ALL ${passed}/${total} TESTS PASSED CLEANLY!`);
}

runTests();
