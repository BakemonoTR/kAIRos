export type FingerId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type FingerCode =
  | 'L_pinky'
  | 'L_ring'
  | 'L_middle'
  | 'L_index'
  | 'L_thumb'
  | 'R_thumb'
  | 'R_index'
  | 'R_middle'
  | 'R_ring'
  | 'R_pinky';

export type SynthPresetType = 'kick' | 'snare' | 'hat' | 'pluck' | 'bell';

export type AppMode = 'fingers' | 'theremin';
export type ThereminPreset = 'cosmic' | 'cyber' | 'dreampad' | 'chiptune' | 'cello';
export type ThereminScale = 'continuous' | 'pentatonic' | 'blues' | 'major' | 'chromatic';

export interface ThereminState {
  active: boolean;
  pitchHz: number;
  noteName: string;
  volume: number;
  brightness: number;
  handX: number;
  handY: number;
  clenchRatio: number;
}

export interface SwipeEvent {
  hand: 'L' | 'R';
  direction: 'left' | 'right' | 'down' | 'up';
  timestampMs: number;
}

export interface LooperStatus {
  synthLayersCount: number;
  synthIsPlaying: boolean;
  drumEventsCount: number;
  drumIsPlaying: boolean;
}

export interface LivePhraseMetrics {
  bpm: number;
  drum: {
    status: 'idle' | 'recording' | 'looping';
    bar: number;
    beat: number;
    hitsCount: number;
    targetBars: number;
    targetBeats: number;
    totalBars: number;
    totalBeats: number;
  };
  synth: {
    status: 'idle' | 'recording' | 'looping';
    bar: number;
    beat: number;
    layersCount: number;
    targetBars: number;
    targetBeats: number;
    totalBars: number;
    totalBeats: number;
  };
  master: {
    active: boolean;
    bar: number;
    beat: number;
    totalBars: number;
    totalBeats: number;
  };
}

export type MidiMapMode = 'drum' | 'melodic' | 'custom';
export type QuantizeMode = 'off' | '1/8' | '1/16';

export interface FingerMeta {
  id: FingerId;
  code: FingerCode;
  hand: 'L' | 'R';
  label: string;
  shortLabel: string;
  color: string;
  keyShortcut: string;
  keyCode: string;
  tipLandmark: number;
  pipLandmark: number;
  mcpLandmark: number;
  isThumb: boolean;
  defaultDrumNote: number;
  defaultMelodicNote: number;
  defaultSynthType: SynthPresetType;
}

