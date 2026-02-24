import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let faceDetector: faceDetection.FaceDetector | null = null;
let objectDetector: cocoSsd.ObjectDetection | null = null;

export async function initModels() {
  await tf.ready();
  
  if (!faceDetector) {
    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    const detectorConfig: faceDetection.MediaPipeFaceDetectorTfjsModelConfig = {
      runtime: 'tfjs',
      maxFaces: 10,
    };
    faceDetector = await faceDetection.createDetector(model, detectorConfig);
  }

  if (!objectDetector) {
    objectDetector = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  }
}

export interface DetectionResult {
  faces: faceDetection.Face[];
  objects: cocoSsd.DetectedObject[];
}

export async function detect(video: HTMLVideoElement): Promise<DetectionResult> {
  if (!faceDetector || !objectDetector) {
    throw new Error("Models not initialized");
  }

  const [faces, objects] = await Promise.all([
    faceDetector.estimateFaces(video, { flipHorizontal: false }),
    objectDetector.detect(video)
  ]);

  return { faces, objects };
}
