import { GestureDetector } from './src/gesture/GestureDetector';
import { ThereminEngine } from './src/audio/ThereminEngine';
import { AirLooper } from './src/audio/AirLooper';
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

  // 7. Test Musical Measure Quantization (4, 8, 12, 16 beats)
  const al = new AirLooper();
  assert(al.calculateQuantizedBeats(2.0) === 4, '2 beats phrase should quantize to 4 beats (1 bar)');
  assert(al.calculateQuantizedBeats(3.8) === 4, '3.8 beats phrase should quantize to 4 beats (1 bar)');
  assert(al.calculateQuantizedBeats(4.2) === 4, '4.2 beats phrase should quantize to 4 beats (1 bar)');
  assert(al.calculateQuantizedBeats(4.6) === 8, '4.6 beats (exceeded 4 beats) should quantize to 8 beats (2 bars)');
  assert(al.calculateQuantizedBeats(7.8) === 8, '7.8 beats phrase should quantize to 8 beats (2 bars)');
  assert(al.calculateQuantizedBeats(8.5) === 12, '8.5 beats (exceeded 8 beats) should quantize to 12 beats (3 bars)');
  assert(al.calculateQuantizedBeats(12.5) === 16, '12.5 beats (exceeded 12 beats) should quantize to 16 beats (4 bars)');

  console.log(`\n🎉 ALL ${passed}/${total} TESTS PASSED CLEANLY!`);
}

runTests();
