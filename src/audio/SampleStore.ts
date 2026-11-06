import { get, set, del } from 'idb-keyval';
import { FINGER_METAS, FingerId, SlotData } from '../types';

const SLOTS_META_KEY = 'beatcam_slots_meta_v1';
const sampleKey = (fingerId: FingerId) => `beatcam_sample_v1_${fingerId}`;

export interface StoredCustomSample {
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
}

export interface ExportedPresetV1 {
  version: 1;
  exportedAt: string;
  slots: SlotData[];
  customSamples: Record<
    string,
    {
      fileName: string;
      mimeType: string;
      base64: string;
    }
  >;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class SampleStore {
  async saveSlotsMeta(slots: SlotData[]): Promise<void> {
    await set(SLOTS_META_KEY, slots);
  }

  async loadSlotsMeta(): Promise<SlotData[] | null> {
    const saved = await get<SlotData[]>(SLOTS_META_KEY);
    if (!saved || !Array.isArray(saved) || saved.length !== 10) return null;
    return saved;
  }

  async saveCustomSample(
    fingerId: FingerId,
    fileName: string,
    mimeType: string,
    data: ArrayBuffer
  ): Promise<void> {
    const record: StoredCustomSample = { fileName, mimeType, data };
    await set(sampleKey(fingerId), record);
  }

  async loadCustomSample(fingerId: FingerId): Promise<StoredCustomSample | null> {
    const record = await get<StoredCustomSample>(sampleKey(fingerId));
    return record ?? null;
  }

  async deleteCustomSample(fingerId: FingerId): Promise<void> {
    await del(sampleKey(fingerId));
  }

  async exportPreset(slots: SlotData[]): Promise<string> {
    const customSamples: ExportedPresetV1['customSamples'] = {};
    for (const meta of FINGER_METAS) {
      const slot = slots[meta.id];
      if (slot.sourceType === 'custom') {
        const stored = await this.loadCustomSample(meta.id);
        if (stored) {
          customSamples[String(meta.id)] = {
            fileName: stored.fileName,
            mimeType: stored.mimeType,
            base64: arrayBufferToBase64(stored.data),
          };
        }
      }
    }

    const payload: ExportedPresetV1 = {
      version: 1,
      exportedAt: new Date().toISOString(),
      slots,
      customSamples,
    };
    return JSON.stringify(payload, null, 2);
  }

  async importPreset(jsonString: string): Promise<SlotData[]> {
    const parsed = JSON.parse(jsonString) as ExportedPresetV1;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.slots) || parsed.slots.length !== 10) {
      throw new Error('Geçersiz preset dosyası.');
    }

    for (const meta of FINGER_METAS) {
      const key = String(meta.id);
      const custom = parsed.customSamples?.[key];
      if (custom && custom.base64) {
        const buf = base64ToArrayBuffer(custom.base64);
        await this.saveCustomSample(meta.id, custom.fileName, custom.mimeType, buf);
      } else {
        await this.deleteCustomSample(meta.id);
      }
    }

    await this.saveSlotsMeta(parsed.slots);
    return parsed.slots;
  }
}
