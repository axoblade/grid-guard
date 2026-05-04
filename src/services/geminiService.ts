import { GoogleGenAI, Type } from "@google/genai";
import { Transformer } from "../types";

export const geminiService = {
  async analyzeRisk(transformer: Transformer, history: any[]): Promise<{ rating: number; analysis: string; maintenanceAdvice: string; realTimeHint: string }> {
    const apiKey = (process.env.GEMINI_API_KEY as string);
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      Analyze the risk profile for the following electrical transformer:
      Name: ${transformer.name}
      Current Location: ${transformer.currentLocation.latitude}, ${transformer.currentLocation.longitude}
      Registration Location: ${transformer.registrationLocation.latitude}, ${transformer.registrationLocation.longitude}
      Safe Radius: ${transformer.safeRadius}m
      Status: ${transformer.status}
      SIM Swap Recent: ${transformer.simSwapHistory.isFraudPotential}
      Historical Data: ${JSON.stringify(history)}

      Rate the risk from 0-100 and provide:
      1. A detailed analysis of the threat
      2. Preventive maintenance or recovery advice
      3. A single, short, high-impact "realTimeHint" (max 15 words) for an operator viewing the dashboard right now.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rating: { type: Type.NUMBER },
            analysis: { type: Type.STRING },
            maintenanceAdvice: { type: Type.STRING },
            realTimeHint: { type: Type.STRING },
          },
          required: ["rating", "analysis", "maintenanceAdvice", "realTimeHint"],
        },
      },
    });

    return JSON.parse(response.text);
  }
};
