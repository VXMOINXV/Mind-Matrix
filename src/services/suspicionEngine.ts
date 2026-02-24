import { TrackedObject, BoundingBox } from './tracker';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

export interface StudentState {
  id: string;
  bbox: BoundingBox;
  deskZone: BoundingBox;
  suspicionScore: number;
  behaviors: string[];
  status: 'Normal' | 'Watch' | 'Suspicious' | 'Cheating Alert';
  lastPhoneDetection: number;
  lastMovementSpike: number;
  lastDeskViolation: number;
  lastInteraction: number;
  interactionTarget?: string;
  phoneHidingStartTime?: number;
  talkingStartTime?: number;
  isWriting?: boolean;
}

export class SuspicionEngine {
  private states: Map<string, StudentState> = new Map();

  private getStatus(score: number): StudentState['status'] {
    if (score >= 70) return 'Cheating Alert';
    if (score >= 40) return 'Suspicious';
    if (score >= 20) return 'Watch';
    return 'Normal';
  }

  private isOverlapping(boxA: BoundingBox, boxB: BoundingBox): boolean {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
    return Math.max(0, xB - xA) * Math.max(0, yB - yA) > 0;
  }

  private getOverlapArea(boxA: BoundingBox, boxB: BoundingBox): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
    return Math.max(0, xB - xA) * Math.max(0, yB - yA);
  }

  private isPointInBox(x: number, y: number, box: BoundingBox): boolean {
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  }

  public analyze(
    students: TrackedObject[],
    objects: { bbox: BoundingBox; class: string; score: number }[],
    faces: faceLandmarksDetection.Face[],
    hands: handPoseDetection.Hand[],
    now: number
  ): StudentState[] {
    const currentIds = new Set(students.map(s => s.id));

    // Clean up old students
    for (const id of this.states.keys()) {
      if (!currentIds.has(id)) {
        this.states.delete(id);
      }
    }

    students.forEach(student => {
      let state = this.states.get(student.id);
      if (!state) {
        // Initialize desk zone as slightly larger than initial bbox
        const deskZone = {
          x: student.initialBbox.x - 20,
          y: student.initialBbox.y - 20,
          width: student.initialBbox.width + 40,
          height: student.initialBbox.height + 40
        };
        
        state = {
          id: student.id,
          bbox: student.bbox,
          deskZone,
          suspicionScore: 0,
          behaviors: ['Normal'],
          status: 'Normal',
          lastPhoneDetection: 0,
          lastMovementSpike: 0,
          lastDeskViolation: 0,
          lastInteraction: 0
        };
        this.states.set(student.id, state);
      }

      state.bbox = student.bbox;
      const newBehaviors = new Set<string>();
      let scoreDelta = -0.5; // Natural decay

      // Find face for this student
      const studentFace = faces.find(f => {
        const box = f.box;
        return this.isOverlapping(student.bbox, { x: box.xMin, y: box.yMin, width: box.width, height: box.height });
      });

      // Find hands for this student
      const studentHands = hands.filter(h => {
        // Check if hand keypoints are within student bbox or desk zone
        if (h.keypoints.length === 0) return false;
        const wrist = h.keypoints[0];
        return this.isPointInBox(wrist.x, wrist.y, student.bbox) || this.isPointInBox(wrist.x, wrist.y, state!.deskZone);
      });

      // 1. Phone Hiding Detection (Score +50)
      const phones = objects.filter(o => ['cell phone', 'remote', 'clock'].includes(o.class) && o.score > 0.6);
      let phoneDetected = false;
      for (const phone of phones) {
        if (this.isOverlapping(student.bbox, phone.bbox) || this.isOverlapping(state.deskZone, phone.bbox)) {
          phoneDetected = true;
          break;
        }
      }

      let headPitchedDown = false;
      let mouthOpen = false;
      let headTurned: 'left' | 'right' | null = null;

      if (studentFace && studentFace.keypoints) {
        // Simple heuristic for head pitch down: nose is close to chin
        const nose = studentFace.keypoints.find(k => k.name === 'noseTip');
        const chin = studentFace.keypoints.find(k => k.name === 'silhouette' && k.y > studentFace.box.yMin + studentFace.box.height * 0.8);
        if (nose && chin && (chin.y - nose.y) < studentFace.box.height * 0.2) {
          headPitchedDown = true;
        }

        // Simple heuristic for mouth open: distance between upper and lower lip
        const upperLip = studentFace.keypoints.find(k => k.name === 'lipsUpperInner');
        const lowerLip = studentFace.keypoints.find(k => k.name === 'lipsLowerInner');
        if (upperLip && lowerLip && (lowerLip.y - upperLip.y) > studentFace.box.height * 0.05) {
          mouthOpen = true;
        }

        // Head turn detection
        const leftEar = studentFace.keypoints.find(k => k.name === 'leftEar');
        const rightEar = studentFace.keypoints.find(k => k.name === 'rightEar');
        if (nose && leftEar && rightEar) {
          const distLeft = nose.x - leftEar.x;
          const distRight = rightEar.x - nose.x;
          if (distLeft > distRight * 2) {
            headTurned = 'right'; // Looking right (from camera perspective)
          } else if (distRight > distLeft * 2) {
            headTurned = 'left'; // Looking left
          }
        }
      }

      let handsBelowDesk = false;
      let isWriting = false;
      if (studentHands.length > 0) {
        // Check if hands are in the lower part of the bounding box
        handsBelowDesk = studentHands.some(h => {
          const wrist = h.keypoints[0];
          return wrist.y > student.bbox.y + student.bbox.height * 0.7;
        });
        
        // If hands are on desk and head is pitched down, likely writing
        if (!handsBelowDesk && headPitchedDown) {
          isWriting = true;
        }
      }
      state.isWriting = isWriting;

      if (phoneDetected || (headPitchedDown && handsBelowDesk)) {
        if (!state.phoneHidingStartTime) {
          state.phoneHidingStartTime = now;
        } else if (now - state.phoneHidingStartTime > 3000) { // Persists for 3 seconds
          if (now - state.lastPhoneDetection > 3000) {
            scoreDelta += 50; // High penalty for phone
            state.lastPhoneDetection = now;
          }
          newBehaviors.add('Possible Phone Use');
        }
      } else {
        state.phoneHidingStartTime = undefined;
      }

      // 2. Whisper / Talk Detection (Score +25)
      if (mouthOpen) {
        if (!state.talkingStartTime) {
          state.talkingStartTime = now;
        } else if (now - state.talkingStartTime > 3000) { // Continuous talking > 3 seconds
          scoreDelta += 25;
          newBehaviors.add('Whispering / Talking');
          state.talkingStartTime = now; // Reset to avoid spamming
        }
      } else {
        state.talkingStartTime = undefined;
      }

      // 3. Desk Boundary Violation (Score +20)
      const overlapWithDesk = this.getOverlapArea(student.bbox, state.deskZone);
      const studentArea = student.bbox.width * student.bbox.height;
      if (overlapWithDesk / studentArea < 0.5) { // Less than 50% of body is in desk zone
        if (now - state.lastDeskViolation > 5000) {
          scoreDelta += 20;
          state.lastDeskViolation = now;
        }
        newBehaviors.add('Desk boundary violation');
      }

      // 4. Interaction / Looking at neighbor (Score +25 for Whispering/Interaction)
      let interactingWith = null;
      let copyingFrom = null;

      for (const other of students) {
        if (other.id !== student.id) {
          const otherState = this.states.get(other.id);
          if (otherState) {
            // Check for physical overlap
            if (this.isOverlapping(student.bbox, otherState.deskZone)) {
              interactingWith = other.id;
            }

            // Check for copying (looking left/right at someone who is writing)
            if (headTurned === 'left' && otherState.bbox.x < student.bbox.x) {
              if (otherState.isWriting) copyingFrom = other.id;
              interactingWith = other.id;
            } else if (headTurned === 'right' && otherState.bbox.x > student.bbox.x) {
              if (otherState.isWriting) copyingFrom = other.id;
              interactingWith = other.id;
            }
          }
        }
      }

      if (copyingFrom) {
        scoreDelta += 2; // Increase slowly
        newBehaviors.add(`Possible Answer Copying → ${copyingFrom}`);
        state.interactionTarget = copyingFrom;
      } else if (interactingWith) {
        if (now - state.lastInteraction > 4000) {
          scoreDelta += 25; // Whispering / Interaction
          state.lastInteraction = now;
          state.interactionTarget = interactingWith;
        }
        newBehaviors.add(`Suspicious Interaction → ${interactingWith}`);
      } else {
        state.interactionTarget = undefined;
      }

      // 5. Object Passing (Score +40)
      const passables = objects.filter(o => ['book', 'cup', 'bottle', 'paper'].includes(o.class));
      let objectPassing = false;
      for (const obj of passables) {
        if (this.isOverlapping(obj.bbox, state.deskZone)) {
          for (const other of students) {
            if (other.id !== student.id) {
              const otherState = this.states.get(other.id);
              if (otherState && this.isOverlapping(obj.bbox, otherState.deskZone)) {
                objectPassing = true;
                break;
              }
            }
          }
        }
      }

      if (objectPassing) {
        scoreDelta += 40;
        newBehaviors.add('Object passing attempt');
      }

      // 6. Movement Analysis
      if (student.history.length >= 10) {
        const oldBox = student.history[student.history.length - 10];
        const dx = Math.abs(oldBox.x - student.bbox.x);
        const dy = Math.abs(oldBox.y - student.bbox.y);
        if (dx > 50 || dy > 50) {
          if (now - state.lastMovementSpike > 3000) {
            scoreDelta += 5;
            state.lastMovementSpike = now;
          }
          newBehaviors.add('Excessive movement');
        }
      }

      // Update Score
      state.suspicionScore = Math.max(0, Math.min(100, state.suspicionScore + scoreDelta));
      
      if (newBehaviors.size === 0) {
        state.behaviors = ['Normal'];
      } else {
        state.behaviors = Array.from(newBehaviors);
      }

      state.status = this.getStatus(state.suspicionScore);
    });

    return Array.from(this.states.values());
  }
}
