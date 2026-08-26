import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
import { useAuth } from '@/components/AuthProvider';
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
  /*
   * The stopwatch follows the session.
   *
   * Under Supabase this provider held its own client and the auth cookie went
   * along with every request, so it could fetch the moment it mounted. The API
   * wants a bearer token, which does not exist until AuthProvider has resolved
   * who is signed in — so the initial lookup waits for `authReady` and re-runs
   * whenever the user changes. Fetching earlier would 401 on every reload and
   * leave the timer stuck at idle with a session still running in the database.
   */
  const { user, ready: authReady } = useAuth();

  const [block, setBlock] = useState<TimeBlock | null>(null);
  const [pending, setPending] = useState<TimeBlock | null>(null);
  const [fetched, setFetched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Whose stopwatch is currently cached, so a change of user throws it away.
   *
   * Adjusting state during render rather than in an effect: React supports this
   * exact pattern for "reset when an input changes", and it re-renders before
   * committing, so nothing ever paints one account's session under another's
   * name. An effect would let that frame through — and on sign-out that frame
   * shows a stranger's running timer.
   */
  const userId = user?.id ?? null;
  const [cachedFor, setCachedFor] = useState<string | null>(userId);

  if (cachedFor !== userId) {
    setCachedFor(userId);
    setBlock(null);
    setPending(null);
    setFetched(false);
  }

  // Derived, not stored: signed out there is nothing to look up, so the
  // stopwatch is ready as soon as auth is.
  const ready = authReady && (!user || fetched);

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
    if (!authReady || !user) return;

    let active = true;
    const sentAt = Date.now();

    Promise.all([fetchRunningBlock(), fetchServerNow()])
      .then(([running, serverIso]) => {
        if (!active) return;
        setOffsetMs(clockOffset(serverIso, sentAt, Date.now()));
        setBlock(running);
      })
      .catch(() => {
        // Signed out or offline: stay idle rather than blocking the page.
      })
      .finally(() => {
        if (active) setFetched(true);
      });

    return () => {
      active = false;
    };
  }, [authReady, user]);

  const isRunning = !!block && !block.paused_at;

  // Only subscribes while actually running — a paused clock is frozen by
  // definition, and an idle one has nothing to count.
  const now = useClock(isRunning);

  /** Serialises transitions so a double-click can't fire two RPCs. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (!user) {
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
    [user, busy]
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
        const started = await startSession();
        if (!mounted.current) return;
        resync(started, sentAt);
        setBlock(started);
      }),
    [run, resync]
  );

  const pause = useCallback(
    () =>
      run(async () => {
        const sentAt = Date.now();
        const paused = await pauseSession();
        if (!mounted.current || !paused) return;
        resync(paused, sentAt);
        setBlock(paused);
      }),
    [run, resync]
  );

  const resume = useCallback(
    () =>
      run(async () => {
        const sentAt = Date.now();
        const resumed = await resumeSession();
        if (!mounted.current || !resumed) return;
        resync(resumed, sentAt);
        setBlock(resumed);
      }),
    [run, resync]
  );

  const stop = useCallback(
    () =>
      run(async () => {
        const sentAt = Date.now();
        const stopped = await stopSession();
        if (!mounted.current) return;
        resync(stopped, sentAt);
        setBlock(null);
        // Held for labelling — "what did you do in this time?"
        if (stopped) setPending(stopped);
      }),
    [run, resync]
  );

  const label = useCallback(
    (tagId: number | null, note: string) =>
      run(async () => {
        const target = pending;
        if (!target) return;
        await labelBlock(target.id, tagId, note);
        if (mounted.current) setPending(null);
      }),
    [run, pending]
  );

  /** Discard a mis-start rather than leaving a stray minute in the ledger. */
  const discard = useCallback(
    () =>
      run(async () => {
        const target = pending;
        if (!target) return;
        await deleteBlock(target.id);
        if (mounted.current) setPending(null);
      }),
    [run, pending]
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
