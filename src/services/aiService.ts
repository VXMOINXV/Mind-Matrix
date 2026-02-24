import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import { Tracker, TrackedObject } from './tracker';
import { SuspicionEngine, StudentState } from './suspicionEngine';

export class AIService {
  private objectModel: cocoSsd.ObjectDetection | null = null;
  private faceModel: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private handModel: handPoseDetection.HandDetector | null = null;
  private tracker: Tracker;
  private suspicionEngine: SuspicionEngine;
  private isInitializing = false;

  constructor() {
    this.tracker = new Tracker();
    this.suspicionEngine = new SuspicionEngine();
  }

  public async initialize() {
    if (this.objectModel || this.isInitializing) return;
    this.isInitializing = true;
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      
      console.log('Loading AI Models...');
      
      // Load COCO-SSD (Required)
      this.objectModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      
      // Load Face Landmarks (Optional)
      try {
        const faceModel = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
        const faceDetectorConfig: any = {
          runtime: 'tfjs',
          refineLandmarks: true,
          maxFaces: 10,
        };
        this.faceModel = await faceLandmarksDetection.createDetector(faceModel, faceDetectorConfig);
      } catch (e) {
        console.warn('Failed to load FaceMesh model, continuing without face tracking:', e);
      }

      // Load Hand Pose (Optional)
      try {
        const handModel = handPoseDetection.SupportedModels.MediaPipeHands;
        const handDetectorConfig: any = {
          runtime: 'tfjs',
          modelType: 'lite',
          maxHands: 20,
        };
        this.handModel = await handPoseDetection.createDetector(handModel, handDetectorConfig);
      } catch (e) {
        console.warn('Failed to load HandPose model, continuing without hand tracking:', e);
      }

      console.log('AI Models loaded successfully');
    } catch (error) {
      console.error('Failed to load core AI models:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  public async processFrame(videoElement: HTMLVideoElement): Promise<{
    students: StudentState[];
    rawDetections: cocoSsd.DetectedObject[];
  }> {
    if (!this.objectModel) {
      return { students: [], rawDetections: [] };
    }

    try {
      // Run models sequentially to avoid WebGL OOM
      let predictions: cocoSsd.DetectedObject[] = [];
      let faces: faceLandmarksDetection.Face[] = [];
      let hands: handPoseDetection.Hand[] = [];

      try {
        predictions = await this.objectModel.detect(videoElement);
      } catch (e) {
        console.error('COCO-SSD error:', e);
      }

      if (this.faceModel) {
        try {
          faces = await this.faceModel.estimateFaces(videoElement, { flipHorizontal: false });
        } catch (e) {
          console.error('FaceMesh error:', e);
        }
      }

      if (this.handModel) {
        try {
          hands = await this.handModel.estimateHands(videoElement, { flipHorizontal: false });
        } catch (e) {
          console.error('HandPose error:', e);
        }
      }
      
      const personDetections = predictions
        .filter(p => p.class === 'person' && p.score > 0.3) // Lowered threshold for testing
        .map(p => ({
          bbox: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
          class: p.class,
          score: p.score
        }));

      const otherObjects = predictions
        .filter(p => p.class !== 'person' && p.score > 0.4)
        .map(p => ({
          bbox: { x: p.bbox[0], y: p.bbox[1], width: p.bbox[2], height: p.bbox[3] },
          class: p.class,
          score: p.score
        }));

      // Update tracker with persons
      const trackedPersons = this.tracker.update(personDetections);

      // Analyze behaviors
      const now = Date.now();
      const students = this.suspicionEngine.analyze(trackedPersons, otherObjects, faces, hands, now);

      return { students, rawDetections: predictions };
    } catch (error) {
      console.error('Error processing frame:', error);
      return { students: [], rawDetections: [] };
    }
  }
}

export const aiService = new AIService();
