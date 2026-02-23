export interface AnalysisResult {
  suspicionScore: number;
  behaviors: string[];
  isPhoneDetected: boolean;
  isLookingAway: boolean;
  isFaceMissing: boolean;
  confidence: number;
}

// Local simulated analysis (No API required)
export async function analyzeFrame(base64Image: string): Promise<AnalysisResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate analysis logic
      const randomValue = Math.random();
      let suspicionScore = 10;
      let behaviors = ["Normal"];
      let isPhoneDetected = false;
      let isLookingAway = false;
      let isFaceMissing = false;

      if (randomValue > 0.85) {
        suspicionScore = 75;
        behaviors = ["Phone detected", "Looking down"];
        isPhoneDetected = true;
      } else if (randomValue > 0.6) {
        suspicionScore = 45;
        behaviors = ["Looking away"];
        isLookingAway = true;
      } else if (randomValue > 0.95) {
        suspicionScore = 60;
        behaviors = ["Face missing"];
        isFaceMissing = true;
      }

      resolve({
        suspicionScore,
        behaviors,
        isPhoneDetected,
        isLookingAway,
        isFaceMissing,
        confidence: 0.85 + (Math.random() * 0.1), // 85% - 95% confidence
      });
    }, 500); // Simulate processing delay
  });
}

