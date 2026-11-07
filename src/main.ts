import {
  AppMode,
  FINGER_METAS,
  MidiMapMode,
  QuantizeMode,
  ThereminPreset,
  ThereminScale,
  ThereminState,
} from './types';
import { store } from './state/store';
import { Camera } from './camera/Camera';
import { HandTracker } from './tracking/HandTracker';
import { FingerMapper } from './tracking/FingerMapper';
import { TapDetector } from './gesture/TapDetector';
import { AudioEngine } from './audio/AudioEngine';
import { ThereminEngine } from './audio/ThereminEngine';
import { AirLooper } from './audio/AirLooper';
import { Metronome } from './audio/Metronome';
import { GestureDetector } from './gesture/GestureDetector';
import { SampleStore } from './audio/SampleStore';
import { Overlay } from './ui/Overlay';
import { FingerPanel } from './ui/FingerPanel';
import { VideoRecorder, RecordedVideoResult } from './record/VideoRecorder';
import { MidiRecorder } from './record/MidiRecorder';
import { WebMidiOut } from './record/WebMidiOut';

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element bulunamadÄ±: #${id}`);
  return el as T;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function formatTimer(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`;
}

async function bootstrap(): Promise<void> {
  // Core instances
  const videoEl = getEl<HTMLVideoElement>('webcam');
  const overlayCanvas = getEl<HTMLCanvasElement>('overlay-canvas');
  const slotsContainer = getEl<HTMLElement>('finger-slots-list');

  const camera = new Camera(videoEl);
  const handTracker = new HandTracker();
  const fingerMapper = new FingerMapper();
  const tapDetector = new TapDetector();
  const audio = new AudioEngine();
  const theremin = new ThereminEngine();
  const airLooper = new AirLooper();
  const metronome = new Metronome();
  const gestureDetector = new GestureDetector();
  const sampleStore = new SampleStore();
  const overlay = new Overlay(overlayCanvas);
  const videoRecorder = new VideoRecorder();
  const midiRecorder = new MidiRecorder();
  const webMidi = new WebMidiOut();

  // Mode Switch UI
  const btnModeFingers = getEl<HTMLButtonElement>('btn-mode-fingers');
  const btnModeTheremin = getEl<HTMLButtonElement>('btn-mode-theremin');
  const panelFingersMode = getEl<HTMLElement>('panel-fingers-mode');
  const panelThereminMode = getEl<HTMLElement>('panel-theremin-mode');

  // Theremin & Looper Sidebar Elements
  const selThereminPreset = getEl<HTMLSelectElement>('sel-theremin-preset');
  const selThereminScale = getEl<HTMLSelectElement>('sel-theremin-scale');
  const rngThereminReverb = getEl<HTMLInputElement>('rng-theremin-reverb');
  const valThereminReverb = getEl<HTMLElement>('val-theremin-reverb');
  const lblSynthLayers = getEl<HTMLElement>('lbl-synth-layers');
  const btnClearSynthLoop = getEl<HTMLButtonElement>('btn-clear-synth-loop');
  const lblDrumHits = getEl<HTMLElement>('lbl-drum-hits');
  const btnClearDrumLoop = getEl<HTMLButtonElement>('btn-clear-drum-loop');
  const inpThereminBpm = getEl<HTMLInputElement>('inp-theremin-bpm');
  const btnClearAllLoops = getEl<HTMLButtonElement>('btn-clear-all-loops');

  // UI elements
  const startOverlay = getEl<HTMLElement>('start-overlay');
  const btnStartHero = getEl<HTMLButtonElement>('btn-start-hero');
  const btnToggleCam = getEl<HTMLButtonElement>('btn-toggle-cam');
  const btnCalibrate = getEl<HTMLButtonElement>('btn-calibrate');
  const btnRecord = getEl<HTMLButtonElement>('btn-record');
  const recLabel = getEl<HTMLElement>('rec-label');
  const recTimer = getEl<HTMLElement>('rec-timer');

  const countdownBanner = getEl<HTMLElement>('countdown-banner');
  const countdownTitle = getEl<HTMLElement>('countdown-title');
  const countdownNumber = getEl<HTMLElement>('countdown-number');
  const countdownDesc = getEl<HTMLElement>('countdown-desc');

  const videoStage = getEl<HTMLElement>('video-stage');
  const hudFps = getEl<HTMLElement>('hud-fps');
  const hudHands = getEl<HTMLElement>('hud-hands');
  const hudStatus = document.getElementById('hud-status');

  const selActiveFingers = getEl<HTMLSelectElement>('sel-active-fingers');
  const selMidiMode = getEl<HTMLSelectElement>('sel-midi-mode');
  const selQuantize = getEl<HTMLSelectElement>('sel-quantize');
  const btnRandomizeAll = getEl<HTMLButtonElement>('btn-randomize-all');

  const rngSensitivity = getEl<HTMLInputElement>('rng-sensitivity');
  const valSensitivity = getEl<HTMLElement>('val-sensitivity');
  const rngVelocity = getEl<HTMLInputElement>('rng-velocity');
  const valVelocity = getEl<HTMLElement>('val-velocity');
  const rngVolume = getEl<HTMLInputElement>('rng-volume');
  const valVolume = getEl<HTMLElement>('val-volume');

  const chkSympathy = getEl<HTMLInputElement>('chk-sympathy');
  const chkVideoOverlay = getEl<HTMLInputElement>('chk-video-overlay');
  const selResolution = getEl<HTMLSelectElement>('sel-resolution');
  const chkLiveMidi = getEl<HTMLInputElement>('chk-live-midi');
  const selMidiOut = getEl<HTMLSelectElement>('sel-midi-out');

  const btnExportPreset = getEl<HTMLButtonElement>('btn-export-preset');
  const btnImportPreset = getEl<HTMLButtonElement>('btn-import-preset');
  const inputImportPreset = getEl<HTMLInputElement>('input-import-preset');

  // Preview Modal elements
  const recordModal = getEl<HTMLElement>('record-modal');
  const btnCloseModal = getEl<HTMLButtonElement>('btn-close-modal');
  const previewVideo = getEl<HTMLVideoElement>('preview-video');
  const modalInfoDuration = getEl<HTMLElement>('modal-info-duration');
  const modalInfoNotes = getEl<HTMLElement>('modal-info-notes');
  const inpMidiBpm = getEl<HTMLInputElement>('inp-midi-bpm');
  const selModalQuantize = getEl<HTMLSelectElement>('sel-modal-quantize');
  const chkMultitrack = getEl<HTMLInputElement>('chk-multitrack');
  const btnDlVideo = getEl<HTMLButtonElement>('btn-dl-video');
  const btnDlMidi = getEl<HTMLButtonElement>('btn-dl-midi');
  const btnDlBoth = getEl<HTMLButtonElement>('btn-dl-both');

  // Populate active finger count options (1..10)
  for (let n = 1; n <= 10; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = `${n} CH`;
    selActiveFingers.appendChild(opt);
  }

  // Hydrate initial UI values from store settings
  const initSettings = store.getSettings();
  selActiveFingers.value = String(initSettings.activeFingerCount);
  selMidiMode.value = initSettings.midiMapMode;
  selQuantize.value = initSettings.quantize;
  selModalQuantize.value = initSettings.quantize;
  inpMidiBpm.value = String(initSettings.bpm);
  chkMultitrack.checked = initSettings.multiTrackMidi;
  rngSensitivity.value = String(initSettings.sensitivity);
  valSensitivity.textContent = `${initSettings.sensitivity.toFixed(2)}x`;
  rngVelocity.value = String(initSettings.velocityThreshold);
  valVelocity.textContent = initSettings.velocityThreshold.toFixed(2);
  rngVolume.value = String(initSettings.masterVolume);
  valVolume.textContent = `${Math.round(initSettings.masterVolume * 100)}%`;
  chkSympathy.checked = initSettings.sympathySuppression;
  chkVideoOverlay.checked = initSettings.includeOverlayInVideo;
  selResolution.value = initSettings.recordResolution;
  audio.setMasterVolume(initSettings.masterVolume);

  function ensureAllEngines(): void {
    audio.ensureContext();
    const ctx = audio.getContext();
    const master = audio.getMasterGain();
    theremin.init(ctx, master);
    airLooper.init(ctx, audio, master);
    metronome.init(ctx, master);
    metronome.setBpm(airLooper.getBpm());
    const thOut = theremin.getOutputNode();
    const loopIn = airLooper.getRecordInputNode();
    if (thOut && loopIn) {
      try {
        thOut.connect(loopIn);
      } catch {
        // already connected
      }
    }
  }

  function refreshLooperUi(): void {
    const status = airLooper.getStatus();
    lblSynthLayers.textContent = `${status.synthLayersCount} LAYERS`;
    lblDrumHits.textContent = `${status.drumEventsCount} HITS`;
    store.emit('looperUpdate', status);
  }

  function setMode(mode: AppMode): void {
    store.updateSettings({ appMode: mode });
    btnModeFingers.classList.toggle('active', mode === 'fingers');
    btnModeTheremin.classList.toggle('active', mode === 'theremin');
    panelFingersMode.classList.toggle('hidden', mode !== 'fingers');
    panelThereminMode.classList.toggle('hidden', mode !== 'theremin');
    overlay.setAppMode(mode);
    if (mode === 'fingers') {
      theremin.silence();
      overlay.setThereminState(null);
    }
    store.emit(
      'statusMessage',
      mode === 'theremin'
        ? 'Theremin & Looper Mode Active'
        : '10-Finger Mode Active'
    );
  }

  // Hydrate initial Theremin & Looper values
  setMode(initSettings.appMode);
  selThereminPreset.value = initSettings.thereminPreset;
  selThereminScale.value = initSettings.thereminScale;
  rngThereminReverb.value = String(initSettings.thereminReverb);
  valThereminReverb.textContent = `${Math.round(initSettings.thereminReverb * 100)}%`;
  inpThereminBpm.value = String(initSettings.bpm);
  theremin.setPreset(initSettings.thereminPreset);
  theremin.setScale(initSettings.thereminScale);
  theremin.setReverbAmount(initSettings.thereminReverb);
  airLooper.setBpm(initSettings.bpm);
  metronome.setBpm(initSettings.bpm);
  refreshLooperUi();

  btnModeFingers.addEventListener('click', () => {
    ensureAllEngines();
    setMode('fingers');
  });

  btnModeTheremin.addEventListener('click', () => {
    ensureAllEngines();
    setMode('theremin');
  });

  selThereminPreset.addEventListener('change', () => {
    ensureAllEngines();
    const val = selThereminPreset.value as ThereminPreset;
    theremin.setPreset(val);
    store.updateSettings({ thereminPreset: val });
  });

  selThereminScale.addEventListener('change', () => {
    ensureAllEngines();
    const val = selThereminScale.value as ThereminScale;
    theremin.setScale(val);
    store.updateSettings({ thereminScale: val });
  });

  rngThereminReverb.addEventListener('input', () => {
    ensureAllEngines();
    const val = Number(rngThereminReverb.value);
    valThereminReverb.textContent = `${Math.round(val * 100)}%`;
    theremin.setReverbAmount(val);
    store.updateSettings({ thereminReverb: val });
  });

  inpThereminBpm.addEventListener('change', () => {
    ensureAllEngines();
    const bpm = Math.max(50, Math.min(220, Number(inpThereminBpm.value) || 120));
    airLooper.setBpm(bpm);
    metronome.setBpm(bpm);
    store.updateSettings({ bpm });
    inpMidiBpm.value = String(bpm);
  });

  btnClearSynthLoop.addEventListener('click', () => {
    airLooper.clearSynthLoop();
    refreshLooperUi();
    store.emit('statusMessage', 'Synth döngüsü temizlendi');
  });

  btnClearDrumLoop.addEventListener('click', () => {
    airLooper.clearDrumLoop();
    refreshLooperUi();
    store.emit('statusMessage', 'Davul döngüsü temizlendi');
  });

  btnClearAllLoops.addEventListener('click', () => {
    airLooper.clearAll();
    refreshLooperUi();
    store.emit('statusMessage', 'Tüm döngüler temizlendi');
  });

  // Metronome box click/touch handler on camera stage (only active in single-finger touch mode)
  videoStage.addEventListener('pointerdown', (e) => {
    if (!gestureDetector.isLeftPointerMode()) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const vp = overlay.computeContainViewport(
      rect.width,
      rect.height,
      videoEl.videoWidth || 640,
      videoEl.videoHeight || 480
    );
    const mb = overlay.getMetronomeBounds(vp);
    if (
      clickX >= mb.x &&
      clickX <= mb.x + mb.w &&
      clickY >= mb.y &&
      clickY <= mb.y + mb.h
    ) {
      audio.ensureContext();
      ensureAllEngines();
      const newState = metronome.toggle();
      overlay.triggerMetroFlash();
      overlay.showToast(newState ? '[METRONOM: AÇIK]' : '[METRONOM: KAPALI]', '#4ade80');
    }
  });

  // Create right sidebar panel
  const fingerPanel = new FingerPanel(slotsContainer, store, audio, sampleStore);

  store.on('statusMessage', (msg) => {
    if (hudStatus) hudStatus.textContent = msg;
  });

  store.on('settingsChanged', (s) => {
    selMidiMode.value = s.midiMapMode;
    selQuantize.value = s.quantize;
    selModalQuantize.value = s.quantize;
  });

  // Restore persisted slots & audio buffers (or generate synth defaults)
  async function hydrateAudioSlots(): Promise<void> {
    const savedMeta = await sampleStore.loadSlotsMeta();
    if (savedMeta) {
      const count = store.getSettings().activeFingerCount;
      savedMeta.forEach((s, idx) => {
        s.enabled = idx < count;
      });
      store.replaceSlots(savedMeta);
    }

    const currentSlots = store.getSlots();
    for (const slot of currentSlots) {
      if (slot.sourceType === 'custom') {
        const storedSample = await sampleStore.loadCustomSample(slot.fingerId);
        if (storedSample) {
          try {
            const decoded = await audio.decodeAudio(storedSample.data);
            audio.setBuffer(slot.fingerId, decoded);
            continue;
          } catch {
            // Fallback to synth if stored buffer corrupted
          }
        }
      }
      const gen = await audio.assignSynthToSlot(
        slot.fingerId,
        slot.synthSeed,
        slot.synthType
      );
      slot.sourceType = 'synth';
      slot.sampleName = gen.label;
    }
    store.replaceSlots([...currentSlots]);
  }

  let audioHydrated = false;
  let hydratingPromise: Promise<void> | null = null;

  function ensureAudioHydrated(): Promise<void> {
    if (audioHydrated) return Promise.resolve();
    if (!hydratingPromise) {
      hydratingPromise = hydrateAudioSlots().then(() => {
        audioHydrated = true;
      });
    }
    return hydratingPromise;
  }

  // Pre-hydrate synth & saved custom samples immediately on boot
  void ensureAudioHydrated().then(() => {
    store.emit('statusMessage', 'Sesler hazÄ±r â€” BaÅŸlat veya A..; tuÅŸlarÄ±yla dene');
  });

  // Unified NoteOn / NoteOff pipeline
  store.on('noteOn', ({ fingerId, velocity, timestampMs }) => {
    const slot = store.getSlot(fingerId);
    if (!slot || !slot.enabled) return;

    audio.ensureContext();
    if (audioHydrated) {
      audio.trigger(fingerId, velocity);
    } else {
      void ensureAudioHydrated().then(() => {
        audio.trigger(fingerId, velocity);
      });
    }

    if (fingerId < 5) {
      airLooper.recordDrumHit(fingerId, velocity);
    }

    overlay.triggerHit(fingerId, velocity, timestampMs);

    const settings = store.getSettings();
    if (midiRecorder.isRecording()) {
      midiRecorder.recordNoteOn(
        fingerId,
        slot.midiNote,
        velocity,
        audio.getCurrentTime()
      );
    }

    if (settings.liveMidiEnabled) {
      webMidi.sendNoteOn(slot.midiNote, velocity, settings.midiMapMode === 'drum');
    }
  });

  store.on('noteOff', ({ fingerId }) => {
    overlay.releaseHit(fingerId);
    const slot = store.getSlot(fingerId);
    const settings = store.getSettings();

    if (midiRecorder.isRecording()) {
      midiRecorder.recordNoteOff(fingerId, audio.getCurrentTime());
    }
    if (settings.liveMidiEnabled && slot) {
      webMidi.sendNoteOff(slot.midiNote, settings.midiMapMode === 'drum');
    }
  });

  // Keyboard shortcuts (A S D F G H J K L ;) for testing
  const heldKeys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (heldKeys.has(e.code)) return;
    const meta = FINGER_METAS.find((m) => m.keyCode === e.code);
    if (!meta) return;

    heldKeys.add(e.code);
    audio.ensureContext();
    store.emit('noteOn', {
      fingerId: meta.id,
      velocity: 0.85,
      timestampMs: performance.now(),
    });
  });

  window.addEventListener('keyup', (e) => {
    if (!heldKeys.has(e.code)) return;
    heldKeys.delete(e.code);
    const meta = FINGER_METAS.find((m) => m.keyCode === e.code);
    if (!meta) return;
    store.emit('noteOff', {
      fingerId: meta.id,
      timestampMs: performance.now(),
    });
  });

  // Camera + MediaPipe Loop
  let fpsSmooth = 0;
  let lastFrameMs = 0;
  let recTimerHandle: number | null = null;
  let recStartWallMs = 0;
  let lastRecordedVideo: RecordedVideoResult | null = null;

  async function startSession(): Promise<void> {
    try {
      btnStartHero.disabled = true;
      btnToggleCam.disabled = true;
      store.emit('statusMessage', 'Kamera ve MediaPipe GPU modeli yÃ¼kleniyor...');

      audio.ensureContext();
      ensureAllEngines();
      await Promise.all([camera.start(640, 480), handTracker.init()]);

      startOverlay.classList.add('hidden');
      btnToggleCam.disabled = false;
      btnToggleCam.textContent = 'STOP';
      btnCalibrate.disabled = false;
      btnRecord.disabled = false;
      store.emit('statusMessage', 'Live tracking active');

      lastFrameMs = performance.now();
      let leftLockoutUntilMs = 0;
      let prevPalmL: { x: number; y: number } | null = null;
      let metroZoneArmed = true;
      let lastMetroToggleMs = 0;

      camera.startFrameLoop((nowMs, video) => {
        // FPS calculation
        const dt = nowMs - lastFrameMs;
        lastFrameMs = nowMs;
        if (dt > 0 && dt < 500) {
          const instFps = 1000 / dt;
          fpsSmooth = fpsSmooth === 0 ? instFps : fpsSmooth * 0.88 + instFps * 0.12;
          hudFps.textContent = `FPS: ${Math.round(fpsSmooth)}`;
        }

        const settings = store.getSettings();
        const mpResult = handTracker.detect(video, nowMs);
        const mapped = fingerMapper.map(mpResult, nowMs, settings.appMode);
        hudHands.textContent = `ELLER: ${mapped.rawHands.length}`;

        const slots = store.getSlots();

        // 1. AirLooper beat update
        airLooper.update();

        // 1B. Metronome update & live state
        const metroState = metronome.update(
          airLooper.getMasterLoopStartTime(),
          airLooper.getMasterLoopDuration()
        );
        overlay.setMetronomeState(metroState);

        // 2. Gesture & Swipe detection (also updates Left-Hand Single-Finger Touch Mode)
        let rightHandDetected = false;
        let isLeftFastMoving = false;
        let isLeftClosingPalm = false;

        for (const rawHand of mapped.rawHands) {
          const handKey = rawHand.hand;
          const { gestureState, swipe, pointerModeToggled } = gestureDetector.process(
            handKey,
            rawHand.landmarks,
            nowMs
          );

          if (handKey === 'L') {
            if (pointerModeToggled) {
              const isPointer = gestureDetector.isLeftPointerMode();
              overlay.setLeftPointerMode(isPointer);
              leftLockoutUntilMs = nowMs + 350;
              overlay.showToast(
                isPointer ? '[DOKUNMA MODU: AÇIK]' : '[DOKUNMA MODU: KAPALI]',
                '#4ade80'
              );
              const tip = rawHand.landmarks[8];
              metroZoneArmed = !(tip && tip.x <= 0.22 && tip.y <= 0.24);
            }

            if (gestureState.isClosed || gestureState.clenchRatio > 0.38) {
              isLeftClosingPalm = true;
            }

            let palmSpeed = 0;
            if (prevPalmL && dt > 0) {
              palmSpeed =
                Math.hypot(gestureState.palmCenter.x - prevPalmL.x, gestureState.palmCenter.y - prevPalmL.y) /
                (dt / 1000);
            }
            prevPalmL = { x: gestureState.palmCenter.x, y: gestureState.palmCenter.y };

            // Only suppress when touching the wall boundary or during rapid gross hand swipe
            if (gestureState.palmCenter.x <= 0.13 || gestureState.velocityX < -0.80 || palmSpeed > 1.15) {
              isLeftFastMoving = true;
            }
          }

          if (swipe) {
            try {
              store.emit('swipeEvent', swipe);
              if (swipe.hand === 'R') {
                if (swipe.direction === 'down') {
                  // Guard: Downward swipe to cycle preset ONLY when hand is OPEN and NOT playing theremin!
                  const isPlayingTheremin = theremin.isActive() || gestureState.isClosed;
                  if (!isPlayingTheremin) {
                    const nextPreset = theremin.cycleNextPreset();
                    store.updateSettings({ thereminPreset: nextPreset.preset });
                    selThereminPreset.value = nextPreset.preset;
                    theremin.playPresetChangeChime();
                    overlay.showToast(`[SYNTH: ${nextPreset.name.toUpperCase()}]`, '#4ade80');
                    store.emit('statusMessage', `Synth sesi değiştirildi: ${nextPreset.name}`);
                  }
                } else if (swipe.direction === 'right') {
                  // Wall bump / swipe to the right on right hand
                  overlay.triggerWallBump('R', nowMs);
                  theremin.silence();
                  const res = airLooper.commitSynthLoop();
                  if (res.totalLayers > 0) {
                    overlay.showToast(
                      `[SYNTH: ${res.beatsCount} VURUŞ (KATMAN ${res.totalLayers})]`,
                      '#4ade80'
                    );
                    store.emit(
                      'statusMessage',
                      `Synth döngüye alındı (${res.beatsCount} Vuruş • Katman ${res.totalLayers})`
                    );
                  } else {
                    overlay.showToast('[SYNTH: HENÜZ ÇALINMADI]', '#94a3b8');
                    store.emit('statusMessage', 'Henüz synth çalınmadı');
                  }
                  refreshLooperUi();
                }
              } else if (swipe.hand === 'L' && swipe.direction === 'left' && !gestureDetector.isLeftPointerMode()) {
                // Wall bump / swipe to the left on left hand
                overlay.triggerWallBump('L', nowMs);
                leftLockoutUntilMs = nowMs + 280; // Lockout to prevent post-bump tap noise
                const res = airLooper.commitDrumLoop();
                if (res.addedCount > 0) {
                  overlay.showToast(
                    `[DAVUL: ${res.beatsCount} VURUŞ (${res.totalCount} NOTA)]`,
                    '#4ade80'
                  );
                  store.emit(
                    'statusMessage',
                    `Davul döngüye alındı (${res.beatsCount} Vuruş • ${res.totalCount} Nota)`
                  );
                } else {
                  overlay.showToast('[DAVUL: HENÜZ ÇALINMADI]', '#94a3b8');
                  store.emit('statusMessage', 'Henüz davul çalınmadı');
                }
                refreshLooperUi();
              }
            } catch (swipeErr) {
              console.error('Swipe işleme hatası:', swipeErr);
            }
          }

          if (settings.appMode === 'theremin' && rawHand.hand === 'R') {
            rightHandDetected = true;
            const tRes = theremin.updateGesture(
              gestureState.clenchRatio,
              gestureState.palmCenter.x,
              gestureState.palmCenter.y
            );
            if (tRes.active) {
              airLooper.markSynthActive();
            }
            const tState: ThereminState = {
              active: tRes.active,
              pitchHz: tRes.frequency,
              noteName: tRes.noteName,
              volume: tRes.volume,
              brightness: tRes.brightness,
              handX: gestureState.palmCenter.x,
              handY: gestureState.palmCenter.y,
              clenchRatio: gestureState.clenchRatio,
            };
            overlay.setThereminState(tState);
            store.emit('thereminUpdate', tState);
          }
        }

        // 2B. Metronome Single-Finger Touch Check (Sol Üst Köşe — SADECE Sol El Tek Parmak Modunda!)
        let isHandInMetroZone = false;
        let isHandNearMetroZone = false;

        if (gestureDetector.isLeftPointerMode()) {
          for (const rawHand of mapped.rawHands) {
            if (rawHand.hand !== 'L') continue;
            const tip = rawHand.landmarks[8]; // Sadece sol işaret parmağı ucu
            if (tip && tip.x <= 0.22 && tip.y <= 0.24) {
              isHandInMetroZone = true;
              break;
            }
            if (tip && tip.x <= 0.26 && tip.y <= 0.28) {
              isHandNearMetroZone = true;
            }
          }
        }

        metronome.setHovered(isHandInMetroZone);

        if (gestureDetector.isLeftPointerMode()) {
          if (isHandInMetroZone) {
            if (metroZoneArmed && nowMs - lastMetroToggleMs > 600) {
              const newState = metronome.toggle();
              lastMetroToggleMs = nowMs;
              metroZoneArmed = false;
              overlay.triggerMetroFlash(nowMs);
              overlay.showToast(newState ? '[METRONOM: AÇIK]' : '[METRONOM: KAPALI]', '#4ade80');
            }
          } else if (!isHandNearMetroZone && nowMs - lastMetroToggleMs > 350) {
            metroZoneArmed = true;
          }
        } else {
          metroZoneArmed = true;
        }

        if (settings.appMode === 'theremin' && !rightHandDetected) {
          theremin.silence();
          overlay.setThereminState(null);
        }

        overlay.setAppMode(settings.appMode);
        overlay.setLeftPointerMode(gestureDetector.isLeftPointerMode());
        overlay.setStreakPoints(gestureDetector.getStreakPoints(nowMs));
        overlay.setLooperStatus(airLooper.getStatus());
        overlay.setLivePhraseMetrics(airLooper.getLivePhraseMetrics());
        overlay.setCapturingState(
          airLooper.isDrumCapturing(),
          airLooper.getPendingDrumCount(),
          airLooper.isSynthCapturing()
        );

        const { taps, releases } = tapDetector.process(mapped, slots, settings, nowMs);
        const leftSimultaneousTaps = taps.filter((t) => t.fingerId < 5).length;
        const isLeftSuppressed =
          gestureDetector.isLeftPointerMode() ||
          isLeftClosingPalm ||
          leftSimultaneousTaps >= 3 ||
          isLeftFastMoving ||
          nowMs < leftLockoutUntilMs;

        for (const tap of taps) {
          // In theremin mode, right hand taps are ignored so right hand is exclusively Theremin
          if (settings.appMode === 'theremin' && tap.fingerId >= 5) {
            continue;
          }
          // Suppress accidental drum taps when left hand is in pointer mode, closing palm, or rapid motion
          if (tap.fingerId < 5 && isLeftSuppressed) {
            continue;
          }
          store.emit('noteOn', { ...tap, timestampMs: nowMs });
        }
        for (const rel of releases) {
          if (settings.appMode === 'theremin' && rel.fingerId >= 5) {
            continue;
          }
          store.emit('noteOff', rel);
        }

        overlay.render(mapped, slots, video, nowMs);

        if (videoRecorder.isRecording()) {
          videoRecorder.renderFrame(
            video,
            overlay,
            mapped,
            slots,
            settings.includeOverlayInVideo,
            nowMs
          );
        }
      });
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Kamera baÅŸlatÄ±lamadÄ±.';
      store.emit('statusMessage', `Hata: ${msg}`);
      btnStartHero.disabled = false;
      btnToggleCam.disabled = false;
    }
  }

  function stopSession(): void {
    if (videoRecorder.isRecording()) {
      void stopRecordingAndShowModal();
    }
    theremin.silence();
    overlay.setThereminState(null);
    camera.stop();
    btnToggleCam.textContent = 'START';
    btnCalibrate.disabled = true;
    btnRecord.disabled = true;
    startOverlay.classList.remove('hidden');
    btnStartHero.disabled = false;
    hudFps.textContent = 'FPS: --';
    hudHands.textContent = 'ELLER: 0';
    store.emit('statusMessage', 'Stopped');
  }

  btnStartHero.addEventListener('click', () => {
    void startSession();
  });

  btnToggleCam.addEventListener('click', () => {
    if (camera.isRunning()) {
      stopSession();
    } else {
      void startSession();
    }
  });

  // 3-Second Calibration
  btnCalibrate.addEventListener('click', () => {
    if (!camera.isRunning() || tapDetector.isCalibrating()) return;

    btnCalibrate.disabled = true;
    countdownTitle.textContent = 'CALIBRATING';
    countdownDesc.textContent = 'Hold hands steady in neutral position...';
    countdownNumber.textContent = '3';
    countdownBanner.classList.remove('hidden');
    tapDetector.beginCalibration();

    let rem = 3;
    const iv = window.setInterval(() => {
      rem -= 1;
      if (rem > 0) {
        countdownNumber.textContent = String(rem);
      } else {
        window.clearInterval(iv);
        countdownBanner.classList.add('hidden');
        const count = tapDetector.finishCalibration();
        btnCalibrate.disabled = false;
        store.emit(
          'statusMessage',
          count > 0
            ? `Calibration complete (${count} fingers)`
            : 'Calibration failed: No hands detected'
        );
      }
    }, 1000);
  });

  // Recording (Video + MIDI synchronized)
  function startRecording(): void {
    if (!camera.isRunning() || videoRecorder.isRecording()) return;
    audio.ensureContext();
    const settings = store.getSettings();

    const syncAudioTime = audio.getCurrentTime();
    midiRecorder.start(syncAudioTime);
    videoRecorder.start(audio.getAudioStream(), settings.recordResolution);

    btnRecord.classList.add('recording');
    recLabel.textContent = 'STOP';
    recTimer.classList.remove('hidden');
    recStartWallMs = performance.now();
    recTimer.textContent = '00:00.0';

    recTimerHandle = window.setInterval(() => {
      const elapsed = (performance.now() - recStartWallMs) / 1000;
      recTimer.textContent = formatTimer(elapsed);
    }, 100);

    store.emit('statusMessage', 'Recording Video + MIDI...');
  }

  async function stopRecordingAndShowModal(): Promise<void> {
    if (!videoRecorder.isRecording()) return;
    if (recTimerHandle !== null) {
      window.clearInterval(recTimerHandle);
      recTimerHandle = null;
    }

    btnRecord.classList.remove('recording');
    recLabel.textContent = 'REC';
    recTimer.classList.add('hidden');

    const midiEvents = midiRecorder.stop(audio.getCurrentTime());
    const videoRes = await videoRecorder.stop();

    if (lastRecordedVideo) {
      URL.revokeObjectURL(lastRecordedVideo.url);
    }
    lastRecordedVideo = videoRes;

    previewVideo.src = videoRes.url;
    modalInfoDuration.textContent = `Duration: ${videoRes.durationSec.toFixed(1)}s`;
    modalInfoNotes.textContent = `Notes: ${midiEvents.length}`;
    recordModal.classList.remove('hidden');
    store.emit('statusMessage', `Recording complete (${midiEvents.length} notes)`);
  }

  btnRecord.addEventListener('click', () => {
    if (videoRecorder.isRecording()) {
      void stopRecordingAndShowModal();
    } else {
      startRecording();
    }
  });

  // Preview Modal Actions
  function triggerVideoDownload(): void {
    if (!lastRecordedVideo) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadBlob(lastRecordedVideo.blob, `beatcam-${stamp}.${lastRecordedVideo.extension}`);
  }

  function triggerMidiDownload(): void {
    const settings = store.getSettings();
    const bpm = Math.max(40, Math.min(240, Number(inpMidiBpm.value) || 120));
    const quantize = selModalQuantize.value as QuantizeMode;
    const multiTrack = chkMultitrack.checked;

    store.updateSettings({ bpm, quantize, multiTrackMidi: multiTrack });

    const midiBlob = midiRecorder.buildMidiBlob(store.getSlots(), {
      bpm,
      quantize,
      multiTrack,
      midiMapMode: settings.midiMapMode,
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadBlob(midiBlob, `beatcam-${stamp}.mid`);
  }

  btnDlVideo.addEventListener('click', triggerVideoDownload);
  btnDlMidi.addEventListener('click', triggerMidiDownload);
  btnDlBoth.addEventListener('click', () => {
    triggerVideoDownload();
    triggerMidiDownload();
  });

  btnCloseModal.addEventListener('click', () => {
    previewVideo.pause();
    recordModal.classList.add('hidden');
  });

  recordModal.addEventListener('click', (e) => {
    if (e.target === recordModal) {
      previewVideo.pause();
      recordModal.classList.add('hidden');
    }
  });

  // Bottom & Sidebar Controls Binding
  selActiveFingers.addEventListener('change', () => {
    store.updateSettings({ activeFingerCount: Number(selActiveFingers.value) });
  });

  selMidiMode.addEventListener('change', () => {
    store.updateSettings({ midiMapMode: selMidiMode.value as MidiMapMode });
  });

  selQuantize.addEventListener('change', () => {
    store.updateSettings({ quantize: selQuantize.value as QuantizeMode });
  });

  btnRandomizeAll.addEventListener('click', () => {
    audio.ensureContext();
    void fingerPanel.randomizeAllSynthSlots();
  });

  rngSensitivity.addEventListener('input', () => {
    const v = Number(rngSensitivity.value);
    valSensitivity.textContent = `${v.toFixed(2)}x`;
    store.updateSettings({ sensitivity: v });
  });

  rngVelocity.addEventListener('input', () => {
    const v = Number(rngVelocity.value);
    valVelocity.textContent = v.toFixed(2);
    store.updateSettings({ velocityThreshold: v });
  });

  rngVolume.addEventListener('input', () => {
    const v = Number(rngVolume.value);
    valVolume.textContent = `${Math.round(v * 100)}%`;
    audio.setMasterVolume(v);
    store.updateSettings({ masterVolume: v });
  });

  chkSympathy.addEventListener('change', () => {
    store.updateSettings({ sympathySuppression: chkSympathy.checked });
  });

  chkVideoOverlay.addEventListener('change', () => {
    store.updateSettings({ includeOverlayInVideo: chkVideoOverlay.checked });
  });

  selResolution.addEventListener('change', () => {
    store.updateSettings({
      recordResolution: selResolution.value as '480p' | '720p',
    });
  });

  // Live Web MIDI Output
  function refreshMidiSelect(ports: Array<{ id: string; name: string }>): void {
    selMidiOut.innerHTML = '';
    if (ports.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No MIDI Port';
      selMidiOut.appendChild(opt);
      selMidiOut.disabled = true;
      return;
    }
    for (const p of ports) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      selMidiOut.appendChild(opt);
    }
    selMidiOut.value = webMidi.getSelectedOutputId();
    selMidiOut.disabled = false;
  }

  chkLiveMidi.addEventListener('change', async () => {
    if (chkLiveMidi.checked) {
      try {
        const ports = await webMidi.init(refreshMidiSelect);
        refreshMidiSelect(ports);
        store.updateSettings({ liveMidiEnabled: true });
        store.emit(
          'statusMessage',
          ports.length > 0
            ? `CanlÄ± Web MIDI aktif (${ports.length} port)`
            : 'Web MIDI aÃ§Ä±k (aktif port bulunamadÄ±, loopMIDI aÃ§abilirsiniz)'
        );
      } catch (err) {
        chkLiveMidi.checked = false;
        store.updateSettings({ liveMidiEnabled: false });
        store.emit(
          'statusMessage',
          err instanceof Error ? err.message : 'Web MIDI aÃ§Ä±lamadÄ±'
        );
      }
    } else {
      store.updateSettings({ liveMidiEnabled: false });
      selMidiOut.disabled = true;
    }
  });

  selMidiOut.addEventListener('change', () => {
    webMidi.setSelectedOutput(selMidiOut.value);
    store.updateSettings({ selectedMidiOutputId: selMidiOut.value });
  });

  // Preset Export / Import (Step 9)
  btnExportPreset.addEventListener('click', async () => {
    try {
      const json = await sampleStore.exportPreset(store.getSlots());
      const blob = new Blob([json], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `beatcam-preset-${stamp}.json`);
      store.emit('statusMessage', 'Preset dÄ±ÅŸa aktarÄ±ldÄ±');
    } catch (err) {
      console.error(err);
      store.emit('statusMessage', 'Preset dÄ±ÅŸa aktarÄ±lamadÄ±');
    }
  });

  btnImportPreset.addEventListener('click', () => {
    inputImportPreset.click();
  });

  inputImportPreset.addEventListener('change', async () => {
    const file = inputImportPreset.files?.[0];
    inputImportPreset.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      await sampleStore.importPreset(text);
      await hydrateAudioSlots();
      store.emit('statusMessage', `"${file.name}" preset yÃ¼klendi!`);
    } catch (err) {
      console.error(err);
      store.emit('statusMessage', 'GeÃ§ersiz preset dosyasÄ±!');
    }
  });
}

void bootstrap();
