import {
  BusId,
  FINGER_METAS,
  FingerId,
  FingerMixerChannel,
  FxEffectType,
  FxSlotInstance,
  MixerBusData,
} from '../types';
import { AppStore, createDefaultFingerMixerMap, createDefaultMixerBuses, createFxSlot, DEFAULT_FINGER_MIXER_CHANNEL } from '../state/store';
import { getStrings } from '../i18n';
import { AudioEngine } from '../audio/AudioEngine';

const SHORT_FINGER_NAMES: Record<FingerId, string> = {
  0: 'L Thm',
  1: 'L Idx',
  2: 'L Mid',
  3: 'L Rng',
  4: 'L Pnk',
  5: 'R Thm',
  6: 'R Idx',
  7: 'R Mid',
  8: 'R Rng',
  9: 'R Pnk',
};

const FX_LABELS: Record<FxEffectType, string> = {
  reverb: 'Reverb (Hall)',
  delay: 'Delay (Echo)',
  filter: 'Filter (LP/HP)',
  drive: 'Drive (Sat)',
  chorus: 'Chorus',
  compressor: 'Compressor',
  eq3: '3-Band EQ',
  phaser: 'Phaser',
  bitcrush: 'Bitcrusher',
};

const ALL_FX_TYPES: FxEffectType[] = [
  'reverb',
  'delay',
  'compressor',
  'eq3',
  'filter',
  'drive',
  'chorus',
  'phaser',
  'bitcrush',
];

interface MeterRef {
  fill: HTMLElement;
  dbLabel: HTMLElement;
}

export class FxPanel {
  private container: HTMLElement;
  private store: AppStore;
  private audio: AudioEngine;
  private selectedBusId: BusId = 'bus1';
  private busMeters = new Map<BusId, MeterRef>();
  private fingerMeters = new Map<FingerId, MeterRef>();
  private meterRafId: number | null = null;
  private lastMeterUpdateMs = 0;

  constructor(container: HTMLElement, store: AppStore, audio: AudioEngine) {
    this.container = container;
    this.store = store;
    this.audio = audio;

    const settings = this.store.getSettings();
    this.audio.hydrateMixer(settings.fingerMixer, settings.mixerBuses);

    this.render();
    this.startMeterLoop();
  }

