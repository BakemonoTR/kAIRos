import {
  FilesetResolver,
  HandLandmarker,
  HandLandmarkerResult,
} from '@mediapipe/tasks-vision';

const LOCAL_WASM_PATH = '/wasm';
const CDN_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

const LOCAL_MODEL_PATH = '/models/hand_landmarker.task';
const CDN_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private worker: Worker | null = null;
  private workerReady = false;
  private inFlight = false;
  private nextJobId = 1;
  private onResultCallback: ((result: HandLandmarkerResult | null, timestampMs: number) => void) | null = null;
  private initPromise: Promise<void> | null = null;
  private lastTimestampMs = -1;

  isWorkerActive(): boolean {
    return this.workerReady && this.worker !== null;
  }

  isBusy(): boolean {
    return this.inFlight;
  }

  private async initWorker(): Promise<boolean> {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      const timeout = setTimeout(() => {
        if (!settled) {
          this.worker?.terminate();
          this.worker = null;
          this.workerReady = false;
          finish(false);
        }
      }, 15000);

      try {
        const w = new Worker(new URL('./handTracker.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker = w;

        w.onmessage = (ev: MessageEvent) => {
          const msg = ev.data;
          if (!msg) return;
          if (msg.type === 'ready') {
            clearTimeout(timeout);
            this.workerReady = true;
            finish(true);
          } else if (msg.type === 'initError') {
            clearTimeout(timeout);
            w.terminate();
            this.worker = null;
            this.workerReady = false;
            finish(false);
          } else if (msg.type === 'result') {
            this.inFlight = false;
            if (this.onResultCallback) {
              this.onResultCallback(msg.result as HandLandmarkerResult | null, msg.timestampMs);
            }
          }
        };

        w.onerror = () => {
          clearTimeout(timeout);
          this.inFlight = false;
          w.terminate();
          this.worker = null;
          this.workerReady = false;
          finish(false);
        };

        w.postMessage({ type: 'init' });
      } catch {
        clearTimeout(timeout);
        this.worker = null;
        this.workerReady = false;
        finish(false);
      }
    });
  }

  async init(): Promise<void> {
    if (this.workerReady || this.landmarker) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const workerOk = await this.initWorker();
      if (workerOk) return;

      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);
      } catch {
        vision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
      }

      const createWithOptions = async (
        modelAssetPath: string,
        delegate: 'GPU' | 'CPU'
      ) => {
        return HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          // Low thresholds: the palm detector is much less confident when the BACK of the
          // hand faces the camera (piano pose) or fingers point toward the lens.
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
      };

      try {
        this.landmarker = await createWithOptions(LOCAL_MODEL_PATH, 'GPU');
      } catch {
        try {
          this.landmarker = await createWithOptions(CDN_MODEL_PATH, 'GPU');
        } catch {
          this.landmarker = await createWithOptions(CDN_MODEL_PATH, 'CPU');
        }
      }
    })();

    return this.initPromise;
  }

  detectAsync(
    video: HTMLVideoElement,
    timestampMs: number,
    onResult: (result: HandLandmarkerResult | null, timestampMs: number) => void
  ): boolean {
    if (!this.workerReady || !this.worker) return false;
    if (this.inFlight) return false;
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) return false;

    this.inFlight = true;
    this.onResultCallback = onResult;
    const jobId = this.nextJobId++;

    createImageBitmap(video)
      .then((bitmap) => {
        if (!this.worker || !this.workerReady) {
          bitmap.close();
          this.inFlight = false;
          return;
        }
        this.worker.postMessage(
          { type: 'detect', id: jobId, bitmap, timestampMs },
          [bitmap]
        );
      })
      .catch(() => {
        this.inFlight = false;
      });

    return true;
  }

  detect(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult | null {
    if (!this.landmarker) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    const safeTimestamp = timestampMs > this.lastTimestampMs ? timestampMs : this.lastTimestampMs + 1;
    this.lastTimestampMs = safeTimestamp;
    return this.landmarker.detectForVideo(video, safeTimestamp);
  }

  close(): void {
    this.inFlight = false;
    this.onResultCallback = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.workerReady = false;
    this.landmarker?.close();
    this.landmarker = null;
    this.initPromise = null;
  }
}
