export type Horizon = 'week' | 'month' | 'year' | 'custom';
export interface StudyPlan {
  version: 1;
  dailyMinutes: number;
  weekdays: number[];
  startDate: string;
  endDate: string;
  availableMinutes: number;
  breakMinutes: number;
  subjects: { id: number; weight: number }[];
}

const DAY = 86400000;
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function defaultPlan(): StudyPlan {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 29);
  return {
    version: 1,
    dailyMinutes: 20,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: dateKey(today),
    endDate: dateKey(end),
    availableMinutes: 90,
    breakMinutes: 15,
    subjects: [],
  };
}

function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid date.');
  const d = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value ||
    d.getUTCFullYear() < 2000 ||
    d.getUTCFullYear() > 2100
  )
    throw new Error('Choose a valid date between 2000 and 2100.');
  return d;
}
function integer(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
export function projectRoutine(
  minutes: number,
  weekdays: number[],
  start: string,
  horizon: Horizon,
  end?: string,
) {
  if (!integer(minutes, 1, 720)) throw new Error('Daily study time must be 1–720 whole minutes.');
  if (!weekdays.length || weekdays.some((day) => !integer(day, 0, 6)))
    throw new Error('Choose at least one study day.');
  const from = calendarDate(start);
  let until: Date;
  if (horizon === 'custom') {
    until = calendarDate(end ?? '');
    until.setUTCDate(until.getUTCDate() + 1);
  } else if (horizon === 'week') {
    until = new Date(from.getTime() + 7 * DAY);
  } else {
    const targetMonth = from.getUTCMonth() + (horizon === 'month' ? 1 : 12);
    const lastDay = new Date(Date.UTC(from.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
    until = new Date(
      Date.UTC(from.getUTCFullYear(), targetMonth, Math.min(from.getUTCDate(), lastDay)),
    );
  }
  const span = (until.getTime() - from.getTime()) / DAY;
  if (span <= 0) throw new Error('End date must be on or after the start date.');
  if (span > 3660) throw new Error('Choose a range of 3,660 days or fewer.');
  let days = 0;
  for (let i = 0; i < span; i++) if (weekdays.includes((from.getUTCDay() + i) % 7)) days++;
  return { days, minutes: days * minutes };
}

export function allocateMinutes(available: number, breaks: number, weights: number[]): number[] {
  if (!integer(available, 1, 1440))
    throw new Error('Available time must be 1–1,440 whole minutes.');
  if (!integer(breaks, 0, available))
    throw new Error('Breaks must be between zero and your available minutes.');
  if (weights.some((w) => !integer(w, 1, 10)))
    throw new Error('Priorities must be whole numbers from 1 to 10.');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return [];
  const exact = weights.map((w) => ((available - breaks) * w) / sum);
  const result = exact.map(Math.floor);
  const remainder = available - breaks - result.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, i) => ({ i, fraction: value - result[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0; i < remainder; i++) result[order[i].i]++;
  return result;
}

export function planError(plan: StudyPlan): string | null {
  try {
    if (plan.version !== 1 || !Array.isArray(plan.weekdays) || !Array.isArray(plan.subjects))
      return 'Plan format is invalid.';
    if (
      new Set(plan.weekdays).size !== plan.weekdays.length ||
      plan.subjects.length > 100 ||
      plan.subjects.some((s) => !s || !integer(s.id, 1, Number.MAX_SAFE_INTEGER)) ||
      new Set(plan.subjects.map((s) => s.id)).size !== plan.subjects.length
    )
      return 'Plan selection is invalid.';
    projectRoutine(plan.dailyMinutes, plan.weekdays, plan.startDate, 'custom', plan.endDate);
    allocateMinutes(
      plan.availableMinutes,
      plan.breakMinutes,
      plan.subjects.map((s) => s.weight),
    );
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Plan format is invalid.';
  }
}
export function readPlan(raw: string | null): StudyPlan {
  try {
    const parsed: StudyPlan = JSON.parse(raw ?? 'null');
    if (parsed && !planError(parsed)) return parsed;
  } catch {
    /* A malformed browser preference must not prevent sign-in. */
  }
  return defaultPlan();
}
export function planStorageKey(userId: string): string {
  return `tracksesh:study-plan:v1:${userId}`;
}
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}
