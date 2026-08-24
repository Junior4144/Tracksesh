'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type TimerState = 'idle' | 'running' | 'paused' | 'done';

const DEFAULT_MINUTES = 50;

interface TimerContextValue {
  state: TimerState;
  secondsLeft: number;
  durationMinutes: number;
  totalSeconds: number;
  minutes: number;
  seconds: number;
  /** 0 -> 1, fraction of the session elapsed. */
  progress: number;
  /** mm:ss */
  displayTime: string;
  setDuration: (minutes: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

/**
 * Lives above the router so a running session survives navigating away from
 * the dashboard, matching the Angular root-provided TimerService.
 */
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_MINUTES);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_MINUTES * 60);
  const [state, setState] = useState<TimerState>('idle');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const setDuration = useCallback(
    (minutes: number) => {
      const clamped = Math.max(1, Math.min(180, minutes));
      clear();
      setDurationMinutes(clamped);
      setSecondsLeft(clamped * 60);
      setState('idle');
    },
    [clear]
  );

  const start = useCallback(() => {
    setState((current) => {
      if (current === 'done' || current === 'running') return current;

      clear();
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            clear();
            setState('done');
            return 0;
          }
          return next;
        });
      }, 1000);

      return 'running';
    });
  }, [clear]);

  const pause = useCallback(() => {
    setState((current) => {
      if (current !== 'running') return current;
      clear();
      return 'paused';
    });
  }, [clear]);

  const reset = useCallback(() => {
    clear();
    setSecondsLeft(durationMinutes * 60);
    setState('idle');
  }, [clear, durationMinutes]);

  const totalSeconds = durationMinutes * 60;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = totalSeconds === 0 ? 0 : (totalSeconds - secondsLeft) / totalSeconds;
  const displayTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <TimerContext.Provider
      value={{
        state,
        secondsLeft,
        durationMinutes,
        totalSeconds,
        minutes,
        seconds,
        progress,
        displayTime,
        setDuration,
        start,
        pause,
        reset,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used inside <TimerProvider>');
  return ctx;
}
