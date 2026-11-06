import { FINGER_METAS, FingerId, SlotData } from '../types';
import { AppStore } from '../state/store';
import { AudioEngine } from '../audio/AudioEngine';
import { SampleStore } from '../audio/SampleStore';
import { SynthGenerator } from '../audio/SynthGenerator';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteToName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  return `${NOTE_NAMES[clamped % 12]}${octave}`;
}

export class FingerPanel {
  private container: HTMLElement;
  private store: AppStore;
  private audio: AudioEngine;
  private sampleStore: SampleStore;
  private fileInput: HTMLInputElement;
  private pendingUploadFinger: FingerId | null = null;
  private rowElements = new Map<FingerId, HTMLElement>();
  private flashTimers = new Map<FingerId, number>();

  constructor(
    container: HTMLElement,
    store: AppStore,
    audio: AudioEngine,
    sampleStore: SampleStore
  ) {
    this.container = container;
    this.store = store;
    this.audio = audio;
    this.sampleStore = sampleStore;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'audio/*';
    this.fileInput.className = 'hidden';
    document.body.appendChild(this.fileInput);

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file && this.pendingUploadFinger !== null) {
        void this.handleFileLoad(this.pendingUploadFinger, file);
      }
      this.fileInput.value = '';
    });

    this.renderAll();

    this.store.on('slotsChanged', () => {
      this.renderAll();
      void this.sampleStore.saveSlotsMeta(this.store.getSlots());
    });

    this.store.on('noteOn', ({ fingerId }) => {
      this.flashSlot(fingerId);
    });
  }

  flashSlot(fingerId: FingerId): void {
    const row = this.rowElements.get(fingerId);
    if (!row) return;
    row.classList.add('active-hit');
    const prev = this.flashTimers.get(fingerId);
    if (prev !== undefined) window.clearTimeout(prev);
    const timer = window.setTimeout(() => {
      row.classList.remove('active-hit');
    }, 150);
    this.flashTimers.set(fingerId, timer);
  }

  private openFilePicker(fingerId: FingerId): void {
    this.pendingUploadFinger = fingerId;
    this.fileInput.click();
  }

  async handleFileLoad(fingerId: FingerId, file: File): Promise<void> {
    try {
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await this.audio.decodeAudio(arrayBuf);
      this.audio.setBuffer(fingerId, audioBuf);
      await this.sampleStore.saveCustomSample(
        fingerId,
        file.name,
        file.type || 'audio/wav',
        arrayBuf
      );

      this.store.updateSlot(fingerId, {
        sourceType: 'custom',
        sampleName: file.name,
      });
      this.audio.trigger(fingerId, 0.85);
      this.flashSlot(fingerId);
      this.store.emit('statusMessage', `${FINGER_METAS[fingerId].label}: "${file.name}" yüklendi`);
    } catch (err) {
      console.error(err);
      this.store.emit('statusMessage', 'Ses dosyası çözümlenemedi!');
    }
  }

  async randomizeSynth(fingerId: FingerId): Promise<void> {
    const seed = Math.floor(Math.random() * 900000) + 1000;
    const randomType = SynthGenerator.pickRandomType(seed);
    const generated = await this.audio.assignSynthToSlot(fingerId, seed, randomType);
    await this.sampleStore.deleteCustomSample(fingerId);

    this.store.updateSlot(fingerId, {
      sourceType: 'synth',
      synthSeed: seed,
      synthType: generated.synthType,
      sampleName: generated.label,
    });
    this.audio.trigger(fingerId, 0.85);
    this.flashSlot(fingerId);
  }

  async randomizeAllSynthSlots(): Promise<void> {
    const slots = this.store.getSlots();
    for (const slot of slots) {
      if (slot.sourceType === 'synth') {
        const seed = Math.floor(Math.random() * 900000) + 1000;
        const randomType = SynthGenerator.pickRandomType(seed);
        const generated = await this.audio.assignSynthToSlot(slot.fingerId, seed, randomType);
        slot.synthSeed = seed;
        slot.synthType = generated.synthType;
        slot.sampleName = generated.label;
      }
    }
    this.store.replaceSlots([...slots]);
    this.store.emit('statusMessage', 'Tüm synth sesleri yeniden üretildi 🎲');
  }

  async clearCustomToSynth(fingerId: FingerId): Promise<void> {
    const meta = FINGER_METAS[fingerId];
    const seed = Math.floor(Math.random() * 900000) + 1000;
    const generated = await this.audio.assignSynthToSlot(
      fingerId,
      seed,
      meta.defaultSynthType
    );
    await this.sampleStore.deleteCustomSample(fingerId);

    this.store.updateSlot(fingerId, {
      sourceType: 'synth',
      synthSeed: seed,
      synthType: generated.synthType,
      sampleName: generated.label,
    });
  }

  private renderAll(): void {
    const slots = this.store.getSlots();
    this.container.innerHTML = '';
    this.rowElements.clear();

    for (const slot of slots) {
      const row = this.createRow(slot);
      this.rowElements.set(slot.fingerId, row);
      this.container.appendChild(row);
    }
  }

  private createRow(slot: SlotData): HTMLElement {
    const meta = FINGER_METAS[slot.fingerId];
    const row = document.createElement('div');
    row.className = `slot-row${slot.enabled ? '' : ' disabled'}`;
    row.style.setProperty('--slot-color', meta.color);

    // Drag & Drop audio file support
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('audio/')) {
        void this.handleFileLoad(slot.fingerId, file);
      }
    });

    // 1. Colored dot button -> click to upload audio!
    const dotBtn = document.createElement('button');
    dotBtn.className = 'slot-dot-btn';
    dotBtn.title = `${meta.label} — Ses dosyası yüklemek için tıkla (veya sürükle-bırak)`;
    dotBtn.textContent = String(slot.fingerId + 1);
    dotBtn.addEventListener('click', () => this.openFilePicker(slot.fingerId));

    // 2. Finger info (clicking also opens file picker for convenience)
    const info = document.createElement('div');
    info.className = 'slot-info';
    info.title = 'One-shot ses yüklemek için tıkla';
    info.addEventListener('click', () => this.openFilePicker(slot.fingerId));

    const topLine = document.createElement('div');
    topLine.className = 'slot-top-line';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'slot-name';
    nameSpan.textContent = meta.label;

    const keyBadge = document.createElement('span');
    keyBadge.className = 'slot-key';
    keyBadge.textContent = meta.keyShortcut;

    topLine.append(nameSpan, keyBadge);

    const sampleSpan = document.createElement('div');
    sampleSpan.className = 'slot-sample';
    sampleSpan.textContent = slot.sampleName;

    info.append(topLine, sampleSpan);

    // 3. Actions: MIDI Note + Upload + Dice + Play + Clear
    const actions = document.createElement('div');
    actions.className = 'slot-actions';

    const midiInput = document.createElement('input');
    midiInput.type = 'number';
    midiInput.min = '0';
    midiInput.max = '127';
    midiInput.value = String(slot.midiNote);
    midiInput.className = 'midi-note-input';
    midiInput.title = `MIDI Nota: ${slot.midiNote} (${midiNoteToName(slot.midiNote)})`;
    midiInput.addEventListener('change', () => {
      const val = Math.max(0, Math.min(127, Number(midiInput.value) || 60));
      if (this.store.getSettings().midiMapMode !== 'custom') {
        this.store.updateSettings({ midiMapMode: 'custom' });
      }
      this.store.updateSlot(slot.fingerId, { midiNote: val });
    });

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'icon-btn';
    uploadBtn.title = 'Ses dosyası yükle';
    uploadBtn.textContent = '📁';
    uploadBtn.addEventListener('click', () => this.openFilePicker(slot.fingerId));

    const diceBtn = document.createElement('button');
    diceBtn.className = 'icon-btn';
    diceBtn.title = 'Rastgele synth sesi üret';
    diceBtn.textContent = '🎲';
    diceBtn.addEventListener('click', () => {
      void this.randomizeSynth(slot.fingerId);
    });

    const testBtn = document.createElement('button');
    testBtn.className = 'icon-btn';
    testBtn.title = `Test çal (${meta.keyShortcut})`;
    testBtn.textContent = '▶';
    testBtn.addEventListener('click', () => {
      this.store.emit('noteOn', {
        fingerId: slot.fingerId,
        velocity: 0.88,
        timestampMs: performance.now(),
      });
      window.setTimeout(() => {
        this.store.emit('noteOff', {
          fingerId: slot.fingerId,
          timestampMs: performance.now(),
        });
      }, 110);
    });

    actions.append(midiInput, uploadBtn, diceBtn, testBtn);

    if (slot.sourceType === 'custom') {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'icon-btn';
      clearBtn.title = 'Yüklenen sesi kaldır (Synth sesine dön)';
      clearBtn.textContent = '✕';
      clearBtn.addEventListener('click', () => {
        void this.clearCustomToSynth(slot.fingerId);
      });
      actions.appendChild(clearBtn);
    }

    row.append(dotBtn, info, actions);
    return row;
  }
}
