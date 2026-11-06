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
  private initPromise: Promise<void> | null = null;
  private lastTimestampMs = -1;

  async init(): Promise<void> {
    if (this.landmarker) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
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

  detect(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult | null {
    if (!this.landmarker) return null;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    const safeTimestamp = timestampMs > this.lastTimestampMs ? timestampMs : this.lastTimestampMs + 1;
    this.lastTimestampMs = safeTimestamp;
    return this.landmarker.detectForVideo(video, safeTimestamp);
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.initPromise = null;
  }
}
