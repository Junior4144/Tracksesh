'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  fetchRunningBlock,
  fetchServerNow,
  labelBlock,
  deleteBlock,
  pauseSession,
  resumeSession,
  startSession,
  stopSession,
} from '@/lib/blocks';
import { clockOffset, elapsedSeconds, formatDuration, ringProgress } from '@/lib/time';
import { useClock } from '@/lib/useClock';
import type { TimeBlock } from '@/lib/types';

export type TimerStatus = 'idle' | 'running' | 'paused';

interface TimerContextValue {
  status: TimerStatus;
  /** False until the initial "is a session already running?" lookup resolves. */
  ready: boolean;
  busy: boolean;
  error: string | null;
  /** The live block, or null when idle. */
  block: TimeBlock | null;
  /** A just-stopped block waiting to be labelled. */
  pending: TimeBlock | null;
  elapsed: number;
  displayTime: string;
  progress: number;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  label: (tagId: number | null, note: string) => Promise<void>;
  discard: () => Promise<void>;
  dismissPending: () => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

/**
 * The stopwatch. Mounted above the router so a session survives navigation.
 *
 * The running session lives in the database, not here — this holds a cached
 * copy of that row. Consequences worth knowing:
 *
 *   - Refreshing, closing the laptop, or switching device does not lose time.
 *     On mount we ask the server what's running and pick it back up.
 *   - Elapsed time is computed from `started_at` on every render, so a
 *     throttled background tab cannot make the clock run slow. The interval
 *     below only forces a re-render; it never accumulates.
 */
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createClient() : null), []);

  const [block, setBlock] = useState<TimeBlock | null>(null);
  const [pending, setPending] = useState<TimeBlock | null>(null);
  // Nothing to wait for when Supabase isn't wired up.
  const [ready, setReady] = useState(() => !isSupabaseConfigured());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Server clock minus this machine's clock, in ms.
   *
   * Timestamps are written by the database, so elapsed time has to be measured
   * against the database's clock too. Subtracting a server `started_at` from a
   * local `Date.now()` shows the drift as elapsed time — a machine two minutes
   * fast displayed 1:52 the instant the timer started.
   */
  const [offsetMs, setOffsetMs] = useState(0);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Pick up an already-running session (another tab, an earlier visit, a crash),
  // and measure how far this machine's clock sits from the database's.
  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const sentAt = Date.now();

    Promise.all([fetchRunningBlock(supabase), fetchServerNow(supabase)])
      .then(([running, serverIso]) => {
        if (!active) return;
        setOffsetMs(clockOffset(serverIso, sentAt, Date.now()));
        setBlock(running);
      })
      .catch(() => {
        // Signed out or offline: stay idle rather than blocking the page.
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [supabase]);

  const isRunning = !!block && !block.paused_at;

  // Only subscribes while actually running — a paused clock is frozen by
  // definition, and an idle one has nothing to count.
  const now = useClock(isRunning);

  /** Serialises transitions so a double-click can't fire two RPCs. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (!supabase) {
        setError('Sign in to track sessions.');
        return;
      }
      if (busy) return;

      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (e) {
        if (mounted.current) {
          setError(e instanceof Error ? e.message : 'Something went wrong.');
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [supabase, busy]
  );

  /**
   * Every write stamps `updated_at` server-side, so each response doubles as a
   * fresh clock reading. Re-syncing on each transition keeps the timer accurate
   * even if the local clock is adjusted mid-session.
   */
  const resync = useCallback((row: TimeBlock | null, sentAt: number) => {
    if (row?.updated_at) setOffsetMs(clockOffset(row.updated_at, sentAt, Date.now()));
  }, []);

  const start = useCallback(
    () =>
      run(async () => {
        const sentAt = Date.now();
        const started = await startSession(supabase!);
        if (!mounted.current) return;
        resync(started, sentAt);
        setBlock(started);
      }),
    [run, supabase, resync]
  );

  const pause = useCallback(
    () =>
      run(async () => {
        const sentAt = Date.now();
        const paused = await pauseSession(supabase!);
        if (!mounted.current || !paused) return;
        resync(paused, sentAt);
        setBlock(paused);
      }),
    [run, supabase, resync]
  );

  const resume = useCallback(
    () =>
      run(async () => {
        const sentAt = Date.now();
        const resumed = await resumeSession(supabase!);
        if (!mounted.current || !resumed) return;
        resync(resumed, sentAt);
        setBlock(resumed);
      }),
    [run, supabase, resync]
  );

  const stop = useCallback(
    () =>
      run(async () => {
        const sentAt = Date.now();
        const stopped = await stopSession(supabase!);
        if (!mounted.current) return;
        resync(stopped, sentAt);
        setBlock(null);
        // Held for labelling — "what did you do in this time?"
        if (stopped) setPending(stopped);
      }),
    [run, supabase, resync]
  );

  const label = useCallback(
    (tagId: number | null, note: string) =>
      run(async () => {
        const target = pending;
        if (!target) return;
        await labelBlock(supabase!, target.id, tagId, note);
        if (mounted.current) setPending(null);
      }),
    [run, supabase, pending]
  );

  /** Discard a mis-start rather than leaving a stray minute in the ledger. */
  const discard = useCallback(
    () =>
      run(async () => {
        const target = pending;
        if (!target) return;
        await deleteBlock(supabase!, target.id);
        if (mounted.current) setPending(null);
      }),
    [run, supabase, pending]
  );

  // Keeps the block, unlabelled. Losing the time is worse than an untidy ledger.
  const dismissPending = useCallback(() => setPending(null), []);

  const status: TimerStatus = !block ? 'idle' : block.paused_at ? 'paused' : 'running';
  // Corrected to server time — `now` alone is this machine's clock, which the
  // block's server-written timestamps know nothing about.
  const elapsed = block ? elapsedSeconds(block, now + offsetMs) : 0;

  return (
    <TimerContext.Provider
      value={{
        status,
        ready,
        busy,
        error,
        block,
        pending,
        elapsed,
        displayTime: formatDuration(elapsed),
        progress: ringProgress(elapsed),
        start,
        pause,
        resume,
        stop,
        label,
        discard,
        dismissPending,
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
