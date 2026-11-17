// Pure calculation helpers. No React here, so they can be tested with plain Node.

export const LB_PER_KG = 2.20462;
export const CM_PER_IN = 2.54;

export function feetInchesToCm(feet, inches) {
  return (Number(feet) * 12 + Number(inches || 0)) * CM_PER_IN;
}

export function lbToKg(lb) {
  return Number(lb) / LB_PER_KG;
}

// BMI = weight (kg) / height (m)^2
export function bmi(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!(w > 0) || !(h > 0)) return null;
  return w / (h * h);
}

// WHO adult categories
export function bmiCategory(value) {
  if (value == null) return null;
  if (value < 18.5) return { label: 'Underweight', color: '#3b82f6' };
  if (value < 25) return { label: 'Normal weight', color: '#16a34a' };
  if (value < 30) return { label: 'Overweight', color: '#f59e0b' };
  return { label: 'Obese', color: '#dc2626' };
}

// Weight range (kg) that gives a normal BMI (18.5 – 24.9) for this height
export function healthyWeightRange(heightCm) {
  const h = Number(heightCm) / 100;
  if (!(h > 0)) return null;
  return { min: 18.5 * h * h, max: 24.9 * h * h };
}

export const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise', factor: 1.2 },
  { key: 'light', label: 'Light', hint: 'Exercise 1–3 days/week', factor: 1.375 },
  { key: 'moderate', label: 'Moderate', hint: 'Exercise 3–5 days/week', factor: 1.55 },
  { key: 'active', label: 'Active', hint: 'Exercise 6–7 days/week', factor: 1.725 },
  { key: 'very', label: 'Very active', hint: 'Hard exercise or physical job', factor: 1.9 },
];

// Mifflin-St Jeor: 10w + 6.25h - 5a + 5 (male) / -161 (female)
export function bmrMifflin({ sex, age, heightCm, weightKg }) {
  const a = Number(age);
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!(a > 0) || !(h > 0) || !(w > 0)) return null;
  return 10 * w + 6.25 * h - 5 * a + (sex === 'female' ? -161 : 5);
}

export function tdee(bmr, activityKey) {
  const level = ACTIVITY_LEVELS.find((l) => l.key === activityKey);
  if (bmr == null || !level) return null;
  return bmr * level.factor;
}

// 500 kcal/day ≈ 0.5 kg per week. Never suggest going below a safe floor.
export function calorieTargets(tdeeValue, sex) {
  if (tdeeValue == null) return null;
  const floor = sex === 'female' ? 1200 : 1500;
  return {
    loseFast: Math.max(floor, Math.round(tdeeValue - 1000)), // ~1 kg/week
    lose: Math.max(floor, Math.round(tdeeValue - 500)), // ~0.5 kg/week
    maintain: Math.round(tdeeValue),
    gain: Math.round(tdeeValue + 500), // ~0.5 kg/week
    floor,
  };
}

// Rough step-derived numbers, based on height and weight when known.
export function stepStats(steps, heightCm, weightKg) {
  const h = Number(heightCm) > 0 ? Number(heightCm) : 170;
  const w = Number(weightKg) > 0 ? Number(weightKg) : 70;
  const strideM = (h * 0.415) / 100;
  const km = (steps * strideM) / 1000;
  const kcal = km * w * 0.75; // ~0.75 kcal per kg per km walked
  return { km, kcal };
}

// Local date as YYYY-MM-DD (not UTC, so the day flips at local midnight)
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function lastNDays(n, from = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}
