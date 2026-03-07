import { analyzeImageStructured } from "./client.js";
import {
  imageClassificationJsonSchema,
  type ImageClassification,
} from "./schemas.js";
import { IMAGE_CLASSIFICATION_PROMPT } from "./prompts.js";

export async function classifyImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ImageClassification["type"]> {
  const result = await analyzeImageStructured<ImageClassification>(
    imageBuffer,
    mimeType,
    IMAGE_CLASSIFICATION_PROMPT,
    imageClassificationJsonSchema,
  );
  return result.type;
}