  private getOrderedBuses(buses: Record<BusId, MixerBusData>): MixerBusData[] {
    const list: MixerBusData[] = [];
    if (buses.master) list.push(buses.master);
    const subKeys = Object.keys(buses)
      .filter((k) => k !== 'master')
      .sort((a, b) => {
        const na = Number(a.replace('bus', ''));
        const nb = Number(b.replace('bus', ''));
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    for (const k of subKeys) {
      list.push(buses[k]);
    }
    return list;
  }

  private startMeterLoop(): void {
    if (this.meterRafId !== null) return;
    const tick = (nowMs: number) => {
      this.meterRafId = requestAnimationFrame(tick);
      if (this.container.classList.contains('hidden')) return;
      if (nowMs - this.lastMeterUpdateMs < 33) return;
      this.lastMeterUpdateMs = nowMs;

      for (const [bId, ref] of this.busMeters.entries()) {
        const db = this.audio.getBusPeakDb(bId);
        this.applyMeterDb(ref, db);
      }
      for (const [fId, ref] of this.fingerMeters.entries()) {
        const db = this.audio.getFingerPeakDb(fId);
        this.applyMeterDb(ref, db);
      }
    };
    this.meterRafId = requestAnimationFrame(tick);
  }

  private applyMeterDb(ref: MeterRef, db: number): void {
    const pct = Math.max(0, Math.min(100, ((db + 60) / 66) * 100));
    ref.fill.style.height = `${pct.toFixed(1)}%`;
    ref.fill.classList.toggle('hot', db > -3);
    ref.dbLabel.textContent = db <= -58 ? '-∞' : `${db >= 0 ? '+' : ''}${db.toFixed(0)}dB`;
  }

  private updateFingerChannel(fingerId: FingerId, patch: Partial<FingerMixerChannel>): void {
    this.audio.ensureContext();
    const prevMap = this.store.getSettings().fingerMixer;
    const current = prevMap[fingerId] ?? { ...DEFAULT_FINGER_MIXER_CHANNEL };
    const next: FingerMixerChannel = { ...current, ...patch };
    const nextMap = { ...prevMap, [fingerId]: next };
    this.store.updateSettings({ fingerMixer: nextMap });
    this.audio.updateFingerChannel(fingerId, next);
  }

  private updateBus(busId: BusId, updater: (bus: MixerBusData) => MixerBusData): void {
    this.audio.ensureContext();
    const prevBuses = this.store.getSettings().mixerBuses;
    const target = prevBuses[busId];
    if (!target) return;
    const nextBus = updater({ ...target, fxSlots: [...target.fxSlots] });
    const nextBuses = { ...prevBuses, [busId]: nextBus };
    this.store.updateSettings({ mixerBuses: nextBuses });
    this.audio.updateBus(nextBus);
  }

  private addNewBus(): void {
    this.audio.ensureContext();
    const prevBuses = this.store.getSettings().mixerBuses;
    let idx = 1;
    while (prevBuses[`bus${idx}`]) idx++;
    const newId: BusId = `bus${idx}`;
    const newBus: MixerBusData = {
      id: newId,
      name: `Bus ${idx}`,
      volume: 1.0,
      muted: false,
      fxSlots: [],
    };
    const nextBuses = { ...prevBuses, [newId]: newBus };
    this.store.updateSettings({ mixerBuses: nextBuses });
    this.audio.updateBus(newBus);
    this.selectedBusId = newId;
    this.render();
  }

  private deleteBus(busId: BusId): void {
    if (busId === 'master') return;
    this.audio.ensureContext();
    const settings = this.store.getSettings();
    const nextBuses = { ...settings.mixerBuses };
    delete nextBuses[busId];

    // Re-route any finger assigned to deleted bus back to master
    const nextFingerMixer = { ...settings.fingerMixer };
    for (let i = 0; i < 10; i++) {
      const ch = nextFingerMixer[i];
      if (ch && ch.bus === busId) {
        const updated = { ...ch, bus: 'master' };
        nextFingerMixer[i] = updated;
        this.audio.updateFingerChannel(i as FingerId, updated);
      }
    }

    this.store.updateSettings({
      mixerBuses: nextBuses,
      fingerMixer: nextFingerMixer,
    });
    this.audio.removeBusGraph(busId);
    if (this.selectedBusId === busId) {
      this.selectedBusId = 'master';
    }
    this.render();
  }

  private resetMixer(): void {
    this.audio.ensureContext();
    const prevBuses = this.store.getSettings().mixerBuses;
    for (const k of Object.keys(prevBuses)) {
      if (k !== 'master' && k !== 'bus1' && k !== 'bus2' && k !== 'bus3') {
        this.audio.removeBusGraph(k);
      }
    }
    const nextFingerMixer = createDefaultFingerMixerMap();
    const nextBuses = createDefaultMixerBuses();
    this.store.updateSettings({
      fingerMixer: nextFingerMixer,
      mixerBuses: nextBuses,
    });
    this.audio.hydrateMixer(nextFingerMixer, nextBuses);
    this.selectedBusId = 'bus1';
    this.render();
  }

  render(): void {
    const settings = this.store.getSettings();
    const i18n = getStrings(settings.language);
    const fMix = settings.fingerMixer;
    const buses = settings.mixerBuses;
    if (!buses[this.selectedBusId]) {
      this.selectedBusId = 'master';
    }
    const orderedBuses = this.getOrderedBuses(buses);
    const subBuses = orderedBuses.filter((b) => b.id !== 'master');
    const slots = this.store.getSlots();

    this.busMeters.clear();
    this.fingerMeters.clear();
    this.container.innerHTML = '';

    // ===== 1. HORIZONTAL FL-STYLE MIXER (MASTER LEFT -> BUSES -> LEFT HAND -> RIGHT HAND) =====
    const mixerScroll = document.createElement('div');
    mixerScroll.className = 'fl-mixer-scroll';

    // Group 1: MASTER (Far Left)
    if (buses.master) {
      const masterGroup = this.createGroupBox(i18n.fxMaster, 'master-group');
      masterGroup.body.appendChild(this.buildBusStrip(buses.master, false));
      mixerScroll.appendChild(masterGroup.el);
    }

    // Group 2: FX BUSES (+ Add Bus)
    const busGroup = this.createGroupBox(i18n.fxBuses, 'buses-group');
    for (const bus of subBuses) {
      busGroup.body.appendChild(this.buildBusStrip(bus, true));
    }
    const addBusBtn = document.createElement('button');
    addBusBtn.type = 'button';
    addBusBtn.className = 'fl-add-bus-strip';
    addBusBtn.title = 'Add new FX Bus';
    addBusBtn.innerHTML = '<span>+</span><small>Bus</small>';
    addBusBtn.addEventListener('click', () => this.addNewBus());
    busGroup.body.appendChild(addBusBtn);
    mixerScroll.appendChild(busGroup.el);

    // Group 3: LEFT HAND (Fingers 0..4)
    const leftGroup = this.createGroupBox(i18n.fxLeftHand, 'left-hand-group');
    for (const meta of FINGER_METAS.filter((m) => m.hand === 'L')) {
      leftGroup.body.appendChild(
        this.buildFingerStrip(meta.id, meta.label, '#34d399', fMix, orderedBuses, slots[meta.id]?.enabled ?? true)
      );
    }
    mixerScroll.appendChild(leftGroup.el);

    // Group 4: RIGHT HAND (Fingers 5..9)
    const rightGroup = this.createGroupBox(i18n.fxRightHand, 'right-hand-group');
    for (const meta of FINGER_METAS.filter((m) => m.hand === 'R')) {
      rightGroup.body.appendChild(
        this.buildFingerStrip(meta.id, meta.label, '#a78bfa', fMix, orderedBuses, slots[meta.id]?.enabled ?? true)
      );
    }
    mixerScroll.appendChild(rightGroup.el);

    this.container.appendChild(mixerScroll);

    // ===== 2. SELECTED BUS STACKED FX RACK =====
    const activeBus = buses[this.selectedBusId] ?? buses.master;
    const rack = document.createElement('div');
    rack.className = 'fl-bus-rack';

    const rackHead = document.createElement('div');
    rackHead.className = 'fl-rack-head';

    const rackTitle = document.createElement('div');
    rackTitle.className = 'fl-rack-title';
    rackTitle.textContent = `${activeBus.name} — ${i18n.fxInsertChain}`;

    const addGroup = document.createElement('div');
    addGroup.className = 'fl-add-fx-group';

    const addSel = document.createElement('select');
    addSel.className = 'select-sm';
    for (const t of ALL_FX_TYPES) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = FX_LABELS[t];
      addSel.appendChild(opt);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary btn-xs';
    addBtn.textContent = i18n.fxAddFx;
    addBtn.addEventListener('click', () => {
      const fxType = addSel.value as FxEffectType;
      const newSlot = createFxSlot(fxType);
      this.updateBus(activeBus.id, (b) => ({
        ...b,
        fxSlots: [...b.fxSlots, newSlot],
      }));
      this.render();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-ghost btn-xs';
    resetBtn.textContent = i18n.fxResetMixer;
    resetBtn.title = i18n.fxResetMixer;
    resetBtn.addEventListener('click', () => this.resetMixer());

    addGroup.append(addSel, addBtn, resetBtn);
    rackHead.append(rackTitle, addGroup);
    rack.appendChild(rackHead);

    const slotsList = document.createElement('div');
    slotsList.className = 'fl-slots-chain';

    if (activeBus.fxSlots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'fl-empty-rack';
      empty.textContent = i18n.fxEmptyRack;
      slotsList.appendChild(empty);
    } else {
      activeBus.fxSlots.forEach((slot, idx) => {
        slotsList.appendChild(this.buildFxSlotCard(activeBus.id, slot, idx, activeBus.fxSlots.length));
      });
    }

    rack.appendChild(slotsList);
    this.container.appendChild(rack);
  }

  private createGroupBox(
    label: string,
    extraClass: string
  ): { el: HTMLElement; body: HTMLElement } {
    const el = document.createElement('div');
    el.className = `fl-group-box ${extraClass}`;

    const head = document.createElement('div');
    head.className = 'fl-group-label';
    head.textContent = label;

    const body = document.createElement('div');
    body.className = 'fl-group-strips';

    el.append(head, body);
    return { el, body };
  }

  private buildBusStrip(bus: MixerBusData, removable: boolean): HTMLElement {
    const isSelected = this.selectedBusId === bus.id;
    const isMaster = bus.id === 'master';

    const strip = document.createElement('div');
    strip.className = `fl-strip fl-bus-strip ${isMaster ? 'fl-master-strip' : ''} ${
      isSelected ? 'selected' : ''
    } ${bus.muted ? 'muted' : ''}`;
    strip.style.setProperty('--strip-color', isMaster ? '#f59e0b' : '#38bdf8');

    strip.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('input, button')) return;
      this.selectedBusId = bus.id;
      this.render();
    });

    const bar = document.createElement('div');
    bar.className = 'fl-strip-bar';

    const headRow = document.createElement('div');
    headRow.className = 'fl-strip-head-row';

    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'fl-strip-name';
    nameBtn.textContent = bus.name;
    nameBtn.addEventListener('click', () => {
      this.selectedBusId = bus.id;
      this.render();
    });
    headRow.appendChild(nameBtn);

    if (removable) {
      const delBusBtn = document.createElement('button');
      delBusBtn.type = 'button';
      delBusBtn.className = 'fl-bus-del-btn';
      delBusBtn.textContent = '×';
      delBusBtn.title = `Delete ${bus.name}`;
      delBusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteBus(bus.id);
      });
      headRow.appendChild(delBusBtn);
    }

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = `fl-mute-btn ${bus.muted ? 'active' : ''}`;
    muteBtn.textContent = bus.muted ? 'M' : 'ON';
    muteBtn.addEventListener('click', () => {
      const nextMuted = !muteBtn.classList.contains('active');
      muteBtn.classList.toggle('active', nextMuted);
      strip.classList.toggle('muted', nextMuted);
      muteBtn.textContent = nextMuted ? 'M' : 'ON';
      this.updateBus(bus.id, (b) => ({ ...b, muted: nextMuted }));
    });

