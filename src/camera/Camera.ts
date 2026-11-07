export type VideoFrameHandler = (nowMs: number, video: HTMLVideoElement, frameMs: number) => void;

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp, metadata: unknown) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class Camera {
  private video: VideoWithRVFC;
  private stream: MediaStream | null = null;
  private running = false;
  private rvfcHandle: number | null = null;
  private rafHandle: number | null = null;
  private lastVideoTime = -1;

  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement as VideoWithRVFC;
  }

  async start(width = 640, height = 480): Promise<void> {
    if (this.running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('TarayÄ±cÄ± kamera eriÅŸimini desteklemiyor (HTTPS veya localhost gerekli).');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 60 },
        facingMode: 'user',
      },
    });

    this.video.srcObject = this.stream;
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        this.video.removeEventListener('loadedmetadata', onLoaded);
        this.video
          .play()
          .then(() => resolve())
          .catch(reject);
      };
      this.video.addEventListener('loadedmetadata', onLoaded);
    });

    this.running = true;
  }

  stop(): void {
    this.running = false;
    if (this.rvfcHandle !== null && this.video.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = null;
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  getVideoElement(): HTMLVideoElement {
    return this.video;
  }

  startFrameLoop(onFrame: VideoFrameHandler): void {
    if (this.video.requestVideoFrameCallback) {
      let lastFrameMs = -1;
      const tick = (now: DOMHighResTimeStamp, metadata: unknown) => {
        if (!this.running) return;
        try {
          if (this.video.readyState >= 2) {
            // Real capture time of the frame (less jitter than callback time)
            const media = (metadata as { mediaTime?: number } | undefined)?.mediaTime;
            let frameMs = typeof media === 'number' && media > 0 ? media * 1000 : now;
            if (frameMs <= lastFrameMs) frameMs = lastFrameMs + 1;
            lastFrameMs = frameMs;
            onFrame(now, this.video, frameMs);
          }
        } catch (err) {
          console.error('Kamera kare işleme hatası:', err);
        } finally {
          if (this.running) {
            this.rvfcHandle = this.video.requestVideoFrameCallback!(tick);
          }
        }
      };
      this.rvfcHandle = this.video.requestVideoFrameCallback(tick);
    } else {
      const tick = (now: DOMHighResTimeStamp) => {
        if (!this.running) return;
        try {
          if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;
            onFrame(now, this.video, now);
          }
        } catch (err) {
          console.error('Kamera kare işleme hatası (RAF):', err);
        } finally {
          if (this.running) {
            this.rafHandle = requestAnimationFrame(tick);
          }
        }
      };
      this.rafHandle = requestAnimationFrame(tick);
    }
  }
}
