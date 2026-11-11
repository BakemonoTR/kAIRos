import {
  AppSettings,
  DEFAULT_ONE_HIT_PADS,
  FINGER_METAS,
  FingerId,
  MidiMapMode,
  OneHitPadData,
  SlotData,
  TapEvent,
  NoteOffEvent,
  ThereminState,
  SwipeEvent,
  LooperStatus,
} from '../types';

type Listener<T> = (payload: T) => void;

export interface StoreEvents {
  slotsChanged: SlotData[];
  slotUpdated: SlotData;
  settingsChanged: AppSettings;
  noteOn: TapEvent;
  noteOff: NoteOffEvent;
  calibrationState: { active: boolean; remainingSec: number };
  recordingState: { recording: boolean; countdown: number; elapsedSec: number };
  statusMessage: string;
  thereminUpdate: ThereminState;
  swipeEvent: SwipeEvent;
  looperUpdate: LooperStatus;
  oneHitPadsChanged: OneHitPadData[];
}

const SETTINGS_STORAGE_KEY = 'beatcam_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
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
  appMode: 'fingers',
  thereminPreset: 'cosmic',
  thereminScale: 'pentatonic',
  thereminReverb: 0.65,
  customSynth: {
    osc1Wave: 'sawtooth',
    osc2Wave: 'triangle',
    osc2Octave: 0,
    osc2Detune: 12,
    filterType: 'lowpass',
    filterQ: 4.0,
    vibratoRate: 5.0,
    vibratoDepth: 4.5,
    glide: 0.03,
  },
};

function loadInitialSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, customSynth: { ...DEFAULT_SETTINGS.customSynth } };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      customSynth: {
        ...DEFAULT_SETTINGS.customSynth,
        ...(parsed.customSynth || {}),
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, customSynth: { ...DEFAULT_SETTINGS.customSynth } };
  }
}

export class AppStore {
  private slots: SlotData[];
  private oneHitPads: OneHitPadData[];
  private settings: AppSettings;
  private listeners = new Map<keyof StoreEvents, Set<Listener<unknown>>>();

  constructor() {
    this.settings = loadInitialSettings();
    this.oneHitPads = DEFAULT_ONE_HIT_PADS.map((p) => ({ ...p }));
    this.slots = FINGER_METAS.map((meta, idx) => ({
      fingerId: meta.id,
      enabled: idx < this.settings.activeFingerCount,
      sourceType: 'synth',
      sampleName: `Synth ${meta.defaultSynthType.toUpperCase()}`,
      synthSeed: 1000 + idx * 137,
      synthType: meta.defaultSynthType,
      midiNote:
        this.settings.midiMapMode === 'melodic'
          ? meta.defaultMelodicNote
          : meta.defaultDrumNote,
    }));
  }

  getSlots(): SlotData[] {
    return this.slots;
  }

  getSlot(fingerId: FingerId): SlotData {
    return this.slots[fingerId];
  }

  updateSlot(fingerId: FingerId, patch: Partial<SlotData>): SlotData {
    const updated: SlotData = { ...this.slots[fingerId], ...patch };
    this.slots[fingerId] = updated;
    this.emit('slotUpdated', updated);
    this.emit('slotsChanged', this.slots);
    return updated;
  }

  replaceSlots(nextSlots: SlotData[]): void {
    this.slots = nextSlots;
    this.emit('slotsChanged', this.slots);
  }

  getOneHitPads(): OneHitPadData[] {
    return this.oneHitPads;
  }

  updateOneHitPad(id: number, patch: Partial<OneHitPadData>): OneHitPadData {
    const idx = this.oneHitPads.findIndex((p) => p.id === id);
    if (idx === -1) return this.oneHitPads[0];
    const updated: OneHitPadData = { ...this.oneHitPads[idx], ...patch };
    this.oneHitPads[idx] = updated;
    this.emit('oneHitPadsChanged', this.oneHitPads);
    return updated;
  }

  replaceOneHitPads(nextPads: OneHitPadData[]): void {
    this.oneHitPads = nextPads;
    this.emit('oneHitPadsChanged', this.oneHitPads);
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const prevMode = this.settings.midiMapMode;
    const prevCount = this.settings.activeFingerCount;

    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore storage quota issues
    }

    if (patch.activeFingerCount !== undefined && patch.activeFingerCount !== prevCount) {
      const count = patch.activeFingerCount;
      this.slots = this.slots.map((s, idx) => ({
        ...s,
        enabled: idx < count,
      }));
      this.emit('slotsChanged', this.slots);
    }

    if (patch.midiMapMode !== undefined && patch.midiMapMode !== prevMode) {
      this.applyMidiMapPreset(patch.midiMapMode);
    }

    this.emit('settingsChanged', this.settings);
    return this.settings;
  }

  applyMidiMapPreset(mode: MidiMapMode): void {
    if (mode === 'custom') return;
    this.slots = this.slots.map((slot) => {
      const meta = FINGER_METAS[slot.fingerId];
      return {
        ...slot,
        midiNote: mode === 'melodic' ? meta.defaultMelodicNote : meta.defaultDrumNote,
      };
    });
    this.emit('slotsChanged', this.slots);
  }

  on<K extends keyof StoreEvents>(event: K, fn: Listener<StoreEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const typedFn = fn as Listener<unknown>;
    set.add(typedFn);
    return () => {
      set?.delete(typedFn);
    };
  }

  emit<K extends keyof StoreEvents>(event: K, payload: StoreEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }
}

export const store = new AppStore();