    const faderMeterRow = document.createElement('div');
    faderMeterRow.className = 'fl-fader-meter-row';

    const fader = document.createElement('input');
    fader.type = 'range';
    fader.className = 'fl-fader';
    fader.min = '0';
    fader.max = '1.5';
    fader.step = '0.02';
    fader.value = String(bus.volume);

    const meterTrack = document.createElement('div');
    meterTrack.className = 'fl-meter-track';
    const meterFill = document.createElement('div');
    meterFill.className = 'fl-meter-fill';
    meterTrack.appendChild(meterFill);

    faderMeterRow.append(fader, meterTrack);

    const readouts = document.createElement('div');
    readouts.className = 'fl-readout-row';
    const volVal = document.createElement('span');
    volVal.className = 'fl-fader-val';
    volVal.textContent = `${Math.round(bus.volume * 100)}%`;
    const dbLabel = document.createElement('span');
    dbLabel.className = 'fl-db-val';
    dbLabel.textContent = '-∞';
    readouts.append(volVal, dbLabel);

    this.busMeters.set(bus.id, { fill: meterFill, dbLabel });

    fader.addEventListener('input', () => {
      const v = Number(fader.value);
      volVal.textContent = `${Math.round(v * 100)}%`;
      this.updateBus(bus.id, (b) => ({ ...b, volume: v }));
    });

