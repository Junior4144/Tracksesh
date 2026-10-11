import { describe, expect, it } from 'vitest';
import {
  allocateMinutes,
  defaultPlan,
  planError,
  projectRoutine,
  readPlan,
  dateKey,
} from './study-plan';

describe('SU-04/05 calendar projections', () => {
  it('projects 20 minutes daily over actual calendar months and years', () => {
    expect(projectRoutine(20, [0, 1, 2, 3, 4, 5, 6], '2026-04-01', 'month')).toEqual({
      days: 30,
      minutes: 600,
    });
    expect(projectRoutine(20, [0, 1, 2, 3, 4, 5, 6], '2026-04-01', 'year')).toEqual({
      days: 365,
      minutes: 7300,
    });
  });
  it('counts leap days, selected weekdays and inclusive custom endpoints', () => {
    expect(projectRoutine(20, [0, 1, 2, 3, 4, 5, 6], '2024-01-01', 'year').days).toBe(366);
    expect(projectRoutine(20, [1, 2, 3, 4, 5], '2026-03-02', 'week')).toEqual({
      days: 5,
      minutes: 100,
    });
    expect(
      projectRoutine(20, [0, 1, 2, 3, 4, 5, 6], '2026-03-07', 'custom', '2026-03-09').days,
    ).toBe(3);
    expect(projectRoutine(20, [1], '2026-03-09', 'custom', '2026-03-09').days).toBe(1);
  });
  it('clamps month boundaries and rejects invalid dates or reversed ranges', () => {
    expect(projectRoutine(20, [0, 1, 2, 3, 4, 5, 6], '2026-01-31', 'month').days).toBe(28);
    expect(() => projectRoutine(20, [1], '2026-02-30', 'year')).toThrow();
    expect(() => projectRoutine(20, [1], '2026-03-09', 'custom', '2026-03-08')).toThrow();
    expect(() => projectRoutine(20, [], '2026-03-09', 'week')).toThrow();
  });
});

describe('SU-06 allocation', () => {
  it('deducts breaks and honors relative priorities', () => {
    expect(allocateMinutes(90, 15, [2, 1])).toEqual([50, 25]);
    expect(allocateMinutes(20, 20, [1, 1])).toEqual([0, 0]);
    expect(allocateMinutes(20, 0, [])).toEqual([]);
  });
  it('distributes remainder minutes deterministically and preserves the exact budget', () => {
    expect(allocateMinutes(20, 0, [1, 1, 1])).toEqual([7, 7, 6]);
    for (let budget = 1; budget <= 1440; budget++) {
      const result = allocateMinutes(budget, 0, [1, 3, 7]);
      expect(result.reduce((a, b) => a + b, 0)).toBe(budget);
      expect(result.every(Number.isInteger)).toBe(true);
    }
  });
  it('rejects impossible budgets and non-finite values', () => {
    expect(() => allocateMinutes(30, 31, [1])).toThrow();
    expect(() => allocateMinutes(NaN, 0, [1])).toThrow();
    expect(() => allocateMinutes(30, 0, [0])).toThrow();
  });
});

describe('SU-07 saved preferences', () => {
  it('validates stored data and safely replaces corrupted versions', () => {
    const plan = defaultPlan();
    expect(planError(plan)).toBeNull();
    expect(readPlan(JSON.stringify(plan))).toEqual(plan);
    expect(readPlan('{broken').version).toBe(1);
    expect(readPlan(JSON.stringify({ ...plan, dailyMinutes: -1 })).dailyMinutes).toBe(20);
    expect(readPlan(JSON.stringify({ ...plan, weekdays: [99] })).weekdays).toHaveLength(7);
    expect(readPlan(JSON.stringify({ ...plan, subjects: null })).subjects).toEqual([]);
    expect(dateKey(new Date(2026, 3, 1))).toBe('2026-04-01');
  });
});
