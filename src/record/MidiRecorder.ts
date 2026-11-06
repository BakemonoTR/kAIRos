import { Midi } from '@tonejs/midi';
import {
  FINGER_METAS,
  FingerId,
  MidiMapMode,
  QuantizeMode,
  RecordedMidiEvent,
  SlotData,
} from '../types';

export interface MidiExportOptions {
  bpm: number;
  quantize: QuantizeMode;
  multiTrack: boolean;
  midiMapMode: MidiMapMode;
}

export class MidiRecorder {
  private recording = false;
  private startAudioTime = 0;
  private events: RecordedMidiEvent[] = [];
  private activeNotes = new Map<FingerId, RecordedMidiEvent>();

  start(audioCurrentTime: number): void {
    this.recording = true;
    this.startAudioTime = audioCurrentTime;
    this.events = [];
    this.activeNotes.clear();
  }

  stop(audioCurrentTime: number): RecordedMidiEvent[] {
    if (!this.recording) return this.events;
    this.recording = false;

    const nowRel = Math.max(0, audioCurrentTime - this.startAudioTime);
    for (const [, openEv] of this.activeNotes.entries()) {
      openEv.durationSec = Math.max(0.09, Math.min(0.5, nowRel - openEv.startTimeSec));
    }
    this.activeNotes.clear();
    return [...this.events];
  }

  isRecording(): boolean {
    return this.recording;
  }

  getEvents(): RecordedMidiEvent[] {
    return this.events;
  }

  recordNoteOn(
    fingerId: FingerId,
    midiNote: number,
    velocity: number,
    audioCurrentTime: number
  ): void {
    if (!this.recording) return;
    const relStart = Math.max(0, audioCurrentTime - this.startAudioTime);

    // Close previous active note on same finger if still open
    const existing = this.activeNotes.get(fingerId);
    if (existing) {
      existing.durationSec = Math.max(0.06, relStart - existing.startTimeSec);
    }

    const ev: RecordedMidiEvent = {
      fingerId,
      midiNote: Math.max(0, Math.min(127, Math.round(midiNote))),
      velocity: Math.max(0.1, Math.min(1.0, velocity)),
      startTimeSec: relStart,
      durationSec: 0.12, // default one-shot length if noteOff arrives fast or missing
    };

    this.events.push(ev);
    this.activeNotes.set(fingerId, ev);
  }

  recordNoteOff(fingerId: FingerId, audioCurrentTime: number): void {
    if (!this.recording) return;
    const existing = this.activeNotes.get(fingerId);
    if (!existing) return;

    const relNow = Math.max(0, audioCurrentTime - this.startAudioTime);
    existing.durationSec = Math.max(0.08, relNow - existing.startTimeSec);
    this.activeNotes.delete(fingerId);
  }

  buildMidiBlob(slots: SlotData[], options: MidiExportOptions): Blob {
    const bpm = Math.max(40, Math.min(240, options.bpm || 120));
    const midi = new Midi();
    midi.header.name = 'BeatCam Session';
    midi.header.tempos = [{ ticks: 0, bpm }];
    midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4], measures: 0 }];
    midi.header.update();

    const channel = options.midiMapMode === 'drum' ? 9 : 0; // Channel 10 in GM = index 9
    const quarterSec = 60 / bpm;
    const gridSec =
      options.quantize === '1/8'
        ? quarterSec / 2
        : options.quantize === '1/16'
          ? quarterSec / 4
          : 0;

    const quantizeTime = (sec: number): number => {
      if (gridSec <= 0) return sec;
      return Math.round(sec / gridSec) * gridSec;
    };

    if (options.multiTrack) {
      for (const meta of FINGER_METAS) {
        const fingerEvents = this.events.filter((e) => e.fingerId === meta.id);
        if (fingerEvents.length === 0) continue;

        const slot = slots[meta.id];
        const track = midi.addTrack();
        track.name = `${meta.shortLabel} - ${slot?.sampleName ?? meta.code}`;
        track.channel = channel;

        for (const ev of fingerEvents) {
          track.addNote({
            midi: slot ? slot.midiNote : ev.midiNote,
            time: quantizeTime(ev.startTimeSec),
            duration: ev.durationSec,
            velocity: ev.velocity,
          });
        }
      }
    } else {
      const track = midi.addTrack();
      track.name = 'BeatCam Performance';
      track.channel = channel;
      for (const ev of this.events) {
        const slot = slots[ev.fingerId];
        track.addNote({
          midi: slot ? slot.midiNote : ev.midiNote,
          time: quantizeTime(ev.startTimeSec),
          duration: ev.durationSec,
          velocity: ev.velocity,
        });
      }
    }

    // Ensure at least an empty track exists if user recorded 0 hits so DAWs open cleanly
    if (midi.tracks.length === 0) {
      const empty = midi.addTrack();
      empty.name = 'BeatCam Empty Track';
      empty.channel = channel;
    }

    const bytes = midi.toArray();
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
  }
}
