import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export interface WorkerInitMessage {
  type: 'init';
}

export interface WorkerDetectMessage {
  type: 'detect';
  id: number;
  bitmap: ImageBitmap;
  timestampMs: number;
}

export type WorkerInMessage = WorkerInitMessage | WorkerDetectMessage;

let landmarker: HandLandmarker | null = null;
let lastTimestampMs = -1;

async function initLandmarker(): Promise<void> {
  if (landmarker) return;

  let vision: { wasmLoaderPath: string; wasmBinaryPath: string };
  let loaderBlobUrl: string | null = null;
  try {
    const resp = await fetch('/wasm/vision_wasm_module_internal.js');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const jsText = await resp.text();
    loaderBlobUrl = URL.createObjectURL(
      new Blob([jsText], { type: 'application/javascript' })
    );
    vision = {
      wasmLoaderPath: loaderBlobUrl,
      wasmBinaryPath: '/wasm/vision_wasm_module_internal.wasm',
    };
  } catch {
    vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    );
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
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    });
  };

  const localModel = '/models/hand_landmarker.task';
  const cdnModel =
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  try {
    landmarker = await createWithOptions(localModel, 'GPU');
  } catch {
    try {
      landmarker = await createWithOptions(localModel, 'CPU');
    } catch {
      try {
        landmarker = await createWithOptions(cdnModel, 'GPU');
      } catch {
        landmarker = await createWithOptions(cdnModel, 'CPU');
      }
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    try {
      await initLandmarker();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'initError',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === 'detect') {
    const { id, bitmap, timestampMs } = msg;
    try {
      if (!landmarker) {
        self.postMessage({ type: 'result', id, timestampMs, result: null });
        return;
      }
      const safeTimestamp =
        timestampMs > lastTimestampMs ? timestampMs : lastTimestampMs + 1;
      lastTimestampMs = safeTimestamp;

      const mpRes = landmarker.detectForVideo(bitmap, safeTimestamp);
      // Extract plain serializable arrays so structured clone is fast and lightweight
      const result = {
        landmarks: mpRes.landmarks ?? [],
        worldLandmarks: mpRes.worldLandmarks ?? [],
        handedness: mpRes.handedness ?? [],
        handednesses: mpRes.handednesses ?? [],
      };
      self.postMessage({ type: 'result', id, timestampMs, result });
    } catch (err) {
      self.postMessage({
        type: 'result',
        id,
        timestampMs,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      bitmap.close();
    }
  }
};

