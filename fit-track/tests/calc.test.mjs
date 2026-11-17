import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/calc.js';

const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('BMI and categories', () => {
  near(c.bmi(70, 175), 22.86, 0.01);
  assert.equal(c.bmiCategory(c.bmi(70, 175)).label, 'Normal weight');
  assert.equal(c.bmiCategory(18.4).label, 'Underweight');
  assert.equal(c.bmiCategory(25).label, 'Overweight');
  assert.equal(c.bmiCategory(30).label, 'Obese');
  assert.equal(c.bmi('', 170), null);
  assert.equal(c.bmi(70, 0), null);
});
test('imperial conversion', () => {
  near(c.feetInchesToCm(5, 9), 175.26, 0.01);
  near(c.lbToKg(154), 69.85, 0.01);
});
test('Mifflin-St Jeor', () => {
  // male 25y 175cm 70kg: 700 + 1093.75 - 125 + 5 = 1673.75
  near(c.bmrMifflin({ sex: 'male', age: 25, heightCm: 175, weightKg: 70 }), 1673.75, 0.001);
  // female 30y 160cm 60kg: 600 + 1000 - 150 - 161 = 1289
  near(c.bmrMifflin({ sex: 'female', age: 30, heightCm: 160, weightKg: 60 }), 1289, 0.001);
  near(c.tdee(1673.75, 'moderate'), 2594.3125, 0.001);
  const t = c.calorieTargets(2594.3125, 'male');
  assert.deepEqual([t.loseFast, t.lose, t.maintain, t.gain], [1594, 2094, 2594, 3094]);
  assert.equal(c.calorieTargets(1546.8, 'female').loseFast, 1200); // floor applied
});
test('dates', () => {
  assert.equal(c.dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.deepEqual(c.lastNDays(3, new Date(2026, 2, 1)), ['2026-02-27', '2026-02-28', '2026-03-01']);
});
