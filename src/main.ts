import {
  AppMode,
  CustomSynthFilterType,
  CustomSynthParams,
  CustomSynthWaveform,
  FINGER_METAS,
  FingerId,
  MappedHandsResult,
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
import { FxPanel } from './ui/FxPanel';
import { MidiPanel } from './ui/MidiPanel';
import { AppLanguage, getStrings, I18nStrings } from './i18n';
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

  // Finger Sidebar Tabs (Channels vs FX vs MIDI)
  const workspaceEl = document.querySelector<HTMLElement>('.workspace');
  const fingersSidebarTitle = getEl<HTMLElement>('fingers-sidebar-title');
  const tabFingerChannels = getEl<HTMLButtonElement>('tab-finger-channels');
  const tabFingerFx = getEl<HTMLButtonElement>('tab-finger-fx');
  const tabFingerMidi = getEl<HTMLButtonElement>('tab-finger-midi');
  const fingersChannelsToolbar = getEl<HTMLElement>('fingers-channels-toolbar');
  const fingerFxContainer = getEl<HTMLElement>('finger-fx-panel');
  const fingerMidiContainer = getEl<HTMLElement>('finger-midi-panel');
  const fxPanel = new FxPanel(fingerFxContainer, store, audio);
  const midiPanel = new MidiPanel(fingerMidiContainer, store, webMidi, () => {
    const s = store.getSettings();
    chkLiveMidi.checked = s.liveMidiEnabled;
    selMidiMode.value = s.midiMapMode;
    refreshMidiSelect(webMidi.listOutputs(s.selectedMidiOutputId));
  });
  let activeFingerTab: 'channels' | 'fx' | 'midi' = 'channels';

  function setFingerSidebarTab(tab: 'channels' | 'fx' | 'midi'): void {
    activeFingerTab = tab;
    const isFx = tab === 'fx';
    const isMidi = tab === 'midi';
    const isChannels = tab === 'channels';
    tabFingerChannels.classList.toggle('active', isChannels);
    tabFingerFx.classList.toggle('active', isFx);
    tabFingerMidi.classList.toggle('active', isMidi);
    fingersSidebarTitle.textContent = isFx
      ? 'Mixer & FX Buses'
      : isMidi
        ? 'MIDI & DAW Control'
        : 'Finger channels';
    fingersChannelsToolbar.classList.toggle('hidden', !isChannels);
    slotsContainer.classList.toggle('hidden', !isChannels);
    fingerFxContainer.classList.toggle('hidden', !isFx);
    fingerMidiContainer.classList.toggle('hidden', !isMidi);
    workspaceEl?.classList.toggle('fx-wide', isFx && store.getSettings().appMode === 'fingers');
    if (isFx) {
      fxPanel.render();
    } else if (isMidi) {
      midiPanel.render();
    }
  }

  tabFingerChannels.addEventListener('click', () => setFingerSidebarTab('channels'));
  tabFingerFx.addEventListener('click', () => setFingerSidebarTab('fx'));
  tabFingerMidi.addEventListener('click', () => setFingerSidebarTab('midi'));

  // Theremin & Looper Sidebar Elements
  const selThereminPreset = getEl<HTMLSelectElement>('sel-theremin-preset');
  const selThereminScale = getEl<HTMLSelectElement>('sel-theremin-scale');
  const rngThereminReverb = getEl<HTMLInputElement>('rng-theremin-reverb');
  const valThereminReverb = getEl<HTMLElement>('val-theremin-reverb');
  const customSynthBox = getEl<HTMLElement>('custom-synth-controls');
  const selCustomOsc1 = getEl<HTMLSelectElement>('sel-custom-osc1');
  const selCustomOsc2 = getEl<HTMLSelectElement>('sel-custom-osc2');
  const selCustomOctave = getEl<HTMLSelectElement>('sel-custom-octave');
  const rngCustomDetune = getEl<HTMLInputElement>('rng-custom-detune');
  const valCustomDetune = getEl<HTMLElement>('val-custom-detune');
  const selCustomFilter = getEl<HTMLSelectElement>('sel-custom-filter');
  const rngCustomQ = getEl<HTMLInputElement>('rng-custom-q');
  const valCustomQ = getEl<HTMLElement>('val-custom-q');
  const rngCustomVibRate = getEl<HTMLInputElement>('rng-custom-vibrate');
  const valCustomVibRate = getEl<HTMLElement>('val-custom-vibrate');
  const rngCustomVibDepth = getEl<HTMLInputElement>('rng-custom-vibdepth');
  const valCustomVibDepth = getEl<HTMLElement>('val-custom-vibdepth');
  const rngCustomGlide = getEl<HTMLInputElement>('rng-custom-glide');
  const valCustomGlide = getEl<HTMLElement>('val-custom-glide');
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
  const oneHitDock = getEl<HTMLElement>('one-hit-dock');
  const inputOneHitFile = getEl<HTMLInputElement>('input-onehit-file');
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
    opt.textContent = `${n} ${n === 1 ? 'finger' : 'fingers'}`;
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
    lblSynthLayers.textContent = `${status.synthLayersCount} ${status.synthLayersCount === 1 ? 'layer' : 'layers'}`;
    lblDrumHits.textContent = `${status.drumEventsCount} ${status.drumEventsCount === 1 ? 'hit' : 'hits'}`;
    store.emit('looperUpdate', status);
  }

  function setMode(mode: AppMode): void {
    store.updateSettings({ appMode: mode });
    btnModeFingers.classList.toggle('active', mode === 'fingers');
    btnModeTheremin.classList.toggle('active', mode === 'theremin');
    panelFingersMode.classList.toggle('hidden', mode !== 'fingers');
    panelThereminMode.classList.toggle('hidden', mode !== 'theremin');
    workspaceEl?.classList.toggle('fx-wide', mode === 'fingers' && activeFingerTab === 'fx');
    overlay.setAppMode(mode);
    if (mode === 'fingers') {
      theremin.silence();
      overlay.setThereminState(null);
    }
    store.emit(
      'statusMessage',
      mode === 'theremin'
        ? 'Synth & Looper Mode Active'
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

  function syncCustomSynthUi(cs: CustomSynthParams, preset: ThereminPreset): void {
    customSynthBox.classList.toggle('hidden', preset !== 'custom');
    selCustomOsc1.value = cs.osc1Wave;
    selCustomOsc2.value = cs.osc2Wave;
    selCustomOctave.value = String(cs.osc2Octave);
    rngCustomDetune.value = String(cs.osc2Detune);
    valCustomDetune.textContent = `${cs.osc2Detune} ct`;
    selCustomFilter.value = cs.filterType;
    rngCustomQ.value = String(cs.filterQ);
    valCustomQ.textContent = cs.filterQ.toFixed(1);
    rngCustomVibRate.value = String(cs.vibratoRate);
    valCustomVibRate.textContent = `${cs.vibratoRate.toFixed(1)} Hz`;
    rngCustomVibDepth.value = String(cs.vibratoDepth);
    valCustomVibDepth.textContent = cs.vibratoDepth.toFixed(1);
    rngCustomGlide.value = String(cs.glide);
    valCustomGlide.textContent = `${Math.round(cs.glide * 1000)} ms`;
  }

  function applyCustomSynthPatch(patch: Partial<CustomSynthParams>): void {
    ensureAllEngines();
    const updated = theremin.setCustomParams(patch);
    store.updateSettings({ customSynth: updated });
    syncCustomSynthUi(updated, selThereminPreset.value as ThereminPreset);
  }

  theremin.setCustomParams(initSettings.customSynth);
  theremin.setPreset(initSettings.thereminPreset);
  theremin.setScale(initSettings.thereminScale);
  theremin.setReverbAmount(initSettings.thereminReverb);
  syncCustomSynthUi(initSettings.customSynth, initSettings.thereminPreset);
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
    customSynthBox.classList.toggle('hidden', val !== 'custom');
  });

  selCustomOsc1.addEventListener('change', () => {
    applyCustomSynthPatch({ osc1Wave: selCustomOsc1.value as CustomSynthWaveform });
  });

  selCustomOsc2.addEventListener('change', () => {
    applyCustomSynthPatch({ osc2Wave: selCustomOsc2.value as CustomSynthWaveform });
  });

  selCustomOctave.addEventListener('change', () => {
    applyCustomSynthPatch({ osc2Octave: Number(selCustomOctave.value) });
  });

  rngCustomDetune.addEventListener('input', () => {
    applyCustomSynthPatch({ osc2Detune: Number(rngCustomDetune.value) });
  });

  selCustomFilter.addEventListener('change', () => {
    applyCustomSynthPatch({ filterType: selCustomFilter.value as CustomSynthFilterType });
  });

  rngCustomQ.addEventListener('input', () => {
    applyCustomSynthPatch({ filterQ: Number(rngCustomQ.value) });
  });

  rngCustomVibRate.addEventListener('input', () => {
    applyCustomSynthPatch({ vibratoRate: Number(rngCustomVibRate.value) });
  });

  rngCustomVibDepth.addEventListener('input', () => {
    applyCustomSynthPatch({ vibratoDepth: Number(rngCustomVibDepth.value) });
  });

  rngCustomGlide.addEventListener('input', () => {
    applyCustomSynthPatch({ glide: Number(rngCustomGlide.value) });
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
      overlay.showToast(newState ? 'Metronome on' : 'Metronome off', '#f8fafc');
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

    // Hydrate One-Hit Pads
    const savedPads = await sampleStore.loadOneHitPadsMeta();
    if (savedPads) {
      store.replaceOneHitPads(savedPads);
    }
    const currentPads = store.getOneHitPads();
    for (const pad of currentPads) {
      if (pad.sourceType === 'custom') {
        const stored = await sampleStore.loadOneHitCustomSample(pad.id);
        if (stored) {
          try {
            const decoded = await audio.decodeAudio(stored.data);
            audio.setOneHitBuffer(pad.id, decoded);
            continue;
          } catch {
            // Fallback to default synth
          }
        }
      }
      await audio.assignSynthToOneHit(pad.id, pad.synthSeed, pad.synthType);
      pad.sourceType = 'synth';
    }
    store.replaceOneHitPads([...currentPads]);
    overlay.setOneHitPads(store.getOneHitPads());
    renderOneHitDock();
  }

  let activeOneHitUploadId: number | null = null;
  let mouseDragPadId: number | null = null;
  let mouseDownPos: { x: number; y: number } | null = null;
  let mouseDidDrag = false;

  function renderIdleOverlayIfPaused(): void {
    if (!camera.isRunning()) {
      overlay.render({ fingers: new Map(), rawHands: [] }, store.getSlots(), videoEl, performance.now());
    }
  }

  function renderOneHitDock(): void {
    oneHitDock.innerHTML = '';
    const titleEl = document.createElement('div');
    titleEl.className = 'one-hit-dock-title';
    titleEl.textContent = 'One-hits';
    oneHitDock.appendChild(titleEl);

    const pads = store.getOneHitPads();
    for (const pad of pads) {
      const box = document.createElement('div');
      box.className = `one-hit-box${pad.placed ? ' placed' : ''}`;
      box.dataset.padId = String(pad.id);

      const topRow = document.createElement('div');
      topRow.className = 'one-hit-box-top';

      const lbl = document.createElement('span');
      lbl.className = 'one-hit-box-label';
      const dot = document.createElement('span');
      dot.className = 'one-hit-dot';
      dot.style.backgroundColor = pad.color;
      lbl.appendChild(dot);
      lbl.appendChild(document.createTextNode(pad.label));
      topRow.appendChild(lbl);

      if (pad.placed) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'one-hit-reset-btn';
        resetBtn.title = 'Return to dock';
        resetBtn.textContent = '×';
        resetBtn.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
        });
        resetBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          store.updateOneHitPad(pad.id, { placed: false });
          overlay.setOneHitPads(store.getOneHitPads());
          void sampleStore.saveOneHitPadsMeta(store.getOneHitPads());
          renderOneHitDock();
          renderIdleOverlayIfPaused();
        });
        topRow.appendChild(resetBtn);
      }

      const sampleEl = document.createElement('div');
      sampleEl.className = 'one-hit-box-sample';
      sampleEl.textContent = pad.sampleName;

      const hintEl = document.createElement('div');
      hintEl.className = 'one-hit-box-hint';
      hintEl.textContent = pad.placed ? 'On camera' : 'Drag or click';

      box.appendChild(topRow);
      box.appendChild(sampleEl);
      box.appendChild(hintEl);

      box.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        mouseDragPadId = pad.id;
        mouseDownPos = { x: ev.clientX, y: ev.clientY };
        mouseDidDrag = false;
      });

      oneHitDock.appendChild(box);
    }
  }

  // Also allow mouse click / drag on placed One-Hit pads inside the camera stage
  videoStage.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest('#one-hit-dock, #start-overlay, button, input, select')) {
      return;
    }
    const stageRect = videoStage.getBoundingClientRect();
    const cx = ev.clientX - stageRect.left;
    const cy = ev.clientY - stageRect.top;
    const vp = overlay.getLastViewport(videoEl);
    const pads = store.getOneHitPads();
    for (let i = pads.length - 1; i >= 0; i--) {
      const p = pads[i];
      if (!p.placed) continue;
      const b = overlay.getOneHitPadBounds(p, vp);
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
        ev.preventDefault();
        mouseDragPadId = p.id;
        mouseDownPos = { x: ev.clientX, y: ev.clientY };
        mouseDidDrag = false;
        break;
      }
    }
  });

  window.addEventListener('pointermove', (ev) => {
    if (mouseDragPadId === null || !mouseDownPos) return;
    const dist = Math.hypot(ev.clientX - mouseDownPos.x, ev.clientY - mouseDownPos.y);
    if (dist > 5) {
      mouseDidDrag = true;
    }
    if (!mouseDidDrag) return;

    const stageRect = videoStage.getBoundingClientRect();
    const cx = ev.clientX - stageRect.left;
    const cy = ev.clientY - stageRect.top;
    const vp = overlay.getLastViewport(videoEl);

    const isOutsideCamera =
      cx > vp.offsetX + vp.drawWidth - 18 ||
      cx < vp.offsetX - 12 ||
      cy < vp.offsetY - 12 ||
      cy > vp.offsetY + vp.drawHeight + 12;

    if (isOutsideCamera) {
      store.updateOneHitPad(mouseDragPadId, { placed: false });
      overlay.setGrabbedPadId(null);
      renderOneHitDock();
    } else {
      const normX = Math.max(0.06, Math.min(0.94, (cx - vp.offsetX) / Math.max(1, vp.drawWidth)));
      const normY = Math.max(0.06, Math.min(0.94, (cy - vp.offsetY) / Math.max(1, vp.drawHeight)));
      store.updateOneHitPad(mouseDragPadId, { placed: true, normX, normY });
      overlay.setGrabbedPadId(mouseDragPadId);
      renderOneHitDock();
    }
    overlay.setOneHitPads(store.getOneHitPads());
    renderIdleOverlayIfPaused();
  });

  window.addEventListener('pointerup', () => {
    if (mouseDragPadId === null) return;
    const padId = mouseDragPadId;
    const dragged = mouseDidDrag;
    mouseDragPadId = null;
    mouseDownPos = null;
    mouseDidDrag = false;
    overlay.setGrabbedPadId(null);

    if (dragged) {
      overlay.setOneHitPads(store.getOneHitPads());
      void sampleStore.saveOneHitPadsMeta(store.getOneHitPads());
      renderOneHitDock();
      renderIdleOverlayIfPaused();
    } else {
      // Clicked without dragging -> open file dialog to load a one-shot sample into this pad
      activeOneHitUploadId = padId;
      inputOneHitFile.value = '';
      inputOneHitFile.click();
    }
  });

  inputOneHitFile.addEventListener('change', async () => {
    const file = inputOneHitFile.files?.[0];
    if (!file || activeOneHitUploadId === null) return;
    const padId = activeOneHitUploadId;
    activeOneHitUploadId = null;

    try {
      audio.ensureContext();
      const buf = await file.arrayBuffer();
      const decoded = await audio.decodeAudio(buf);
      audio.setOneHitBuffer(padId, decoded);
      await sampleStore.saveOneHitCustomSample(padId, file.name, file.type || 'audio/wav', buf);
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      store.updateOneHitPad(padId, {
        sourceType: 'custom',
        sampleName: cleanName,
      });
      await sampleStore.saveOneHitPadsMeta(store.getOneHitPads());
      overlay.setOneHitPads(store.getOneHitPads());
      renderOneHitDock();
      renderIdleOverlayIfPaused();
      audio.triggerOneHit(padId, 0.9);
      overlay.showToast(`Loaded: ${cleanName}`, '#38bdf8');
    } catch (err) {
      console.error('One-hit ses yükleme hatası:', err);
      overlay.showToast('Audio decode failed', '#f87171');
    }
  });

  overlay.setOneHitPads(store.getOneHitPads());
  renderOneHitDock();

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
  function getMidiOutParams(fingerId: FingerId, baseNote: number): { note: number; channel: number; enabled: boolean } {
    const s = store.getSettings();
    const enabled = s.midiFingerEnabled?.[fingerId] ?? true;
    const shift = s.midiMapMode === 'drum' ? 0 : (s.midiOctaveShift || 0) * 12;
    const note = Math.max(0, Math.min(127, baseNote + shift));
    const override = s.midiFingerChannels?.[fingerId] ?? 0;
    const channel = override >= 1 && override <= 16 ? override : (s.midiMapMode === 'drum' ? 10 : s.midiChannel || 1);
    return { note, channel, enabled };
  }

  store.on('noteOn', ({ fingerId, velocity, timestampMs }) => {
    const slot = store.getSlot(fingerId);
    if (!slot || !slot.enabled) return;

    const settings = store.getSettings();
    if (!settings.midiMuteLocalAudio) {
      audio.ensureContext();
      if (audioHydrated) {
        audio.trigger(fingerId, velocity);
      } else {
        void ensureAudioHydrated().then(() => {
          audio.trigger(fingerId, velocity);
        });
      }
    }

    if (fingerId < 5) {
      airLooper.recordDrumHit(fingerId, velocity);
    }

    overlay.triggerHit(fingerId, velocity, timestampMs);

    const midiOut = getMidiOutParams(fingerId, slot.midiNote);
    if (midiRecorder.isRecording() && midiOut.enabled) {
      midiRecorder.recordNoteOn(
        fingerId,
        midiOut.note,
        velocity,
        audio.getCurrentTime()
      );
    }

    if (settings.liveMidiEnabled && midiOut.enabled) {
      webMidi.sendNoteOn(midiOut.note, velocity, midiOut.channel);
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
      const midiOut = getMidiOutParams(fingerId, slot.midiNote);
      if (midiOut.enabled) {
        webMidi.sendNoteOff(midiOut.note, midiOut.channel);
      }
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
      btnToggleCam.textContent = 'Stop';
      btnCalibrate.disabled = false;
      btnRecord.disabled = false;
      store.emit('statusMessage', 'Live tracking active');

      lastFrameMs = performance.now();
      let leftLockoutUntilMs = 0;
      let prevPalmL: { x: number; y: number } | null = null;
      let prevPalmTimeMs = 0;
      let metroZoneArmed = true;
      let lastMetroToggleMs = 0;
      let handGrabbedPadId: number | null = null;
      let wasLeftResizingPad = false;
      const padInsidePrevFrame = new Set<number>();
      const lastPadTriggerMs = new Map<number, number>();
      let lastHudFpsText = '';
      let lastHudHandsText = '';
      let latestMapped: MappedHandsResult = { fingers: new Map(), rawHands: [] };

      const processLandmarks = (
        mpResult: ReturnType<typeof handTracker.detect>,
        nowMs: number,
        video: HTMLVideoElement
      ): void => {
        const settings = store.getSettings();
        const mapped = fingerMapper.map(mpResult, nowMs, settings.appMode);
        latestMapped = mapped;
        const handsText = `${getStrings(store.getSettings().language).handsPrefix}: ${mapped.rawHands.length}`;
        if (handsText !== lastHudHandsText) {
          lastHudHandsText = handsText;
          hudHands.textContent = handsText;
        }

        const slots = store.getSlots();

        // 2. Gesture & Swipe detection (also updates Left-Hand Single-Finger Touch Mode)
        let rightHandDetected = false;
        let isLeftFastMoving = false;
        let isLeftClosingPalm = false;

        for (const rawHand of mapped.rawHands) {
          const handKey = rawHand.hand;
          if (handKey === 'L' && (handGrabbedPadId !== null || nowMs < leftLockoutUntilMs)) {
            gestureDetector.cancelLeftPointerToggle();
          }
          if (handKey === 'R' && gestureDetector.isRightPadMode()) {
            const lms = rawHand.landmarks;
            const vp = overlay.getLastViewport(video);
            const halfNormW = 48 / Math.max(1, vp.drawWidth);
            const halfNormH = 26 / Math.max(1, vp.drawHeight);
            const t4 = lms[4];
            const t8 = lms[8];
            let nearPad = handGrabbedPadId !== null;
            if (!nearPad && t4 && t8) {
              const mx = (t4.x + t8.x) * 0.5;
              const my = (t4.y + t8.y) * 0.5;
              for (const p of store.getOneHitPads()) {
                if (!p.placed) continue;
                if (
                  Math.abs(mx - p.normX) <= halfNormW * 1.9 &&
                  Math.abs(my - p.normY) <= halfNormH * 1.9
                ) {
                  nearPad = true;
                  break;
                }
              }
            }
            if (nearPad) {
              gestureDetector.cancelRightPadToggle();
            }
          }

          const { gestureState, swipe, pointerModeToggled, rightPadModeToggled } = gestureDetector.process(
            handKey,
            rawHand.landmarks,
            nowMs
          );

          if (handKey === 'R' && rightPadModeToggled) {
            const isRightPad = gestureDetector.isRightPadMode();
            overlay.setRightPadMode(isRightPad);
            if (isRightPad) {
              theremin.silence();
              overlay.setThereminState(null);
              overlay.showToast('One-hit mode (5 fingers)', '#38bdf8');
            } else {
              handGrabbedPadId = null;
              wasLeftResizingPad = false;
              overlay.setGrabbedPadId(null);
              overlay.showToast('Theremin mode', '#f8fafc');
            }
          }

          if (handKey === 'L') {
            if (handGrabbedPadId !== null) {
              gestureDetector.cancelLeftPointerToggle();
              if (wasLeftResizingPad) {
                leftLockoutUntilMs = nowMs + 240;
              }
            } else if (pointerModeToggled && nowMs >= leftLockoutUntilMs) {
              const isPointer = gestureDetector.isLeftPointerMode();
              overlay.setLeftPointerMode(isPointer);
              leftLockoutUntilMs = nowMs + 350;
              overlay.showToast(
                isPointer ? 'Pointer mode on' : 'Pointer mode off',
                '#f8fafc'
              );
              const tip = rawHand.landmarks[8];
              metroZoneArmed = !(tip && tip.x <= 0.22 && tip.y <= 0.24);
            }

            if (gestureState.isClosed || gestureState.clenchRatio > 0.62) {
              isLeftClosingPalm = true;
            }

            let palmSpeed = 0;
            const palmDt = prevPalmTimeMs > 0 ? nowMs - prevPalmTimeMs : 0;
            if (prevPalmL && palmDt > 0 && palmDt < 300) {
              palmSpeed =
                Math.hypot(gestureState.palmCenter.x - prevPalmL.x, gestureState.palmCenter.y - prevPalmL.y) /
                (palmDt / 1000);
            }
            prevPalmL = { x: gestureState.palmCenter.x, y: gestureState.palmCenter.y };
            prevPalmTimeMs = nowMs;

            // Only suppress when touching the wall boundary or during rapid gross hand swipe
            if (gestureState.palmCenter.x <= 0.13 || gestureState.velocityX < -1.10 || palmSpeed > 1.65) {
              isLeftFastMoving = true;
            }
          }

          if (swipe && settings.appMode === 'theremin') {
            try {
              store.emit('swipeEvent', swipe);
              if (swipe.hand === 'R') {
                if (swipe.direction === 'down') {
                  // Guard: Downward swipe to cycle preset ONLY when hand is OPEN and NOT playing theremin!
                  const isPlayingTheremin = gestureState.isClosed || gestureState.clenchRatio > 0.25;
                  if (!isPlayingTheremin) {
                    const nextPreset = theremin.cycleNextPreset();
                    store.updateSettings({ thereminPreset: nextPreset.preset });
                    selThereminPreset.value = nextPreset.preset;
                    customSynthBox.classList.toggle('hidden', nextPreset.preset !== 'custom');
                    theremin.playPresetChangeChime();
                    overlay.showToast(`Synth: ${nextPreset.name}`, '#f8fafc');
                    store.emit('statusMessage', `Synth preset: ${nextPreset.name}`);
                  }
                } else if (swipe.direction === 'right') {
                  // Wall bump / swipe to the right on right hand
                  overlay.triggerWallBump('R', nowMs);
                  theremin.silence();
                  const res = airLooper.commitSynthLoop();
                  if (res.totalLayers > 0) {
                    overlay.showToast(
                      `Synth loop: ${res.beatsCount} beats (Layer ${res.totalLayers})`,
                      '#f8fafc'
                    );
                    store.emit(
                      'statusMessage',
                      `Synth loop (${res.beatsCount} beats • Layer ${res.totalLayers})`
                    );
                  } else {
                    overlay.showToast('Synth not played yet', '#94a3b8');
                    store.emit('statusMessage', 'Synth not played yet');
                  }
                  refreshLooperUi();
                }
              } else if (
                swipe.hand === 'L' &&
                swipe.direction === 'left' &&
                !gestureDetector.isLeftPointerMode() &&
                handGrabbedPadId === null &&
                nowMs >= leftLockoutUntilMs
              ) {
                // Wall bump / swipe to the left on left hand
                overlay.triggerWallBump('L', nowMs);
                leftLockoutUntilMs = nowMs + 280; // Lockout to prevent post-bump tap noise
                const res = airLooper.commitDrumLoop();
                if (res.addedCount > 0) {
                  overlay.showToast(
                    `Drum loop: ${res.beatsCount} beats (${res.totalCount} notes)`,
                    '#f8fafc'
                  );
                  store.emit(
                    'statusMessage',
                    `Drum loop (${res.beatsCount} beats • ${res.totalCount} notes)`
                  );
                } else {
                  overlay.showToast('Drums not played yet', '#94a3b8');
                  store.emit('statusMessage', 'Drums not played yet');
                }
                refreshLooperUi();
              }
            } catch (swipeErr) {
              console.error('Swipe işleme hatası:', swipeErr);
            }
          }

          if (settings.appMode === 'theremin' && rawHand.hand === 'R') {
            rightHandDetected = true;
            if (gestureDetector.isRightPadMode()) {
              theremin.silence();
              overlay.setThereminState(null);

              // Right-hand 5-finger One-Hit Pad Control (Drag with right-hand pinch, Resize with left-hand pinch/spread, Play by touching)
              const lms = rawHand.landmarks;
              const vp = overlay.getLastViewport(video);
              const { handScale: rScale } = gestureDetector.computeHandGeometry(lms);

              const thumbTip = lms[4];
              const indexTip = lms[8];
              const pinchDist =
                thumbTip && indexTip
                  ? Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)
                  : 1;
              const pinchRatio = pinchDist / Math.max(0.04, rScale);
              const pinchMidX = thumbTip && indexTip ? (thumbTip.x + indexTip.x) * 0.5 : 0.5;
              const pinchMidY = thumbTip && indexTip ? (thumbTip.y + indexTip.y) * 0.5 : 0.5;

              const currentPads = store.getOneHitPads();

              if (handGrabbedPadId !== null) {
                gestureDetector.cancelRightPadToggle();
                if (pinchRatio < 0.62 && pinchDist < 0.098) {
                  // Dragging pad to the right edge of the camera (pinchMidX >= 0.89) returns it to the dock!
                  if (pinchMidX >= 0.89) {
                    store.updateOneHitPad(handGrabbedPadId, { placed: false });
                    handGrabbedPadId = null;
                    wasLeftResizingPad = false;
                    overlay.setGrabbedPadId(null);
                    overlay.setOneHitPads(store.getOneHitPads());
                    void sampleStore.saveOneHitPadsMeta(store.getOneHitPads());
                    renderOneHitDock();
                    overlay.showToast('Returned to dock', '#94a3b8');
                  } else {
                    const nx = Math.max(0.06, Math.min(0.88, pinchMidX));
                    const ny = Math.max(0.06, Math.min(0.94, pinchMidY));
                    const patch: { normX: number; normY: number; scale?: number } = { normX: nx, normY: ny };

                    // Check if Left Hand is visible in frame to resize the grabbed pad (phone-style zoom in / out)
                    const leftHandObj = mapped.rawHands.find((h) => h.hand === 'L');
                    if (leftHandObj && leftHandObj.landmarks[4] && leftHandObj.landmarks[8]) {
                      const lThumb = leftHandObj.landmarks[4];
                      const lIndex = leftHandObj.landmarks[8];
                      const { palmCenter: lPalm, handScale: lScale } = gestureDetector.computeHandGeometry(
                        leftHandObj.landmarks
                      );
                      if (lPalm.y < 0.86) {
                        wasLeftResizingPad = true;
                        const lPinchDist = Math.hypot(lThumb.x - lIndex.x, lThumb.y - lIndex.y);
                        const lSpreadRatio = lPinchDist / Math.max(0.04, lScale);
                        // Map lSpreadRatio (0.18 = pinched small -> 0.55x, 0.65 = medium -> 1.0x, 1.30 = spread wide -> 2.3x)
                        const rawTargetScale = Math.max(
                          0.55,
                          Math.min(2.35, 0.55 + ((lSpreadRatio - 0.18) / (1.30 - 0.18)) * 1.80)
                        );
                        const grabbedPad = currentPads.find((p) => p.id === handGrabbedPadId);
                        const prevScale = grabbedPad?.scale ?? 1.0;
                        const smoothedScale = prevScale * 0.68 + rawTargetScale * 0.32;
                        patch.scale = Number(smoothedScale.toFixed(2));
                      }
                    }

                    store.updateOneHitPad(handGrabbedPadId, patch);
                    overlay.setOneHitPads(store.getOneHitPads());
                  }
                } else {
                  handGrabbedPadId = null;
                  wasLeftResizingPad = false;
                  overlay.setGrabbedPadId(null);
                  void sampleStore.saveOneHitPadsMeta(store.getOneHitPads());
                }
              } else if (pinchRatio < 0.36 && pinchDist < 0.058) {
                gestureDetector.cancelRightPadToggle();
                for (let i = currentPads.length - 1; i >= 0; i--) {
                  const pad = currentPads[i];
                  if (!pad.placed) continue;
                  const s = pad.scale ?? 1.0;
                  const halfNormW = (48 * s) / Math.max(1, vp.drawWidth);
                  const halfNormH = (26 * s) / Math.max(1, vp.drawHeight);
                  if (
                    Math.abs(pinchMidX - pad.normX) <= halfNormW * 1.08 &&
                    Math.abs(pinchMidY - pad.normY) <= halfNormH * 1.08
                  ) {
                    handGrabbedPadId = pad.id;
                    wasLeftResizingPad = false;
                    overlay.setGrabbedPadId(pad.id);
                    break;
                  }
                }
              }

              // If not dragging a pad and palm is not closed for mode-toggle, check 5-finger touch on placed pads
              if (handGrabbedPadId === null && !gestureState.isClosed && gestureState.clenchRatio < 0.58) {
                const tipIndices = [4, 8, 12, 16, 20];
                let hoveredId: number | null = null;
                for (const pad of currentPads) {
                  if (!pad.placed) {
                    padInsidePrevFrame.delete(pad.id);
                    continue;
                  }
                  const s = pad.scale ?? 1.0;
                  const halfNormW = (48 * s) / Math.max(1, vp.drawWidth);
                  const halfNormH = (26 * s) / Math.max(1, vp.drawHeight);
                  let anyFingerInside = false;
                  for (const tIdx of tipIndices) {
                    const tip = lms[tIdx];
                    if (!tip) continue;
                    if (
                      Math.abs(tip.x - pad.normX) <= halfNormW &&
                      Math.abs(tip.y - pad.normY) <= halfNormH
                    ) {
                      anyFingerInside = true;
                      hoveredId = pad.id;
                      break;
                    }
                  }
                  const wasInside = padInsidePrevFrame.has(pad.id);
                  if (anyFingerInside) {
                    const lastTrig = lastPadTriggerMs.get(pad.id) ?? 0;
                    if (!wasInside && nowMs - lastTrig > 240) {
                      lastPadTriggerMs.set(pad.id, nowMs);
                      audio.triggerOneHit(pad.id, 0.95);
                      overlay.triggerOneHitFlash(pad.id, nowMs);
                    }
                    padInsidePrevFrame.add(pad.id);
                  } else if (wasInside) {
                    // Hysteresis on exit: require all fingertips outside 1.22x bounds to prevent border-jitter double-clicks
                    let stillNearInside = false;
                    for (const tIdx of tipIndices) {
                      const tip = lms[tIdx];
                      if (!tip) continue;
                      if (
                        Math.abs(tip.x - pad.normX) <= halfNormW * 1.22 &&
                        Math.abs(tip.y - pad.normY) <= halfNormH * 1.22
                      ) {
                        stillNearInside = true;
                        break;
                      }
                    }
                    if (!stillNearInside) {
                      padInsidePrevFrame.delete(pad.id);
                    }
                  }
                }
                overlay.setHoveredPadId(hoveredId);
              } else {
                overlay.setHoveredPadId(null);
              }
            } else {
              const tRes = theremin.updateGesture(
                gestureState.clenchRatio,
                gestureState.palmCenter.x,
                gestureState.palmCenter.y
              );
              if (tRes.active && tRes.volume >= 0.15) {
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
        }

        // 2B. Metronome Single-Finger Touch Check (Sol Üst Köşe — SADECE Sol El Tek Parmak Modunda!)
        let isHandInMetroZone = false;
        let isHandNearMetroZone = false;

        if (gestureDetector.isLeftPointerMode() && handGrabbedPadId === null && nowMs >= leftLockoutUntilMs) {
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
              overlay.showToast(newState ? 'Metronome on' : 'Metronome off', '#f8fafc');
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
        overlay.setRightPadMode(gestureDetector.isRightPadMode());
        overlay.setOneHitPads(store.getOneHitPads());
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
          handGrabbedPadId !== null ||
          gestureDetector.isLeftPointerMode() ||
          isLeftClosingPalm ||
          leftSimultaneousTaps >= 4 ||
          isLeftFastMoving ||
          nowMs < leftLockoutUntilMs;

        for (const tap of taps) {
          if (settings.appMode === 'theremin' && tap.fingerId >= 5) {
            if (gestureDetector.isRightPadMode() && handGrabbedPadId === null) {
              const fData = mapped.fingers.get(tap.fingerId);
              if (fData) {
                const vp = overlay.getLastViewport(video);
                for (const pad of store.getOneHitPads()) {
                  if (!pad.placed) continue;
                  const s = pad.scale ?? 1.0;
                  const halfNormW = (52 * s) / Math.max(1, vp.drawWidth);
                  const halfNormH = (30 * s) / Math.max(1, vp.drawHeight);
                  if (
                    Math.abs(fData.tip.x - pad.normX) <= halfNormW &&
                    Math.abs(fData.tip.y - pad.normY) <= halfNormH
                  ) {
                    const lastTrig = lastPadTriggerMs.get(pad.id) ?? 0;
                    if (nowMs - lastTrig > 240 && !padInsidePrevFrame.has(pad.id)) {
                      lastPadTriggerMs.set(pad.id, nowMs);
                      audio.triggerOneHit(pad.id, tap.velocity);
                      overlay.triggerOneHitFlash(pad.id, nowMs);
                    }
                    break;
                  }
                }
              }
            }
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
      };

      let needsOverlayRender = true;
      let lastOverlayRenderMs = 0;

      // Lightweight audio scheduling + throttled visual loop (never saturates 144Hz GPU!)
      const renderTick = (nowMs: number) => {
        if (!camera.isRunning()) return;

        airLooper.update();
        const metroState = metronome.update(
          airLooper.getMasterLoopStartTime(),
          airLooper.getMasterLoopDuration()
        );
        overlay.setMetronomeState(metroState);

        // Render at most ~30-60 FPS or immediately when new landmarks arrive
        if (needsOverlayRender || nowMs - lastOverlayRenderMs >= 32) {
          needsOverlayRender = false;
          lastOverlayRenderMs = nowMs;
          const settings = store.getSettings();
          const slots = store.getSlots();
          const video = camera.getVideoElement();

          overlay.render(latestMapped, slots, video, nowMs);

          if (videoRecorder.isRecording()) {
            videoRecorder.renderFrame(
              video,
              overlay,
              latestMapped,
              slots,
              settings.includeOverlayInVideo,
              nowMs
            );
          }
        }

        requestAnimationFrame(renderTick);
      };
      requestAnimationFrame(renderTick);

      camera.startFrameLoop((nowMs, video) => {
        // Measure actual camera frame rate
        const dt = nowMs - lastFrameMs;
        lastFrameMs = nowMs;
        if (dt > 0 && dt < 500) {
          const instFps = 1000 / dt;
          fpsSmooth = fpsSmooth === 0 ? instFps : fpsSmooth * 0.88 + instFps * 0.12;
          const fpsText = `FPS: ${Math.round(fpsSmooth)}`;
          if (fpsText !== lastHudFpsText) {
            lastHudFpsText = fpsText;
            hudFps.textContent = fpsText;
          }
        }

        if (handTracker.isWorkerActive()) {
          handTracker.detectAsync(video, nowMs, (mpResult, resMs) => {
            processLandmarks(mpResult, resMs, video);
            needsOverlayRender = true;
          });
        } else {
          const mpResult = handTracker.detect(video, nowMs);
          processLandmarks(mpResult, nowMs, video);
          needsOverlayRender = true;
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
    btnToggleCam.textContent = 'Start';
    btnCalibrate.disabled = true;
    btnRecord.disabled = true;
    startOverlay.classList.remove('hidden');
    btnStartHero.disabled = false;
    hudFps.textContent = 'FPS: --';
    hudHands.textContent = `${getStrings(store.getSettings().language).handsPrefix}: 0`;
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
    countdownTitle.textContent = 'Calibrating';
    countdownDesc.textContent = 'Hold your hands steady in a comfortable playing position...';
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
    recLabel.textContent = 'Stop';
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
    recLabel.textContent = 'Record';
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
    downloadBlob(lastRecordedVideo.blob, `kairos-${stamp}.${lastRecordedVideo.extension}`);
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
    downloadBlob(midiBlob, `kairos-${stamp}.mid`);
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

  // Quietly auto-probe DAW MIDI ports on startup
  if (typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function') {
    void webMidi
      .init((ports) => {
        refreshMidiSelect(ports);
        if (activeFingerTab === 'midi') midiPanel.render();
      }, initSettings.selectedMidiOutputId)
      .then((ports) => {
        refreshMidiSelect(ports);
        const selId = webMidi.getSelectedOutputId();
        if (selId && selId !== store.getSettings().selectedMidiOutputId) {
          store.updateSettings({ selectedMidiOutputId: selId });
        }
        chkLiveMidi.checked = store.getSettings().liveMidiEnabled;
        if (activeFingerTab === 'midi') midiPanel.render();
      })
      .catch(() => {
        // Ignore silent probe failure if browser denies MIDI permission until user click
      });
  }

  chkLiveMidi.addEventListener('change', async () => {
    if (chkLiveMidi.checked) {
      try {
        const ports = await webMidi.init((p) => {
          refreshMidiSelect(p);
          if (activeFingerTab === 'midi') midiPanel.render();
        }, store.getSettings().selectedMidiOutputId);
        refreshMidiSelect(ports);
        store.updateSettings({
          liveMidiEnabled: true,
          selectedMidiOutputId: webMidi.getSelectedOutputId(),
        });
        if (activeFingerTab === 'midi') midiPanel.render();
        store.emit(
          'statusMessage',
          ports.length > 0
            ? `Live Web MIDI active (${ports.length} port${ports.length === 1 ? '' : 's'})`
            : 'Web MIDI enabled (no output port found — open loopMIDI or IAC Driver)'
        );
      } catch (err) {
        chkLiveMidi.checked = false;
        store.updateSettings({ liveMidiEnabled: false });
        if (activeFingerTab === 'midi') midiPanel.render();
        store.emit(
          'statusMessage',
          err instanceof Error ? err.message : 'Failed to initialize Web MIDI'
        );
      }
    } else {
      store.updateSettings({ liveMidiEnabled: false });
      selMidiOut.disabled = true;
      if (activeFingerTab === 'midi') midiPanel.render();
    }
  });

  selMidiOut.addEventListener('change', () => {
    webMidi.setSelectedOutput(selMidiOut.value);
    store.updateSettings({ selectedMidiOutputId: selMidiOut.value });
    if (activeFingerTab === 'midi') midiPanel.render();
  });

  // Preset Export / Import (Step 9)
  btnExportPreset.addEventListener('click', async () => {
    try {
      const json = await sampleStore.exportPreset(store.getSlots());
      const blob = new Blob([json], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `kairos-preset-${stamp}.json`);
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
      store.emit('statusMessage', 'Invalid preset file!');
    }
  });

  // ===== GENERAL SETTINGS MODAL & MULTI-LANGUAGE =====
  const btnOpenSettings = getEl<HTMLButtonElement>('btn-open-settings');
  const settingsModal = getEl<HTMLElement>('settings-modal');
  const btnDoneSettings = getEl<HTMLButtonElement>('btn-done-settings');
  const btnResetSettings = getEl<HTMLButtonElement>('btn-reset-settings');
  const selLanguage = getEl<HTMLSelectElement>('sel-language');
  const chkSetLandmarks = getEl<HTMLInputElement>('chk-set-landmarks');

  function applySettingsSideEffects(): void {
    const s = store.getSettings();
    overlay.setShowLandmarks(s.showLandmarks);
  }

  function applyLanguage(lang: AppLanguage): void {
    const t = getStrings(lang);

    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n as keyof I18nStrings;
      const val = t[key];
      if (typeof val === 'string') {
        el.textContent = val;
      }
    });

    btnModeFingers.textContent = t.fingerMode;
    btnModeTheremin.textContent = t.synthLooper;
    const recOverlayLabel = chkVideoOverlay.closest('label')?.querySelector('span');
    if (recOverlayLabel) recOverlayLabel.textContent = t.overlay;
    if (!videoRecorder.isRecording()) {
      recLabel.textContent = t.record;
    }
    btnOpenSettings.title = t.settings;
    btnOpenSettings.setAttribute('aria-label', t.settings);
    btnExportPreset.textContent = t.exportPreset;
    btnImportPreset.textContent = t.importPreset;
    tabFingerChannels.textContent = t.tabChannels;
    tabFingerFx.textContent = t.tabFx;
    tabFingerMidi.textContent = t.tabMidi;
    fingersSidebarTitle.textContent =
      activeFingerTab === 'fx'
        ? t.titleFx
        : activeFingerTab === 'midi'
          ? t.titleMidi
          : t.titleChannels;

    btnToggleCam.textContent = camera.isRunning() ? t.stop : t.start;
    btnCalibrate.textContent = t.calibrate;
    const sensSpan = rngSensitivity.closest('label')?.querySelector('span');
    if (sensSpan && sensSpan.firstChild) sensSpan.firstChild.textContent = `${t.sensitivity} `;
    const threshSpan = rngVelocity.closest('label')?.querySelector('span');
    if (threshSpan && threshSpan.firstChild) threshSpan.firstChild.textContent = `${t.threshold} `;
    const volSpan = rngVolume.closest('label')?.querySelector('span');
    if (volSpan && volSpan.firstChild) volSpan.firstChild.textContent = `${t.volume} `;
    const sympSpan = chkSympathy.closest('label')?.querySelector('span');
    if (sympSpan) sympSpan.textContent = t.antiCrosstalk;
    const midiSpan = chkLiveMidi.closest('label')?.querySelector('span');
    if (midiSpan) midiSpan.textContent = t.liveMidi;
    if (!camera.isRunning()) {
      hudHands.textContent = `${t.handsPrefix}: 0`;
    }

    getEl<HTMLElement>('settings-modal-title').textContent = t.settingsTitle;
    getEl<HTMLElement>('lbl-set-language').textContent = t.languageLabel;
    getEl<HTMLElement>('lbl-set-landmarks').textContent = t.showLandmarksLabel;
    btnResetSettings.textContent = t.resetAllSettings;
    btnDoneSettings.textContent = t.close;

    fingerPanel.renderAll();
    if (activeFingerTab === 'fx') {
      fxPanel.render();
    } else if (activeFingerTab === 'midi') {
      midiPanel.render();
    }
  }

  function syncSettingsModalFromStore(): void {
    const s = store.getSettings();
    selLanguage.value = s.language || 'en';
    chkSetLandmarks.checked = s.showLandmarks ?? true;
  }

  btnOpenSettings.addEventListener('click', () => {
    syncSettingsModalFromStore();
    settingsModal.classList.remove('hidden');
  });

  const closeSettingsModal = () => settingsModal.classList.add('hidden');
  btnDoneSettings.addEventListener('click', closeSettingsModal);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  selLanguage.addEventListener('change', () => {
    const lang = selLanguage.value as AppLanguage;
    store.updateSettings({ language: lang });
    applyLanguage(lang);
  });

  chkSetLandmarks.addEventListener('change', () => {
    store.updateSettings({ showLandmarks: chkSetLandmarks.checked });
    applySettingsSideEffects();
  });

  btnResetSettings.addEventListener('click', () => {
    localStorage.removeItem('beatcam_settings_v1');
    window.location.reload();
  });

  applySettingsSideEffects();
  applyLanguage(initSettings.language || 'en');
}

void bootstrap();
