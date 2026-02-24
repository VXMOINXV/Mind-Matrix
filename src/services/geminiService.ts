import { GoogleGenAI } from "@google/genai";

export interface StudentAnalysis {
  id: string;
  name: string; // Simulated name
  suspicionScore: number;
  behaviors: string[];
  isPhoneDetected: boolean;
  isLookingAway: boolean;
  isFaceMissing: boolean;
  isPassingObject: boolean; // New feature
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number }; // For UI overlay
}

export interface FrameAnalysisResult {
  students: StudentAnalysis[];
  sceneAlerts: string[];
}

// Simulated names for demo
const DEMO_NAMES = ["Student 1", "Student 2", "Student 3", "Student 4"];

// Local simulated analysis (No API required)
export async function analyzeFrame(base64Image: string): Promise<FrameAnalysisResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate 1-3 students in the frame
      const studentCount = 1 + Math.floor(Math.random() * 0.5); // Mostly 1, sometimes 2 for demo
      const students: StudentAnalysis[] = [];
      const sceneAlerts: string[] = [];

      for (let i = 0; i < studentCount; i++) {
        const randomValue = Math.random();
        let suspicionScore = 10;
        let behaviors = ["Normal"];
        let isPhoneDetected = false;
        let isLookingAway = false;
        let isFaceMissing = false;
        let isPassingObject = false;

        // Simulate behaviors with higher probabilities for demo purposes
        if (randomValue > 0.85) { // 15% chance
          suspicionScore = 85;
          behaviors = ["Object passing detected", "Suspicious hand movement"];
          isPassingObject = true;
          sceneAlerts.push(`Object passing detected between Student ${i+1} and peer`);
        } else if (randomValue > 0.70) { // 15% chance
          suspicionScore = 75;
          behaviors = ["Phone detected", "Looking down"];
          isPhoneDetected = true;
        } else if (randomValue > 0.50) { // 20% chance
          suspicionScore = 45;
          behaviors = ["Looking away"];
          isLookingAway = true;
        } else if (randomValue > 0.95) { // 5% chance
          suspicionScore = 60;
          behaviors = ["Face missing"];
          isFaceMissing = true;
        }

        students.push({
          id: `STU-${100 + i}`,
          name: DEMO_NAMES[i] || `Student ${i + 1}`,
          suspicionScore,
          behaviors,
          isPhoneDetected,
          isLookingAway,
          isFaceMissing,
          isPassingObject,
          confidence: 0.85 + (Math.random() * 0.1),
          boundingBox: {
            x: 10 + (i * 40), // Offset for multiple students
            y: 20,
            width: 30,
            height: 40
          }
        });
      }

      resolve({
        students,
        sceneAlerts
      });
    }, 200); // Reduce processing delay to 200ms
  });
}

export async function generateProctorReport(logs: any[]): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return "Gemini API key not found. Please add GEMINI_API_KEY to your environment variables to enable AI reporting.";
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const logsText = logs.slice(0, 20).map(l => 
      `[${l.timestamp}] Student: ${l.student_id}, Alert: ${l.type}, Severity: ${l.severity}, Details: ${l.message}`
    ).join('\n');

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: `Act as an expert AI Exam Proctor. Analyze the following recent exam logs and provide a brief, professional summary report of the session's integrity. Highlight any major concerns.
      
      Logs:
      ${logsText}
      
      Format the response in short markdown.`
    });

    return response.text || "Failed to generate report.";
  } catch (error) {
    console.error("Gemini Report Error:", error);
    return "An error occurred while generating the AI report.";
  }
}


