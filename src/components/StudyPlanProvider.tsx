import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { defaultPlan, planError, planStorageKey, readPlan, type StudyPlan } from '@/lib/study-plan';

interface PlanContext {
  plan: StudyPlan;
  saved: boolean;
  save: (plan: StudyPlan) => string | null;
  reset: () => string | null;
}
const Context = createContext<PlanContext | null>(null);

function loadAccountPlan(userId: string | undefined) {
  try {
    const raw = userId ? localStorage.getItem(planStorageKey(userId)) : null;
    const plan = readPlan(raw);
    return {
      userId,
      plan,
      saved: !!raw && JSON.stringify(plan) === JSON.stringify(JSON.parse(raw)),
    };
  } catch {
    return { userId, plan: defaultPlan(), saved: false };
  }
}

export function StudyPlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState(() => loadAccountPlan(userId));

  // Reset account state before paint without remounting the route tree. Keying
  // this provider by user would rerun single-use email verification on sign-in.
  if (state.userId !== userId) setState(loadAccountPlan(userId));

  function save(next: StudyPlan) {
    const error = planError(next);
    if (error) return error;
    if (!userId) return 'Sign in to save your plan.';
    try {
      localStorage.setItem(planStorageKey(userId), JSON.stringify(next));
    } catch {
      return 'This browser could not save your plan. Your edits are still here.';
    }
    setState({ userId, plan: next, saved: true });
    return null;
  }

  function reset() {
    try {
      if (userId) localStorage.removeItem(planStorageKey(userId));
    } catch {
      return 'This browser could not reset your saved plan.';
    }
    setState({ userId, plan: defaultPlan(), saved: false });
    return null;
  }

  return (
    <Context.Provider value={{ plan: state.plan, saved: state.saved, save, reset }}>
      {children}
    </Context.Provider>
  );
}

export function useStudyPlan() {
  const context = useContext(Context);
  if (!context) throw new Error('StudyPlanProvider is required.');
  return context;
}
