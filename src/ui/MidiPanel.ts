import { AppStore } from '../state/store';
import { WebMidiOut, MidiPortInfo } from '../record/WebMidiOut';
import { FINGER_METAS, FingerId, MidiMapMode } from '../types';
import { getStrings } from '../i18n';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const GM_DRUM_NAMES: Record<number, string> = {
  35: 'Acoustic Kick',
  36: 'Kick',
  37: 'Side Stick',
  38: 'Snare',
  39: 'Clap',
  40: 'Electric Snare',
  41: 'Low Floor Tom',
  42: 'Closed HH',
  43: 'High Floor Tom',
  44: 'Pedal HH',
  45: 'Low Tom',
  46: 'Open HH',
  47: 'Low-Mid Tom',
  48: 'Hi-Mid Tom',
  49: 'Crash 1',
  50: 'High Tom',
  51: 'Ride 1',
  52: 'China',
  53: 'Ride Bell',
  54: 'Tambourine',
  55: 'Splash',
  56: 'Cowbell',
  57: 'Crash 2',
};

export function formatMidiNote(note: number, isDrum: boolean): string {
  const clamped = Math.max(0, Math.min(127, Math.round(note)));
  if (isDrum && GM_DRUM_NAMES[clamped]) {
    return `${clamped} ${GM_DRUM_NAMES[clamped]}`;
  }
  const oct = Math.floor(clamped / 12) - 1;
  const name = NOTE_NAMES[clamped % 12];
  return `${name}${oct} (${clamped})`;
}

interface ScalePreset {
  id: string;
  label: string;
  mode: MidiMapMode;
  channel: number;
  notes: number[];
}

const QUICK_PRESETS: ScalePreset[] = [
  {
    id: 'gm-drum',
    label: 'GM Drums',
    mode: 'drum',
    channel: 10,
    notes: [36, 38, 42, 46, 49, 45, 47, 48, 39, 51],
  },
  {
    id: 'c-min-pent',
    label: 'C Min Pent',
    mode: 'melodic',
    channel: 1,
    notes: [48, 51, 53, 55, 58, 60, 63, 65, 67, 70],
  },
  {
    id: 'c-major',
    label: 'C Major',
    mode: 'melodic',
    channel: 1,
    notes: [48, 50, 52, 53, 55, 57, 59, 60, 62, 64],
  },
  {
    id: 'd-dorian',
    label: 'D Dorian',
    mode: 'melodic',
    channel: 1,
    notes: [50, 52, 53, 55, 57, 59, 60, 62, 64, 65],
  },
  {
    id: 'a-minor',
    label: 'A Minor',
    mode: 'melodic',
    channel: 1,
    notes: [45, 47, 48, 50, 52, 53, 55, 57, 59, 60],
  },
];

export class MidiPanel {
  private container: HTMLElement;
  private store: AppStore;
  private webMidi: WebMidiOut;
  private onMidiStateSync?: () => void;

  constructor(
    container: HTMLElement,
    store: AppStore,
    webMidi: WebMidiOut,
    onMidiStateSync?: () => void
  ) {
    this.container = container;
    this.store = store;
    this.webMidi = webMidi;
    this.onMidiStateSync = onMidiStateSync;
  }

  private async ensureAndRefreshPorts(enableLiveIfFound = false): Promise<MidiPortInfo[]> {
    try {
      const savedId = this.store.getSettings().selectedMidiOutputId;
      const ports = await this.webMidi.init(() => this.render(), savedId);
      const selected = this.webMidi.getSelectedOutputId();
      if (selected && selected !== savedId) {
        this.store.updateSettings({ selectedMidiOutputId: selected });
      }
      if (enableLiveIfFound && ports.length > 0 && !this.store.getSettings().liveMidiEnabled) {
        this.store.updateSettings({ liveMidiEnabled: true });
      }
      this.onMidiStateSync?.();
      this.render();
      return ports;
    } catch (err) {
      this.store.emit(
        'statusMessage',
        err instanceof Error ? err.message : 'Unable to access Web MIDI'
      );
      return [];
    }
  }

