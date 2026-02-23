import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AnalysisResult {
  suspicionScore: number;
  behaviors: string[];
  isPhoneDetected: boolean;
  isLookingAway: boolean;
  isFaceMissing: boolean;
  confidence: number;
}

export async function analyzeFrame(base64Image: string): Promise<AnalysisResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image.split(',')[1],
              },
            },
            {
              text: `Act as an AI Exam Proctor. Analyze this frame for cheating behavior. 
              Return a JSON object with:
              - suspicionScore: (0-100)
              - behaviors: array of strings (e.g., "Looking down", "Phone detected", "Normal")
              - isPhoneDetected: boolean
              - isLookingAway: boolean
              - isFaceMissing: boolean
              - confidence: number (0-1)
              
              Be strict but fair.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}") as AnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      suspicionScore: 0,
      behaviors: ["Analysis Error"],
      isPhoneDetected: false,
      isLookingAway: false,
      isFaceMissing: false,
      confidence: 0,
    };
  }
}
