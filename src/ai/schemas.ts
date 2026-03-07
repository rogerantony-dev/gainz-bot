import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const ImageClassificationSchema = z.object({
  type: z
    .enum(["food", "workout", "physique", "unknown"])
    .describe("What type of image this is"),
});

export const FoodAnalysisSchema = z.object({
  meal_name: z
    .string()
    .describe("Short name for this meal, e.g. 'chicken rice'"),
  calories: z.number().describe("Estimated total calories"),
  protein: z.number().describe("Grams of protein"),
  fat: z.number().describe("Grams of fat"),
  carbs: z.number().describe("Grams of carbohydrates"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How confident in the estimate"),
  items: z.array(z.string()).describe("Individual food items identified"),
});

export const WorkoutExtractionSchema = z.object({
  workout_name: z
    .string()
    .describe("Name/type of workout, e.g. 'Push Day', 'Leg Day'"),
  exercises: z.array(
    z.object({
      name: z.string(),
      sets: z.array(
        z.object({
          reps: z.number(),
          weight_kg: z.number(),
        }),
      ),
    }),
  ),
  total_sets: z.number(),
  duration_minutes: z.number().nullable(),
});

export const StatsUpdateSchema = z.object({
  field: z.enum(["weight_kg", "height_cm", "age", "activity_level", "goal"]),
  value: z.union([z.number(), z.string()]),
});

export const ManualMealSchema = z.object({
  description: z.string().describe("Name/description of the meal"),
  calories: z.number().describe("Calories"),
  protein: z.number().nullable().describe("Grams of protein, null if not specified"),
  fat: z.number().nullable().describe("Grams of fat, null if not specified"),
  carbs: z.number().nullable().describe("Grams of carbs, null if not specified"),
});

// Convert to JSON schemas for Gemini
export const imageClassificationJsonSchema = zodToJsonSchema(
  ImageClassificationSchema,
);
export const foodAnalysisJsonSchema = zodToJsonSchema(FoodAnalysisSchema);
export const workoutExtractionJsonSchema = zodToJsonSchema(
  WorkoutExtractionSchema,
);
export const statsUpdateJsonSchema = zodToJsonSchema(StatsUpdateSchema);
export const manualMealJsonSchema = zodToJsonSchema(ManualMealSchema);

// Inferred types
export type ImageClassification = z.infer<typeof ImageClassificationSchema>;
export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;
export type WorkoutExtraction = z.infer<typeof WorkoutExtractionSchema>;
export type StatsUpdate = z.infer<typeof StatsUpdateSchema>;
export type ManualMeal = z.infer<typeof ManualMealSchema>;