  private getEffectiveChannel(fingerId: FingerId): number {
    const s = this.store.getSettings();
    const override = s.midiFingerChannels?.[fingerId] ?? 0;
    if (override >= 1 && override <= 16) return override;
    return s.midiMapMode === 'drum' ? 10 : s.midiChannel || 1;
  }

  private getEffectiveNote(baseNote: number): number {
    const s = this.store.getSettings();
    const shift = s.midiMapMode === 'drum' ? 0 : (s.midiOctaveShift || 0) * 12;
    return Math.max(0, Math.min(127, baseNote + shift));
  }

  render(): void {
    const s = this.store.getSettings();
    const t = getStrings(s.language);
    const ports = this.webMidi.listOutputs(s.selectedMidiOutputId);
    const activePort = this.webMidi.getSelectedOutputInfo();
    const slots = this.store.getSlots();

    this.container.innerHTML = '';

    // ===== 1. DAW CONNECTION CARD =====
    const connCard = document.createElement('div');
    connCard.className = 'midi-card';

    const connHead = document.createElement('div');
    connHead.className = 'midi-card-head';

    const connTitle = document.createElement('span');
    connTitle.className = 'midi-card-title';
    connTitle.textContent = t.dawOutput;

    const btnLive = document.createElement('button');
    btnLive.type = 'button';
    btnLive.className = `midi-pill-toggle${s.liveMidiEnabled ? ' active' : ''}`;
    btnLive.textContent = s.liveMidiEnabled ? 'LIVE: ON' : 'LIVE: OFF';
    btnLive.addEventListener('click', async () => {
      if (!s.liveMidiEnabled) {
        await this.ensureAndRefreshPorts(true);
        this.store.updateSettings({ liveMidiEnabled: true });
      } else {
        this.store.updateSettings({ liveMidiEnabled: false });
      }
      this.onMidiStateSync?.();
      this.render();
    });

    connHead.append(connTitle, btnLive);
    connCard.appendChild(connHead);

    // Port selector row
    const portRow = document.createElement('div');
    portRow.className = 'midi-port-row';

    const selPort = document.createElement('select');
    selPort.className = 'select-sm midi-port-sel';
    if (ports.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = this.webMidi.isReady() ? t.noMidiPort : t.clickScan;
      selPort.appendChild(opt);
      selPort.disabled = true;
    } else {
      for (const p of ports) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.isDawVirtual ? `★ ${p.name}` : p.name;
        selPort.appendChild(opt);
      }
      selPort.value = this.webMidi.getSelectedOutputId();
    }
    selPort.addEventListener('change', () => {
      this.webMidi.setSelectedOutput(selPort.value);
      this.store.updateSettings({ selectedMidiOutputId: selPort.value });
      this.onMidiStateSync?.();
      this.render();
    });

    const btnRefresh = document.createElement('button');
    btnRefresh.type = 'button';
    btnRefresh.className = 'btn btn-ghost btn-xs midi-act-btn';
    btnRefresh.textContent = t.scan;
    btnRefresh.title = 'Scan & auto-detect DAW MIDI ports';
    btnRefresh.addEventListener('click', () => {
      void this.ensureAndRefreshPorts(false);
    });

    const btnTestDaw = document.createElement('button');
    btnTestDaw.type = 'button';
    btnTestDaw.className = 'btn btn-secondary btn-xs midi-act-btn';
    btnTestDaw.textContent = t.test;
    btnTestDaw.title = 'Send test MIDI note to selected port';
    btnTestDaw.addEventListener('click', async () => {
      if (!this.webMidi.isReady()) {
        await this.ensureAndRefreshPorts(true);
      }
      const ch = s.midiMapMode === 'drum' ? 10 : s.midiChannel || 1;
      const testNote = s.midiMapMode === 'drum' ? 36 : 60;
      this.webMidi.sendTestNote(testNote, ch, 0.9, 250);
      this.store.emit('statusMessage', `Test MIDI sent: Ch ${ch}, ${formatMidiNote(testNote, ch === 10)}`);
    });

