import { MappedHandsResult, SlotData } from '../types';
import { Overlay } from '../ui/Overlay';

export interface RecordedVideoResult {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: 'mp4' | 'webm';
  durationSec: number;
}

const MIME_CANDIDATES: Array<{ mime: string; ext: 'mp4' | 'webm' }> = [
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
];

export class VideoRecorder {
  private recCanvas: HTMLCanvasElement;
  private recCtx: CanvasRenderingContext2D;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private recording = false;
  private startedAtMs = 0;
  private chosenExt: 'mp4' | 'webm' = 'webm';
  private chosenMime = 'video/webm';

  constructor() {
    this.recCanvas = document.createElement('canvas');
    const ctx = this.recCanvas.getContext('2d');
    if (!ctx) throw new Error('Kayıt canvas context oluşturulamadı.');
    this.recCtx = ctx;
  }

  isRecording(): boolean {
    return this.recording;
  }

  private pickSupportedMime(): { mime: string; ext: 'mp4' | 'webm' } {
    for (const item of MIME_CANDIDATES) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(item.mime)) {
        return item;
      }
    }
    return { mime: '', ext: 'webm' };
  }

  start(audioStream: MediaStream, resolution: '480p' | '720p'): void {
    if (this.recording) return;

    if (resolution === '720p') {
      this.recCanvas.width = 1280;
      this.recCanvas.height = 720;
    } else {
      this.recCanvas.width = 854;
      this.recCanvas.height = 480;
    }

    const canvasStream = this.recCanvas.captureStream(30);
    const combinedTracks: MediaStreamTrack[] = [
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ];
    const mixedStream = new MediaStream(combinedTracks);

    const picked = this.pickSupportedMime();
    this.chosenMime = picked.mime || 'video/webm';
    this.chosenExt = picked.ext;
    this.chunks = [];

    this.mediaRecorder = picked.mime
      ? new MediaRecorder(mixedStream, {
          mimeType: picked.mime,
          videoBitsPerSecond: resolution === '720p' ? 4_500_000 : 2_500_000,
        })
      : new MediaRecorder(mixedStream);

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.chunks.push(ev.data);
      }
    };

    this.startedAtMs = performance.now();
    this.recording = true;
    this.mediaRecorder.start(200);
  }

  renderFrame(
    video: HTMLVideoElement,
    overlay: Overlay,
    mapped: MappedHandsResult,
    slots: SlotData[],
    includeOverlay: boolean,
    nowMs: number
  ): void {
    if (!this.recording) return;

    const w = this.recCanvas.width;
    const h = this.recCanvas.height;
    const ctx = this.recCtx;

    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);

    const vp = overlay.computeContainViewport(w, h, video.videoWidth, video.videoHeight);

    // Draw mirrored webcam frame
    if (video.readyState >= 2 && video.videoWidth > 0) {
      ctx.save();
      ctx.translate(vp.offsetX + vp.drawWidth, vp.offsetY);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, vp.drawWidth, vp.drawHeight);
      ctx.restore();
    }

    // Optionally composite hand skeleton + colored dots + hit ripples
    if (includeOverlay) {
      overlay.drawSceneOnContext(ctx, vp, mapped, slots, nowMs);
    }
  }

  stop(): Promise<RecordedVideoResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.recording) {
        reject(new Error('Aktif kayıt yok.'));
        return;
      }

      const recorder = this.mediaRecorder;
      const durationSec = Math.max(0.1, (performance.now() - this.startedAtMs) / 1000);
      this.recording = false;

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || this.chosenMime || 'video/webm';
        const ext: 'mp4' | 'webm' = finalMime.includes('mp4') ? 'mp4' : this.chosenExt;
        const blob = new Blob(this.chunks, { type: finalMime });
        const url = URL.createObjectURL(blob);

        // Stop capture canvas video track cleanly (keep AudioEngine destination alive)
        recorder.stream.getVideoTracks().forEach((t) => t.stop());

        resolve({
          blob,
          url,
          mimeType: finalMime,
          extension: ext,
          durationSec,
        });
      };

      recorder.stop();
      this.mediaRecorder = null;
    });
  }
}
