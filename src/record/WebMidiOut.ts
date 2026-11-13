export interface MidiPortInfo {
  id: string;
  name: string;
  isDawVirtual: boolean;
}

const DAW_PORT_PATTERN = /loopmidi|iac|virtual|daw|fl studio|ableton|logic|reaper|cubase|beatcam|midi yoke|rtp/i;
const OS_SYNTH_PATTERN = /microsoft gs wavetable|microsoft midi mapper/i;

export function isDawLoopbackPort(name: string): boolean {
  return DAW_PORT_PATTERN.test(name) && !OS_SYNTH_PATTERN.test(name);
}

export class WebMidiOut {
  private access: MIDIAccess | null = null;
  private selectedId = '';
  private onPortsChanged?: (ports: MidiPortInfo[]) => void;

  async init(
    onPortsChanged?: (ports: MidiPortInfo[]) => void,
    savedPortId?: string
  ): Promise<MidiPortInfo[]> {
    this.onPortsChanged = onPortsChanged;
    if (!navigator.requestMIDIAccess) {
      throw new Error('Web MIDI API is not supported in this browser (Chrome or Edge recommended).');
    }

    if (!this.access) {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => {
        this.onPortsChanged?.(this.listOutputs());
      };
    }

    const ports = this.listOutputs(savedPortId);
    return ports;
  }

  isReady(): boolean {
    return this.access !== null;
  }

  listOutputs(savedPortId?: string): MidiPortInfo[] {
    if (!this.access) return [];
    const list: MidiPortInfo[] = [];
    this.access.outputs.forEach((output) => {
      const name = output.name || `MIDI Output (${output.id})`;
      list.push({
        id: output.id,
        name,
        isDawVirtual: isDawLoopbackPort(name),
      });
    });

    if (list.length === 0) {
      this.selectedId = '';
      return list;
    }

    // Preserve explicit saved/selected port if still connected
    const targetId = savedPortId || this.selectedId;
    if (targetId && list.some((p) => p.id === targetId)) {
      this.selectedId = targetId;
      return list;
    }

    // Otherwise auto-prefer virtual DAW loopback ports (e.g. loopMIDI, IAC Driver)
    const preferred =
      list.find((p) => p.isDawVirtual) ??
      list.find((p) => !OS_SYNTH_PATTERN.test(p.name)) ??
      list[0];
    this.selectedId = preferred.id;
    return list;
  }

  setSelectedOutput(id: string): void {
    this.selectedId = id;
  }

  getSelectedOutputId(): string {
    return this.selectedId;
  }

  getSelectedOutputInfo(): MidiPortInfo | null {
    const ports = this.listOutputs();
    return ports.find((p) => p.id === this.selectedId) ?? null;
  }

  sendNoteOn(note: number, velocity01: number, channel1to16 = 1): void {
    const out = this.getActivePort();
    if (!out) return;
    const ch = Math.max(0, Math.min(15, Math.round(channel1to16) - 1));
    const midiNote = Math.max(0, Math.min(127, Math.round(note)));
    const vel = Math.max(1, Math.min(127, Math.round(velocity01 * 127)));
    out.send([0x90 | ch, midiNote, vel]);
  }

  sendNoteOff(note: number, channel1to16 = 1): void {
    const out = this.getActivePort();
    if (!out) return;
    const ch = Math.max(0, Math.min(15, Math.round(channel1to16) - 1));
    const midiNote = Math.max(0, Math.min(127, Math.round(note)));
    out.send([0x80 | ch, midiNote, 0]);
  }

  sendTestNote(note: number, channel1to16 = 1, velocity01 = 0.85, durationMs = 220): void {
    this.sendNoteOn(note, velocity01, channel1to16);
    window.setTimeout(() => {
      this.sendNoteOff(note, channel1to16);
    }, durationMs);
  }

  panicAllNotesOff(): void {
    const out = this.getActivePort();
    if (!out) return;
    for (let ch = 0; ch < 16; ch++) {
      out.send([0xb0 | ch, 123, 0]); // All Notes Off
      out.send([0xb0 | ch, 120, 0]); // All Sound Off
    }
  }

  private getActivePort(): MIDIOutput | null {
    if (!this.access || !this.selectedId) return null;
    return this.access.outputs.get(this.selectedId) ?? null;
  }
}
