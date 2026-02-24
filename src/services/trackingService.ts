import { Face } from '@tensorflow-models/face-detection';
import { DetectedObject } from '@tensorflow-models/coco-ssd';

export interface StudentState {
  id: string;
  name: string;
  box: { xMin: number; yMin: number; width: number; height: number };
  score: number;
  status: 'Normal' | 'Suspicious' | 'Cheating';
  
  // Timers and counters
  phoneDetectedFrames: number;
  lookingAwayFrames: number;
  movementFrames: number;
  lastSeen: number;
  
  // Active alerts
  alerts: string[];
}

const TRACKING_THRESHOLD = 0.5; // IoU threshold for tracking
const MAX_MISSING_FRAMES = 10; // Frames before dropping a student

let students: StudentState[] = [];
let nextStudentId = 1;

function calculateIoU(box1: any, box2: any) {
  const xA = Math.max(box1.xMin, box2.xMin);
  const yA = Math.max(box1.yMin, box2.yMin);
  const xB = Math.min(box1.xMin + box1.width, box2.xMin + box2.width);
  const yB = Math.min(box1.yMin + box1.height, box2.yMin + box2.height);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;

  return interArea / (box1Area + box2Area - interArea);
}

export function updateTracking(faces: Face[], objects: DetectedObject[], timestamp: number): StudentState[] {
  const currentFaces = faces.map(f => ({
    box: {
      xMin: f.box.xMin,
      yMin: f.box.yMin,
      width: f.box.width,
      height: f.box.height
    },
    keypoints: f.keypoints
  }));

  // Match existing students
  const matchedIndices = new Set<number>();
  
  for (const student of students) {
    let bestMatchIdx = -1;
    let bestIoU = 0;

    for (let i = 0; i < currentFaces.length; i++) {
      if (matchedIndices.has(i)) continue;
      
      const iou = calculateIoU(student.box, currentFaces[i].box);
      if (iou > bestIoU && iou > TRACKING_THRESHOLD) {
        bestIoU = iou;
        bestMatchIdx = i;
      }
    }

    if (bestMatchIdx !== -1) {
      // Update student
      student.box = currentFaces[bestMatchIdx].box;
      student.lastSeen = timestamp;
      matchedIndices.add(bestMatchIdx);
      
      // Analyze behavior
      analyzeBehavior(student, currentFaces[bestMatchIdx], objects);
    }
  }

  // Add new students
  for (let i = 0; i < currentFaces.length; i++) {
    if (!matchedIndices.has(i)) {
      const newStudent: StudentState = {
        id: `STU-${nextStudentId}`,
        name: `Student ${nextStudentId}`,
        box: currentFaces[i].box,
        score: 0,
        status: 'Normal',
        phoneDetectedFrames: 0,
        lookingAwayFrames: 0,
        movementFrames: 0,
        lastSeen: timestamp,
        alerts: []
      };
      students.push(newStudent);
      nextStudentId++;
      
      analyzeBehavior(newStudent, currentFaces[i], objects);
    }
  }

  // Remove stale students
  students = students.filter(s => timestamp - s.lastSeen < MAX_MISSING_FRAMES * 500);

  return [...students];
}

function analyzeBehavior(student: StudentState, face: any, objects: DetectedObject[]) {
  student.alerts = [];
  let frameScore = 0;

  // 1. Phone Detection (Check if a cell phone is near the student's face)
  const phones = objects.filter(o => o.class === 'cell phone' && o.score > 0.6);
  let hasPhone = false;
  for (const phone of phones) {
    const phoneBox = {
      xMin: phone.bbox[0],
      yMin: phone.bbox[1],
      width: phone.bbox[2],
      height: phone.bbox[3]
    };
    // Check if phone is close to face (expanded bounding box)
    const expandedFaceBox = {
      xMin: student.box.xMin - student.box.width,
      yMin: student.box.yMin - student.box.height,
      width: student.box.width * 3,
      height: student.box.height * 3
    };
    if (calculateIoU(expandedFaceBox, phoneBox) > 0) {
      hasPhone = true;
      break;
    }
  }

  if (hasPhone) {
    student.phoneDetectedFrames++;
    if (student.phoneDetectedFrames > 4) { // ~2 seconds at 500ms/frame
      frameScore += 50;
      student.alerts.push("Phone Detected");
    }
  } else {
    student.phoneDetectedFrames = Math.max(0, student.phoneDetectedFrames - 1);
  }

  // 2. Head Pose / Looking Away
  // Very basic heuristic: check if nose is centered between eyes
  const rightEye = face.keypoints.find((k: any) => k.name === 'rightEye');
  const leftEye = face.keypoints.find((k: any) => k.name === 'leftEye');
  const noseTip = face.keypoints.find((k: any) => k.name === 'noseTip');

  if (rightEye && leftEye && noseTip) {
    const eyeDist = Math.abs(rightEye.x - leftEye.x);
    const noseToLeft = Math.abs(noseTip.x - leftEye.x);
    const noseToRight = Math.abs(noseTip.x - rightEye.x);
    
    // If nose is significantly closer to one eye, head is turned
    if (noseToLeft < eyeDist * 0.2 || noseToRight < eyeDist * 0.2) {
      student.lookingAwayFrames++;
      if (student.lookingAwayFrames > 10) { // ~5 seconds
        frameScore += 10;
        student.alerts.push("Looking Away");
      }
    } else {
      student.lookingAwayFrames = Math.max(0, student.lookingAwayFrames - 1);
    }
  }

  // Update Score with decay
  if (frameScore > 0) {
    student.score = Math.min(100, student.score + frameScore);
  } else {
    student.score = Math.max(0, student.score - 2); // Decay score over time
  }

  // Determine Status
  if (student.score > 70) {
    student.status = 'Cheating';
  } else if (student.score > 30) {
    student.status = 'Suspicious';
  } else {
    student.status = 'Normal';
  }
}

export function resetTracking() {
  students = [];
  nextStudentId = 1;
}
