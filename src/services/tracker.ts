export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

class KalmanFilter {
  private q: number; // process noise
  private r: number; // measurement noise
  private x: number; // state
  private p: number; // estimation error covariance
  private k: number; // kalman gain

  constructor(q: number = 0.05, r: number = 0.5, initialValue: number = 0) {
    this.q = q;
    this.r = r;
    this.x = initialValue;
    this.p = 1;
    this.k = 0;
  }

  predict(): number {
    // Prediction update
    this.p = this.p + this.q;
    return this.x;
  }

  update(measurement: number): number {
    // Measurement update
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;

    return this.x;
  }

  getState(): number {
    return this.x;
  }
}

export interface TrackedObject {
  id: string;
  bbox: BoundingBox;
  initialBbox: BoundingBox;
  class: string;
  score: number;
  age: number;
  timeSinceUpdate: number;
  history: BoundingBox[];
  kfX?: KalmanFilter;
  kfY?: KalmanFilter;
  kfW?: KalmanFilter;
  kfH?: KalmanFilter;
}

export class Tracker {
  private tracks: TrackedObject[] = [];
  private nextId: number = 1;
  private maxAge: number = 15; // frames to keep track alive without detection
  private iouThreshold: number = 0.2; // Lowered to handle faster movements

  private calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    if (interArea === 0) return 0;

    const boxAArea = boxA.width * boxA.height;
    const boxBArea = boxB.width * boxB.height;

    return interArea / (boxAArea + boxBArea - interArea);
  }

  public update(detections: { bbox: BoundingBox; class: string; score: number }[]): TrackedObject[] {
    // Predict next state for all tracks
    this.tracks.forEach(track => {
      track.timeSinceUpdate++;
      if (track.kfX && track.kfY && track.kfW && track.kfH) {
        track.bbox.x = track.kfX.predict();
        track.bbox.y = track.kfY.predict();
        track.bbox.width = track.kfW.predict();
        track.bbox.height = track.kfH.predict();
      }
    });

    const matchedDetections = new Set<number>();
    const matchedTracks = new Set<number>();

    // Greedy matching based on IoU
    for (let d = 0; d < detections.length; d++) {
      let bestIoU = 0;
      let bestTrackIdx = -1;

      for (let t = 0; t < this.tracks.length; t++) {
        if (matchedTracks.has(t)) continue;
        if (this.tracks[t].class !== detections[d].class) continue;

        const iou = this.calculateIoU(detections[d].bbox, this.tracks[t].bbox);
        if (iou > bestIoU) {
          bestIoU = iou;
          bestTrackIdx = t;
        }
      }

      if (bestIoU > this.iouThreshold && bestTrackIdx !== -1) {
        // Update track with Kalman Filter
        const track = this.tracks[bestTrackIdx];
        const detBbox = detections[d].bbox;
        
        if (!track.kfX) track.kfX = new KalmanFilter(0.05, 0.5, track.bbox.x);
        if (!track.kfY) track.kfY = new KalmanFilter(0.05, 0.5, track.bbox.y);
        if (!track.kfW) track.kfW = new KalmanFilter(0.05, 0.5, track.bbox.width);
        if (!track.kfH) track.kfH = new KalmanFilter(0.05, 0.5, track.bbox.height);

        const smoothedX = track.kfX.update(detBbox.x);
        const smoothedY = track.kfY.update(detBbox.y);
        const smoothedW = track.kfW.update(detBbox.width);
        const smoothedH = track.kfH.update(detBbox.height);

        track.bbox = { x: smoothedX, y: smoothedY, width: smoothedW, height: smoothedH };
        track.score = detections[d].score;
        track.timeSinceUpdate = 0;
        track.age++;
        track.history.push({ ...track.bbox });
        if (track.history.length > 30) {
          track.history.shift();
        }
        matchedDetections.add(d);
        matchedTracks.add(bestTrackIdx);
      }
    }

    // Create new tracks for unmatched detections
    for (let d = 0; d < detections.length; d++) {
      if (!matchedDetections.has(d)) {
        const bbox = detections[d].bbox;
        this.tracks.push({
          id: `Student ${this.nextId++}`,
          bbox: { ...bbox },
          initialBbox: { ...bbox },
          class: detections[d].class,
          score: detections[d].score,
          age: 1,
          timeSinceUpdate: 0,
          history: [{ ...bbox }],
          kfX: new KalmanFilter(0.05, 0.5, bbox.x),
          kfY: new KalmanFilter(0.05, 0.5, bbox.y),
          kfW: new KalmanFilter(0.05, 0.5, bbox.width),
          kfH: new KalmanFilter(0.05, 0.5, bbox.height)
        });
      }
    }

    // Remove dead tracks
    this.tracks = this.tracks.filter(t => t.timeSinceUpdate <= this.maxAge);

    // Return active tracks (recently updated or slightly stale)
    return this.tracks.filter(t => t.timeSinceUpdate <= 3 && t.age >= 2);
  }
}