export interface SlotData {
  fingerId: FingerId;
  enabled: boolean;
  sourceType: 'synth' | 'custom';
  sampleName: string;
  synthSeed: number;
  synthType: SynthPresetType;
  midiNote: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface MappedFinger {
  fingerId: FingerId;
  hand: 'L' | 'R';
  tip: Point3D;
  pip: Point3D;
  mcp: Point3D;
  wrist: Point3D;
  indexMcp: Point3D;
  pinkyMcp: Point3D;
  handScale: number;
  rawBend: number;
}

export interface MappedHandsResult {
  fingers: Map<FingerId, MappedFinger>;
  rawHands: Array<{
    hand: 'L' | 'R';
    landmarks: Point3D[];
  }>;
}

export interface TapEvent {
  fingerId: FingerId;
  velocity: number; // 0.15 .. 1.0
  timestampMs: number;
}

export interface NoteOffEvent {
  fingerId: FingerId;
  timestampMs: number;
}

export interface RecordedMidiEvent {
  fingerId: FingerId;
  midiNote: number;
  velocity: number;
  startTimeSec: number;
  durationSec: number;
}

export interface AppSettings {
  activeFingerCount: number; // 1..10
  sensitivity: number; // 0.2 .. 2.0 (1.0 default)
  velocityThreshold: number; // normalized bend/sec
  sympathySuppression: boolean;
  masterVolume: number; // 0..1
  midiMapMode: MidiMapMode;
  quantize: QuantizeMode;
  bpm: number;
  multiTrackMidi: boolean;
  includeOverlayInVideo: boolean;
  recordResolution: '480p' | '720p';
  liveMidiEnabled: boolean;
  selectedMidiOutputId: string;
  appMode: AppMode;
  thereminPreset: ThereminPreset;
  thereminScale: ThereminScale;
  thereminReverb: number; // 0..1
}

/**
 * Natural piano-playing order left-to-right on mirrored view
 * OR ergonomic 0..9 order:
 * Architecture Section 4 specifies:
 * L_thumb, L_index, L_middle, L_ring, L_pinky, R_thumb ... R_pinky -> 0..9
 * Keyboard shortcuts: A S D F G H J K L ;
 */
export const FINGER_METAS: FingerMeta[] = [
  {
    id: 0,
    code: 'L_thumb',
    hand: 'L',
    label: 'Sol Başparmak',
    shortLabel: 'L Baş',
    color: '#ff4d6d',
    keyShortcut: 'A',
    keyCode: 'KeyA',
    tipLandmark: 4,
    pipLandmark: 3,
    mcpLandmark: 2,
    isThumb: true,
    defaultDrumNote: 36, // Kick
    defaultMelodicNote: 60, // C4
    defaultSynthType: 'kick',
  },
  {
    id: 1,
    code: 'L_index',
    hand: 'L',
    label: 'Sol İşaret',
    shortLabel: 'L İşaret',
    color: '#ff7b00',
    keyShortcut: 'S',
    keyCode: 'KeyS',
    tipLandmark: 8,
    pipLandmark: 6,
    mcpLandmark: 5,
    isThumb: false,
    defaultDrumNote: 38, // Acoustic Snare
    defaultMelodicNote: 62, // D4
    defaultSynthType: 'snare',
  },
  {
    id: 2,
    code: 'L_middle',
    hand: 'L',
    label: 'Sol Orta',
    shortLabel: 'L Orta',
    color: '#ffb703',
    keyShortcut: 'D',
    keyCode: 'KeyD',
    tipLandmark: 12,
    pipLandmark: 10,
    mcpLandmark: 9,
    isThumb: false,
    defaultDrumNote: 42, // Closed Hi-Hat
    defaultMelodicNote: 64, // E4
    defaultSynthType: 'hat',
  },
  {
    id: 3,
    code: 'L_ring',
    hand: 'L',
    label: 'Sol Yüzük',
    shortLabel: 'L Yüzük',
    color: '#8ac926',
    keyShortcut: 'F',
    keyCode: 'KeyF',
    tipLandmark: 16,
    pipLandmark: 14,
    mcpLandmark: 13,
    isThumb: false,
    defaultDrumNote: 46, // Open Hi-Hat
    defaultMelodicNote: 67, // G4
    defaultSynthType: 'pluck',
  },
  {
    id: 4,
    code: 'L_pinky',
    hand: 'L',
    label: 'Sol Serçe',
    shortLabel: 'L Serçe',
    color: '#06d6a0',
    keyShortcut: 'G',
    keyCode: 'KeyG',
    tipLandmark: 20,
    pipLandmark: 18,
    mcpLandmark: 17,
    isThumb: false,
    defaultDrumNote: 49, // Crash Cymbal 1
    defaultMelodicNote: 69, // A4
    defaultSynthType: 'bell',
  },
  {
    id: 5,
    code: 'R_thumb',
    hand: 'R',
    label: 'Sağ Başparmak',
    shortLabel: 'R Baş',
    color: '#00bbf9',
    keyShortcut: 'H',
    keyCode: 'KeyH',
    tipLandmark: 4,
    pipLandmark: 3,
    mcpLandmark: 2,
    isThumb: true,
    defaultDrumNote: 35, // Acoustic Bass Drum
    defaultMelodicNote: 72, // C5
    defaultSynthType: 'kick',
  },
  {
    id: 6,
    code: 'R_index',
    hand: 'R',
    label: 'Sağ İşaret',
    shortLabel: 'R İşaret',
    color: '#4361ee',
    keyShortcut: 'J',
    keyCode: 'KeyJ',
    tipLandmark: 8,
    pipLandmark: 6,
    mcpLandmark: 5,
    isThumb: false,
    defaultDrumNote: 39, // Hand Clap
    defaultMelodicNote: 74, // D5
    defaultSynthType: 'snare',
  },
  {
    id: 7,
    code: 'R_middle',
    hand: 'R',
    label: 'Sağ Orta',
    shortLabel: 'R Orta',
    color: '#7209b7',
    keyShortcut: 'K',
    keyCode: 'KeyK',
    tipLandmark: 12,
    pipLandmark: 10,
    mcpLandmark: 9,
    isThumb: false,
    defaultDrumNote: 45, // Low Tom
    defaultMelodicNote: 76, // E5
    defaultSynthType: 'hat',
  },
  {
    id: 8,
    code: 'R_ring',
    hand: 'R',
    label: 'Sağ Yüzük',
    shortLabel: 'R Yüzük',
    color: '#b5179e',
    keyShortcut: 'L',
    keyCode: 'KeyL',
    tipLandmark: 16,
    pipLandmark: 14,
    mcpLandmark: 13,
    isThumb: false,
    defaultDrumNote: 47, // Low-Mid Tom
    defaultMelodicNote: 79, // G5
    defaultSynthType: 'pluck',
  },
  {
    id: 9,
    code: 'R_pinky',
    hand: 'R',
    label: 'Sağ Serçe',
    shortLabel: 'R Serçe',
    color: '#f72585',
    keyShortcut: ';',
    keyCode: 'Semicolon',
    tipLandmark: 20,
    pipLandmark: 18,
    mcpLandmark: 17,
    isThumb: false,
    defaultDrumNote: 51, // Ride Cymbal 1
    defaultMelodicNote: 81, // A5
    defaultSynthType: 'bell',
  },
];
