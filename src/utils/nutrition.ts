interface NutritionInput {
  weight_kg: number;
  height_cm: number;
  age: number;
  sex: "male" | "female";
  activity_level: string;
  goal: "bulk" | "cut" | "maintain";
}

interface NutritionTargets {
  calorie_target: number;
  protein_target: number;
  fat_target: number;
  carb_target: number;
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateTargets(input: NutritionInput): NutritionTargets {
  // Mifflin-St Jeor formula for BMR
  let bmr: number;
  if (input.sex === "male") {
    bmr = 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age + 5;
  } else {
    bmr = 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age - 161;
  }

  const multiplier = ACTIVITY_MULTIPLIERS[input.activity_level] ?? 1.55;
  const tdee = Math.round(bmr * multiplier);

  let calorie_target: number;
  let proteinPerKg: number;

  switch (input.goal) {
    case "bulk":
      calorie_target = tdee + 400;
      proteinPerKg = 1.8;
      break;
    case "cut": {
      const floor = input.sex === "male" ? 1500 : 1200;
      calorie_target = Math.max(tdee - 500, floor);
      proteinPerKg = 2.2;
      break;
    }
    case "maintain":
    default:
      calorie_target = tdee;
      proteinPerKg = 1.8;
      break;
  }

  const protein_target = Math.round(input.weight_kg * proteinPerKg);
  const proteinCals = protein_target * 4;

  const fatCals = Math.round((calorie_target - proteinCals) * 0.25);
  const fat_target = Math.round(fatCals / 9);

  const remainingCals = calorie_target - proteinCals - fatCals;
  const carb_target = Math.round(remainingCals / 4);

  return { calorie_target, protein_target, fat_target, carb_target };
}
