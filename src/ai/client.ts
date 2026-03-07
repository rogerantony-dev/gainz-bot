import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const MODEL = "gemini-2.5-flash";

export async function generateText(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: systemInstruction ? { systemInstruction } : undefined,
  });
  return response.text ?? "";
}

export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBuffer.toString("base64"),
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: systemInstruction ? { systemInstruction } : undefined,
  });
  return response.text ?? "";
}

export async function analyzeImageStructured<T>(
  imageBuffer: Buffer,
  mimeType: string,
  prompt: string,
  jsonSchema: Record<string, unknown>,
  systemInstruction?: string,
): Promise<T> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBuffer.toString("base64"),
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: jsonSchema,
      ...(systemInstruction ? { systemInstruction } : {}),
    },
  });
  return JSON.parse(response.text ?? "{}") as T;
}

export async function analyzeMultipleImages(
  images: Array<{ buffer: Buffer; mimeType: string }>,
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  const parts = [
    ...images.map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.buffer.toString("base64"),
      },
    })),
    { text: prompt },
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: systemInstruction ? { systemInstruction } : undefined,
  });
  return response.text ?? "";
}

export async function generateStructured<T>(
  prompt: string,
  jsonSchema: Record<string, unknown>,
  systemInstruction?: string,
): Promise<T> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: jsonSchema,
      ...(systemInstruction ? { systemInstruction } : {}),
    },
  });
  return JSON.parse(response.text ?? "{}") as T;
}
