export interface MidiPortInfo {
  id: string;
  name: string;
}

export class WebMidiOut {
  private access: MIDIAccess | null = null;
  private selectedId = '';
  private onPortsChanged?: (ports: MidiPortInfo[]) => void;

  async init(onPortsChanged?: (ports: MidiPortInfo[]) => void): Promise<MidiPortInfo[]> {
    this.onPortsChanged = onPortsChanged;
    if (!navigator.requestMIDIAccess) {
      throw new Error('Bu tarayıcı Web MIDI API desteklemiyor (Chrome/Edge önerilir).');
    }

    if (!this.access) {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => {
        this.onPortsChanged?.(this.listOutputs());
      };
    }
    return this.listOutputs();
  }

  listOutputs(): MidiPortInfo[] {
    if (!this.access) return [];
    const list: MidiPortInfo[] = [];
    this.access.outputs.forEach((output) => {
      list.push({
        id: output.id,
        name: output.name || `MIDI Output (${output.id})`,
      });
    });
    if (!this.selectedId && list.length > 0) {
      this.selectedId = list[0].id;
    }
    return list;
  }

  setSelectedOutput(id: string): void {
    this.selectedId = id;
  }

  getSelectedOutputId(): string {
    return this.selectedId;
  }

  sendNoteOn(note: number, velocity01: number, isDrumChannel: boolean): void {
    const out = this.getActivePort();
    if (!out) return;
    const channel = isDrumChannel ? 9 : 0;
    const midiNote = Math.max(0, Math.min(127, Math.round(note)));
    const vel = Math.max(1, Math.min(127, Math.round(velocity01 * 127)));
    out.send([0x90 | channel, midiNote, vel]);
  }

  sendNoteOff(note: number, isDrumChannel: boolean): void {
    const out = this.getActivePort();
    if (!out) return;
    const channel = isDrumChannel ? 9 : 0;
    const midiNote = Math.max(0, Math.min(127, Math.round(note)));
    out.send([0x80 | channel, midiNote, 0]);
  }

  private getActivePort(): MIDIOutput | null {
    if (!this.access || !this.selectedId) return null;
    return this.access.outputs.get(this.selectedId) ?? null;
  }
}