    const btnPanic = document.createElement('button');
    btnPanic.type = 'button';
    btnPanic.className = 'btn btn-ghost btn-xs midi-act-btn';
    btnPanic.textContent = t.panic;
    btnPanic.title = 'Send All Notes Off (CC 123) on all channels';
    btnPanic.addEventListener('click', () => {
      this.webMidi.panicAllNotesOff();
      this.store.emit('statusMessage', 'MIDI Panic: All Notes Off sent');
    });

    portRow.append(selPort, btnRefresh, btnTestDaw, btnPanic);
    connCard.appendChild(portRow);

    // Port Status Pill
    const statusPill = document.createElement('div');
    if (ports.length === 0) {
      statusPill.className = 'midi-status-pill warn';
      statusPill.textContent = t.noPortMsg;
    } else if (activePort?.isDawVirtual) {
      statusPill.className = 'midi-status-pill ok';
      statusPill.textContent = `✓ ${t.dawReadyMsg} ${activePort.name}`;
    } else {
      statusPill.className = 'midi-status-pill warn';
      statusPill.textContent = `⚠ "${activePort?.name ?? 'Synth'}" ${t.synthWarnMsg}`;
    }
    connCard.appendChild(statusPill);

    // Collapsible quick guide
    const guide = document.createElement('details');
    guide.className = 'midi-guide';
    const summary = document.createElement('summary');
    summary.textContent = t.howToConnect;
    const body = document.createElement('div');
    body.className = 'midi-guide-body';
    for (const stepText of [t.guideStep1, t.guideStep2, t.guideStep3]) {
      const line = document.createElement('div');
      line.textContent = stepText;
      body.appendChild(line);
    }
    guide.append(summary, body);
    connCard.appendChild(guide);

    this.container.appendChild(connCard);

    // ===== 2. GLOBAL MIDI & QUICK SCALE/KIT =====
    const globalCard = document.createElement('div');
    globalCard.className = 'midi-card';

    const globalGrid = document.createElement('div');
    globalGrid.className = 'midi-global-grid';

    // Mode
    const modeWrap = document.createElement('label');
    modeWrap.className = 'midi-field';
    const modeLbl = document.createElement('span');
    modeLbl.textContent = t.mode;
    modeWrap.appendChild(modeLbl);
    const selMode = document.createElement('select');
    selMode.className = 'select-sm';
    selMode.innerHTML = `
      <option value="drum">GM Drum</option>
      <option value="melodic">Melodic</option>
      <option value="custom">Custom</option>
    `;
    selMode.value = s.midiMapMode;
    selMode.addEventListener('change', () => {
      const nextMode = selMode.value as MidiMapMode;
      this.store.updateSettings({
        midiMapMode: nextMode,
        midiChannel: nextMode === 'drum' ? 10 : 1,
      });
      const preset = QUICK_PRESETS.find((p) => p.mode === nextMode);
      if (preset) {
        preset.notes.forEach((n, idx) => this.store.updateSlot(idx as FingerId, { midiNote: n }));
      }
      this.onMidiStateSync?.();
      this.render();
    });
    modeWrap.appendChild(selMode);

    // Global Channel
    const chWrap = document.createElement('label');
    chWrap.className = 'midi-field';
    const chLbl = document.createElement('span');
    chLbl.textContent = t.channel;
    chWrap.appendChild(chLbl);
    const selCh = document.createElement('select');
    selCh.className = 'select-sm';
    for (let ch = 1; ch <= 16; ch++) {
      const opt = document.createElement('option');
      opt.value = String(ch);
      opt.textContent = ch === 10 ? 'Ch 10 (Drum)' : `Ch ${ch}`;
      selCh.appendChild(opt);
    }
    selCh.value = String(s.midiMapMode === 'drum' ? 10 : s.midiChannel || 1);
    selCh.addEventListener('change', () => {
      this.store.updateSettings({ midiChannel: Number(selCh.value) || 1 });
      this.render();
    });
    chWrap.appendChild(selCh);

