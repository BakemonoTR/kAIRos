import {
  AppSettings,
  BusId,
  DEFAULT_ONE_HIT_PADS,
  FINGER_METAS,
  FingerId,
  FingerMixerChannel,
  FxEffectType,
  FxSlotInstance,
  MidiMapMode,
  MixerBusData,
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

export const DEFAULT_FINGER_MIXER_CHANNEL: FingerMixerChannel = {
  volume: 1.0,
  muted: false,
  bus: 'master',
};

export function createFxSlot(type: FxEffectType, id?: string): FxSlotInstance {
  const uid = id ?? `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  switch (type) {
    case 'reverb':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 0.52,
        params: { size: 2.2, preDelayMs: 20, toneHz: 6200 },
      };
    case 'delay':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 0.45,
        params: { timeMs: 240, feedback: 0.42 },
      };
    case 'filter':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 1.0,
        params: { filterType: 'lowpass', cutoff: 3200, q: 2.2 },
      };
    case 'drive':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 0.85,
        params: { amount: 0.45 },
      };
    case 'chorus':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 0.55,
        params: { rateHz: 1.4, depthMs: 4.5 },
      };
    case 'compressor':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 1.0,
        params: { threshold: -18, ratio: 5, attackMs: 8, releaseMs: 140 },
      };
    case 'eq3':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 1.0,
        params: { lowDb: 2.5, midDb: 0, highDb: 2.0 },
      };
    case 'phaser':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 0.65,
        params: { rateHz: 0.9, depthHz: 900, baseHz: 700 },
      };
    case 'bitcrush':
      return {
        id: uid,
        type,
        enabled: true,
        mix: 0.75,
        params: { bits: 5, toneHz: 5500 },
      };
  }
}

export function createDefaultFingerMixerMap(): Record<number, FingerMixerChannel> {
  const map: Record<number, FingerMixerChannel> = {};
  for (let i = 0; i < 10; i++) {
    map[i] = { ...DEFAULT_FINGER_MIXER_CHANNEL };
  }
  return map;
}

export function createDefaultMidiFingerChannels(): Record<number, number> {
  const map: Record<number, number> = {};
  for (let i = 0; i < 10; i++) {
    map[i] = 0; // 0 = use global MIDI channel
  }
  return map;
}

export function createDefaultMidiFingerEnabled(): Record<number, boolean> {
  const map: Record<number, boolean> = {};
  for (let i = 0; i < 10; i++) {
    map[i] = true;
  }
  return map;
}

export function createDefaultMixerBuses(): Record<BusId, MixerBusData> {
  return {
    master: {
      id: 'master',
      name: 'Master',
      volume: 1.0,
      muted: false,
      fxSlots: [],
    },
    bus1: {
      id: 'bus1',
      name: 'Bus 1',
      volume: 1.0,
      muted: false,
      fxSlots: [createFxSlot('reverb', 'default_bus1_rev')],
    },
    bus2: {
      id: 'bus2',
      name: 'Bus 2',
      volume: 1.0,
      muted: false,
      fxSlots: [createFxSlot('delay', 'default_bus2_dly')],
    },
    bus3: {
      id: 'bus3',
      name: 'Bus 3',
      volume: 1.0,
      muted: false,
      fxSlots: [],
    },
  };
}

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
  midiChannel: 1,
  midiOctaveShift: 0,
  midiMuteLocalAudio: false,
  midiFingerChannels: createDefaultMidiFingerChannels(),
  midiFingerEnabled: createDefaultMidiFingerEnabled(),
  language: 'en',
  showLandmarks: true,
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
  fingerMixer: createDefaultFingerMixerMap(),
  mixerBuses: createDefaultMixerBuses(),
};

function loadInitialSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_SETTINGS,
        customSynth: { ...DEFAULT_SETTINGS.customSynth },
        fingerMixer: createDefaultFingerMixerMap(),
        mixerBuses: createDefaultMixerBuses(),
      };
    }
    const parsed = JSON.parse(raw);
    const mergedFingerMixer = createDefaultFingerMixerMap();
    if (parsed.fingerMixer && typeof parsed.fingerMixer === 'object') {
      for (let i = 0; i < 10; i++) {
        if (parsed.fingerMixer[i]) {
          mergedFingerMixer[i] = { ...DEFAULT_FINGER_MIXER_CHANNEL, ...parsed.fingerMixer[i] };
        }
      }
    }
    const defaultBuses = createDefaultMixerBuses();
    const mergedBuses: Record<BusId, MixerBusData> = { ...defaultBuses };
    if (parsed.mixerBuses && typeof parsed.mixerBuses === 'object') {
      for (const [bId, bVal] of Object.entries(parsed.mixerBuses as Record<string, Partial<MixerBusData>>)) {
        if (!bVal || typeof bVal !== 'object') continue;
        const fallback = defaultBuses[bId] ?? {
          id: bId,
          name: bVal.name || bId,
          volume: 1.0,
          muted: false,
          fxSlots: [],
        };
        mergedBuses[bId] = {
          ...fallback,
          ...bVal,
          id: bId,
          fxSlots: Array.isArray(bVal.fxSlots) ? bVal.fxSlots : fallback.fxSlots,
        };
      }
    }
    const mergedMidiChannels = createDefaultMidiFingerChannels();
    if (parsed.midiFingerChannels && typeof parsed.midiFingerChannels === 'object') {
      for (let i = 0; i < 10; i++) {
        if (typeof parsed.midiFingerChannels[i] === 'number') {
          mergedMidiChannels[i] = parsed.midiFingerChannels[i];
        }
      }
    }
    const mergedMidiEnabled = createDefaultMidiFingerEnabled();
    if (parsed.midiFingerEnabled && typeof parsed.midiFingerEnabled === 'object') {
      for (let i = 0; i < 10; i++) {
        if (typeof parsed.midiFingerEnabled[i] === 'boolean') {
          mergedMidiEnabled[i] = parsed.midiFingerEnabled[i];
        }
      }
    }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      customSynth: {
        ...DEFAULT_SETTINGS.customSynth,
        ...(parsed.customSynth || {}),
      },
      fingerMixer: mergedFingerMixer,
      mixerBuses: mergedBuses,
      midiFingerChannels: mergedMidiChannels,
      midiFingerEnabled: mergedMidiEnabled,
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      customSynth: { ...DEFAULT_SETTINGS.customSynth },
      fingerMixer: createDefaultFingerMixerMap(),
      mixerBuses: createDefaultMixerBuses(),
      midiFingerChannels: createDefaultMidiFingerChannels(),
      midiFingerEnabled: createDefaultMidiFingerEnabled(),
    };
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