    const fxBadge = document.createElement('button');
    fxBadge.type = 'button';
    fxBadge.className = `fl-fx-badge ${bus.fxSlots.length > 0 ? 'has-fx' : ''}`;
    fxBadge.textContent = `${bus.fxSlots.length} FX`;
    fxBadge.addEventListener('click', () => {
      this.selectedBusId = bus.id;
      this.render();
    });

    strip.append(bar, headRow, muteBtn, faderMeterRow, readouts, fxBadge);
    return strip;
  }

  private buildFingerStrip(
    fingerId: FingerId,
    label: string,
    color: string,
    fMix: Record<number, FingerMixerChannel>,
    orderedBuses: MixerBusData[],
    slotEnabled: boolean
  ): HTMLElement {
    const ch = fMix[fingerId] ?? { ...DEFAULT_FINGER_MIXER_CHANNEL };
    const strip = document.createElement('div');
    strip.className = `fl-strip ${!slotEnabled ? 'disabled' : ''} ${ch.muted ? 'muted' : ''}`;
    strip.style.setProperty('--strip-color', color);

    const bar = document.createElement('div');
    bar.className = 'fl-strip-bar';

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'fl-strip-name';
    titleBtn.textContent = SHORT_FINGER_NAMES[fingerId];
    titleBtn.title = `Test ${label}`;
    titleBtn.addEventListener('click', () => {
      this.audio.ensureContext();
      this.audio.trigger(fingerId, 0.9);
    });

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = `fl-mute-btn ${ch.muted ? 'active' : ''}`;
    muteBtn.textContent = ch.muted ? 'M' : 'ON';
    muteBtn.title = 'Mute / Unmute';
    muteBtn.addEventListener('click', () => {
      const nextMuted = !muteBtn.classList.contains('active');
      muteBtn.classList.toggle('active', nextMuted);
      strip.classList.toggle('muted', nextMuted);
      muteBtn.textContent = nextMuted ? 'M' : 'ON';
      this.updateFingerChannel(fingerId, { muted: nextMuted });
    });

    const faderMeterRow = document.createElement('div');
    faderMeterRow.className = 'fl-fader-meter-row';

    const fader = document.createElement('input');
    fader.type = 'range';
    fader.className = 'fl-fader';
    fader.min = '0';
    fader.max = '1.5';
    fader.step = '0.02';
    fader.value = String(ch.volume);

    const meterTrack = document.createElement('div');
    meterTrack.className = 'fl-meter-track';
    const meterFill = document.createElement('div');
    meterFill.className = 'fl-meter-fill';
    meterTrack.appendChild(meterFill);

    faderMeterRow.append(fader, meterTrack);

    const readouts = document.createElement('div');
    readouts.className = 'fl-readout-row';
    const volVal = document.createElement('span');
    volVal.className = 'fl-fader-val';
    volVal.textContent = `${Math.round(ch.volume * 100)}%`;
    const dbLabel = document.createElement('span');
    dbLabel.className = 'fl-db-val';
    dbLabel.textContent = '-∞';
    readouts.append(volVal, dbLabel);

    this.fingerMeters.set(fingerId, { fill: meterFill, dbLabel });

    fader.addEventListener('input', () => {
      const v = Number(fader.value);
      volVal.textContent = `${Math.round(v * 100)}%`;
      this.updateFingerChannel(fingerId, { volume: v });
    });

    const routeSel = document.createElement('select');
    routeSel.className = 'fl-route-sel';
    routeSel.title = 'Route finger to Bus';
    for (const b of orderedBuses) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.id === 'master' ? 'Mst' : b.name.replace('Bus ', 'B');
      routeSel.appendChild(opt);
    }
    routeSel.value = orderedBuses.some((b) => b.id === ch.bus) ? ch.bus : 'master';
    routeSel.addEventListener('change', () => {
      const targetBus = routeSel.value as BusId;
      this.updateFingerChannel(fingerId, { bus: targetBus });
      this.selectedBusId = targetBus;
      this.render();
    });

    strip.append(bar, titleBtn, muteBtn, faderMeterRow, readouts, routeSel);
    return strip;
  }

  private buildFxSlotCard(
    busId: BusId,
    slot: FxSlotInstance,
    index: number,
    total: number
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = `fx-card ${slot.enabled ? 'enabled' : ''}`;

    const head = document.createElement('div');
    head.className = 'fx-card-head';

    const title = document.createElement('span');
    title.className = 'fx-card-title';
    title.textContent = `${index + 1}. ${FX_LABELS[slot.type]}`;

    const actions = document.createElement('div');
    actions.className = 'fl-slot-actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'fl-icon-btn';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.title = 'Move Up';
    upBtn.addEventListener('click', () => {
      this.updateBus(busId, (b) => {
        const arr = [...b.fxSlots];
        [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
        return { ...b, fxSlots: arr };
      });
      this.render();
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'fl-icon-btn';
    downBtn.textContent = '↓';
    downBtn.disabled = index === total - 1;
    downBtn.title = 'Move Down';
    downBtn.addEventListener('click', () => {
      this.updateBus(busId, (b) => {
        const arr = [...b.fxSlots];
        [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
        return { ...b, fxSlots: arr };
      });
      this.render();
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = `fx-pill-toggle ${slot.enabled ? 'active' : ''}`;
    toggleBtn.textContent = slot.enabled ? 'ON' : 'OFF';
    toggleBtn.addEventListener('click', () => {
      const next = !toggleBtn.classList.contains('active');
      toggleBtn.classList.toggle('active', next);
      card.classList.toggle('enabled', next);
      toggleBtn.textContent = next ? 'ON' : 'OFF';
      this.updateSlot(busId, slot.id, { enabled: next });
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'fl-icon-btn danger';
    delBtn.textContent = '×';
    delBtn.title = 'Remove FX';
    delBtn.addEventListener('click', () => {
      this.updateBus(busId, (b) => ({
        ...b,
        fxSlots: b.fxSlots.filter((s) => s.id !== slot.id),
      }));
      this.render();
    });

    actions.append(upBtn, downBtn, toggleBtn, delBtn);
    head.append(title, actions);
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'fx-card-body';

    body.appendChild(
      this.buildSliderRow('Mix', 0, 1, 0.02, slot.mix, (v) => `${Math.round(v * 100)}%`, (v) => {
        this.updateSlot(busId, slot.id, { mix: v });
      })
    );

    if (slot.type === 'reverb') {
      body.appendChild(
        this.buildSliderRow('Size', 0.4, 4.8, 0.1, Number(slot.params.size ?? 2.2), (v) => `${v.toFixed(1)} s`, (v) =>
          this.updateSlotParam(busId, slot.id, 'size', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Pre-Dly', 0, 80, 2, Number(slot.params.preDelayMs ?? 20), (v) => `${Math.round(v)} ms`, (v) =>
          this.updateSlotParam(busId, slot.id, 'preDelayMs', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Tone', 1200, 12000, 100, Number(slot.params.toneHz ?? 6200), (v) => `${Math.round(v)} Hz`, (v) =>
          this.updateSlotParam(busId, slot.id, 'toneHz', v)
        )
      );
    } else if (slot.type === 'delay') {
      body.appendChild(
        this.buildSliderRow('Time', 40, 750, 10, Number(slot.params.timeMs ?? 240), (v) => `${Math.round(v)} ms`, (v) =>
          this.updateSlotParam(busId, slot.id, 'timeMs', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Feedbk', 0, 0.85, 0.02, Number(slot.params.feedback ?? 0.42), (v) => `${Math.round(v * 100)}%`, (v) =>
          this.updateSlotParam(busId, slot.id, 'feedback', v)
        )
      );
    } else if (slot.type === 'filter') {
      body.appendChild(
        this.buildSelectRow(
          'Type',
          String(slot.params.filterType ?? 'lowpass'),
          [
            { value: 'lowpass', label: 'Lowpass' },
            { value: 'bandpass', label: 'Bandpass' },
            { value: 'highpass', label: 'Highpass' },
          ],
          (val) => this.updateSlotParam(busId, slot.id, 'filterType', val)
        )
      );
      body.appendChild(
        this.buildSliderRow('Cutoff', 120, 14000, 50, Number(slot.params.cutoff ?? 3200), (v) => `${Math.round(v)} Hz`, (v) =>
          this.updateSlotParam(busId, slot.id, 'cutoff', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Res Q', 0.5, 14, 0.1, Number(slot.params.q ?? 2.2), (v) => v.toFixed(1), (v) =>
          this.updateSlotParam(busId, slot.id, 'q', v)
        )
      );
    } else if (slot.type === 'drive') {
      body.appendChild(
        this.buildSliderRow('Drive', 0.05, 1.0, 0.02, Number(slot.params.amount ?? 0.45), (v) => `${Math.round(v * 100)}%`, (v) =>
          this.updateSlotParam(busId, slot.id, 'amount', v)
        )
      );
    } else if (slot.type === 'chorus') {
      body.appendChild(
        this.buildSliderRow('Rate', 0.3, 6.0, 0.1, Number(slot.params.rateHz ?? 1.4), (v) => `${v.toFixed(1)} Hz`, (v) =>
          this.updateSlotParam(busId, slot.id, 'rateHz', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Depth', 1.0, 10.0, 0.2, Number(slot.params.depthMs ?? 4.5), (v) => `${v.toFixed(1)} ms`, (v) =>
          this.updateSlotParam(busId, slot.id, 'depthMs', v)
        )
      );
    } else if (slot.type === 'compressor') {
      body.appendChild(
        this.buildSliderRow('Thresh', -48, 0, 1, Number(slot.params.threshold ?? -18), (v) => `${Math.round(v)} dB`, (v) =>
          this.updateSlotParam(busId, slot.id, 'threshold', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Ratio', 1, 16, 0.5, Number(slot.params.ratio ?? 5), (v) => `${v.toFixed(1)}:1`, (v) =>
          this.updateSlotParam(busId, slot.id, 'ratio', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Attack', 1, 80, 1, Number(slot.params.attackMs ?? 8), (v) => `${Math.round(v)} ms`, (v) =>
          this.updateSlotParam(busId, slot.id, 'attackMs', v)
        )
      );
    } else if (slot.type === 'eq3') {
      body.appendChild(
        this.buildSliderRow('Low', -15, 15, 0.5, Number(slot.params.lowDb ?? 2.5), (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`, (v) =>
          this.updateSlotParam(busId, slot.id, 'lowDb', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Mid', -15, 15, 0.5, Number(slot.params.midDb ?? 0), (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`, (v) =>
          this.updateSlotParam(busId, slot.id, 'midDb', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('High', -15, 15, 0.5, Number(slot.params.highDb ?? 2.0), (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`, (v) =>
          this.updateSlotParam(busId, slot.id, 'highDb', v)
        )
      );
    } else if (slot.type === 'phaser') {
      body.appendChild(
        this.buildSliderRow('Rate', 0.1, 6.0, 0.1, Number(slot.params.rateHz ?? 0.9), (v) => `${v.toFixed(1)} Hz`, (v) =>
          this.updateSlotParam(busId, slot.id, 'rateHz', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Depth', 100, 2200, 50, Number(slot.params.depthHz ?? 900), (v) => `${Math.round(v)} Hz`, (v) =>
          this.updateSlotParam(busId, slot.id, 'depthHz', v)
        )
      );
    } else if (slot.type === 'bitcrush') {
      body.appendChild(
        this.buildSliderRow('Bits', 2, 12, 1, Number(slot.params.bits ?? 5), (v) => `${Math.round(v)}-bit`, (v) =>
          this.updateSlotParam(busId, slot.id, 'bits', v)
        )
      );
      body.appendChild(
        this.buildSliderRow('Tone', 800, 12000, 100, Number(slot.params.toneHz ?? 5500), (v) => `${Math.round(v)} Hz`, (v) =>
          this.updateSlotParam(busId, slot.id, 'toneHz', v)
        )
      );
    }

    card.appendChild(body);
    return card;
  }

  private updateSlot(busId: BusId, slotId: string, patch: Partial<FxSlotInstance>): void {
    this.updateBus(busId, (b) => ({
      ...b,
      fxSlots: b.fxSlots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    }));
  }

  private updateSlotParam(
    busId: BusId,
    slotId: string,
    key: string,
    val: number | string
  ): void {
    this.updateBus(busId, (b) => ({
      ...b,
      fxSlots: b.fxSlots.map((s) =>
        s.id === slotId ? { ...s, params: { ...s.params, [key]: val } } : s
      ),
    }));
  }

  private buildSliderRow(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    format: (v: number) => string,
    onInput: (v: number) => void
  ): HTMLElement {
    const row = document.createElement('label');
    row.className = 'fx-slider-row';

    const lbl = document.createElement('span');
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    const valEl = document.createElement('strong');
    valEl.textContent = format(value);

    input.addEventListener('input', () => {
      const v = Number(input.value);
      valEl.textContent = format(v);
      onInput(v);
    });

    row.append(lbl, input, valEl);
    return row;
  }

  private buildSelectRow(
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
    onChange: (val: string) => void
  ): HTMLElement {
    const row = document.createElement('label');
    row.className = 'fx-slider-row';

    const lbl = document.createElement('span');
    lbl.textContent = label;

    const sel = document.createElement('select');
    sel.className = 'select-sm';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));

    row.append(lbl, sel);
    return row;
  }
}