    // Octave Shift
    const octWrap = document.createElement('label');
    octWrap.className = 'midi-field';
    const octLbl = document.createElement('span');
    octLbl.textContent = t.octave;
    octWrap.appendChild(octLbl);
    const selOct = document.createElement('select');
    selOct.className = 'select-sm';
    for (const o of [-2, -1, 0, 1, 2]) {
      const opt = document.createElement('option');
      opt.value = String(o);
      opt.textContent = o > 0 ? `+${o}` : String(o);
      selOct.appendChild(opt);
    }
    selOct.value = String(s.midiOctaveShift || 0);
    selOct.disabled = s.midiMapMode === 'drum';
    selOct.addEventListener('change', () => {
      this.store.updateSettings({ midiOctaveShift: Number(selOct.value) || 0 });
      this.render();
    });
    octWrap.appendChild(selOct);

    globalGrid.append(modeWrap, chWrap, octWrap);
    globalCard.appendChild(globalGrid);

    // Mute Local Audio (DAW Only)
    const dawOnlyRow = document.createElement('div');
    dawOnlyRow.className = 'midi-daw-only-row';
    const dawOnlyTxt = document.createElement('span');
    dawOnlyTxt.textContent = t.dawOnly;
    const btnDawOnly = document.createElement('button');
    btnDawOnly.type = 'button';
    btnDawOnly.className = `midi-pill-toggle${s.midiMuteLocalAudio ? ' active' : ''}`;
    btnDawOnly.textContent = s.midiMuteLocalAudio ? 'ON' : 'OFF';
    btnDawOnly.addEventListener('click', () => {
      this.store.updateSettings({ midiMuteLocalAudio: !s.midiMuteLocalAudio });
      this.render();
    });
    dawOnlyRow.append(dawOnlyTxt, btnDawOnly);
    globalCard.appendChild(dawOnlyRow);

    // Quick Scale / Kit Presets
    const presetsWrap = document.createElement('div');
    presetsWrap.className = 'midi-presets-wrap';
    const pLabel = document.createElement('div');
    pLabel.className = 'midi-presets-label';
    pLabel.textContent = t.quickScale;
    presetsWrap.appendChild(pLabel);

    const presetsGrid = document.createElement('div');
    presetsGrid.className = 'midi-presets-grid';
    for (const preset of QUICK_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'midi-preset-chip';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        this.store.updateSettings({
          midiMapMode: preset.mode,
          midiChannel: preset.channel,
          midiOctaveShift: 0,
        });
        preset.notes.forEach((n, idx) => {
          this.store.updateSlot(idx as FingerId, { midiNote: n });
        });
        this.onMidiStateSync?.();
        this.render();
        this.store.emit('statusMessage', `MIDI preset applied: ${preset.label}`);
      });
      presetsGrid.appendChild(btn);
    }
    presetsWrap.appendChild(presetsGrid);
    globalCard.appendChild(presetsWrap);
    this.container.appendChild(globalCard);

    // ===== 3. 10-FINGER MIDI MAPPING LIST =====
    const mapList = document.createElement('div');
    mapList.className = 'midi-map-list';

    for (const hand of ['L', 'R'] as const) {
      const handHeader = document.createElement('div');
      handHeader.className = 'midi-hand-header';
      handHeader.textContent = hand === 'L' ? t.leftHand : t.rightHand;
      mapList.appendChild(handHeader);

      for (const meta of FINGER_METAS.filter((m) => m.hand === hand)) {
        const slot = slots[meta.id];
        if (!slot) continue;
        const fingerEnabled = s.midiFingerEnabled?.[meta.id] ?? true;
        const effectiveCh = this.getEffectiveChannel(meta.id);
        const effectiveNote = this.getEffectiveNote(slot.midiNote);
        const isDrum = effectiveCh === 10;

        const row = document.createElement('div');
        row.className = `midi-finger-row${fingerEnabled ? '' : ' muted'}`;

        // Enable pill toggle
        const btnEn = document.createElement('button');
        btnEn.type = 'button';
        btnEn.className = `midi-row-toggle${fingerEnabled ? ' on' : ''}`;
        btnEn.textContent = fingerEnabled ? 'ON' : 'OFF';
        btnEn.title = 'Toggle MIDI output for this finger';
        btnEn.addEventListener('click', () => {
          const next = { ...(this.store.getSettings().midiFingerEnabled || {}) };
          next[meta.id] = !fingerEnabled;
          this.store.updateSettings({ midiFingerEnabled: next });
          this.render();
        });

        // Finger name
        const nameEl = document.createElement('span');
        nameEl.className = 'midi-finger-name';
        nameEl.textContent = meta.shortLabel;

        // Note stepper (- [C3 (48)] +)
        const noteBox = document.createElement('div');
        noteBox.className = 'midi-note-stepper';

        const btnDec = document.createElement('button');
        btnDec.type = 'button';
        btnDec.className = 'midi-step-btn';
        btnDec.textContent = '−';
        btnDec.addEventListener('click', () => {
          const nextNote = Math.max(0, slot.midiNote - 1);
          this.store.updateSlot(meta.id, { midiNote: nextNote });
          this.render();
        });

        const noteDisp = document.createElement('span');
        noteDisp.className = 'midi-note-disp';
        noteDisp.textContent = formatMidiNote(effectiveNote, isDrum);
        noteDisp.title = `Base MIDI Note: ${slot.midiNote}`;

        const btnInc = document.createElement('button');
        btnInc.type = 'button';
        btnInc.className = 'midi-step-btn';
        btnInc.textContent = '+';
        btnInc.addEventListener('click', () => {
          const nextNote = Math.min(127, slot.midiNote + 1);
          this.store.updateSlot(meta.id, { midiNote: nextNote });
          this.render();
        });

        noteBox.append(btnDec, noteDisp, btnInc);

        // Per-finger Channel select
        const chSel = document.createElement('select');
        chSel.className = 'select-sm midi-ch-sel';
        const optGlobal = document.createElement('option');
        optGlobal.value = '0';
        optGlobal.textContent = `Auto (${s.midiMapMode === 'drum' ? 10 : s.midiChannel || 1})`;
        chSel.appendChild(optGlobal);
        for (let c = 1; c <= 16; c++) {
          const o = document.createElement('option');
          o.value = String(c);
          o.textContent = `Ch ${c}`;
          chSel.appendChild(o);
        }
        chSel.value = String(s.midiFingerChannels?.[meta.id] ?? 0);
        chSel.addEventListener('change', () => {
          const next = { ...(this.store.getSettings().midiFingerChannels || {}) };
          next[meta.id] = Number(chSel.value) || 0;
          this.store.updateSettings({ midiFingerChannels: next });
          this.render();
        });

        // Test trigger button
        const btnPlay = document.createElement('button');
        btnPlay.type = 'button';
        btnPlay.className = 'midi-play-btn';
        btnPlay.textContent = '▶';
        btnPlay.title = `Send ${formatMidiNote(effectiveNote, isDrum)} on Ch ${effectiveCh}`;
        btnPlay.addEventListener('click', async () => {
          if (!this.webMidi.isReady()) {
            await this.ensureAndRefreshPorts(true);
          }
          this.webMidi.sendTestNote(effectiveNote, effectiveCh, 0.9, 200);
        });

        row.append(btnEn, nameEl, noteBox, chSel, btnPlay);
        mapList.appendChild(row);
      }
    }

    this.container.appendChild(mapList);
  }
}
