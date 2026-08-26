import type { TimeBlock } from './types';

/**
 * Seconds of actual worked time in a block, excluding pauses.
 *
 * Derived from timestamps rather than counted by ticks — a backgrounded tab
 * gets its timers throttled, so anything that counts ticks runs slow. This
 * cannot drift: it is always (span - paused), measured fresh.
 *
 * For a running block, pass the current time; the block's own `ended_at` wins
 * when it has one. While paused, the open pause is subtracted too, so the
 * number is frozen for as long as the pause lasts.
 */
export function elapsedSeconds(block: TimeBlock, nowMs: number): number {
  const startMs = Date.parse(block.started_at);
  const endMs = block.ended_at ? Date.parse(block.ended_at) : nowMs;

  const openPauseMs = block.paused_at ? Math.max(0, endMs - Date.parse(block.paused_at)) : 0;

  const worked =
    Math.floor((endMs - startMs) / 1000) - block.paused_seconds - Math.floor(openPauseMs / 1000);

  return Math.max(0, worked);
}

/**
 * Worked seconds in a finished block.
 *
 * Needs no clock: a finished block's duration is fixed, so this is pure and
 * safe to call during render. Returns 0 for a block that is still running —
 * use `elapsedSeconds` with a live clock for those.
 */
export function blockDuration(block: TimeBlock): number {
  if (!block.ended_at) return 0;
  return elapsedSeconds(block, Date.parse(block.ended_at));
}

/** `MM:SS`, widening to `H:MM:SS` past the hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Compact human total for summaries — "1h 24m", "36m", "48s". */
export function formatTotal(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;

  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * How far the server's clock sits ahead of this machine's, in milliseconds.
 *
 * `serverIso` is a timestamp the server generated while handling a request that
 * was sent at `sentAtMs` and whose reply arrived at `receivedAtMs`. The server
 * read its clock somewhere inside that window, so the midpoint is the best
 * estimate of the matching local time, and half the round trip is the worst
 * case error — milliseconds on any working connection.
 *
 * Add the result to a local timestamp to get server time. Without this, elapsed
 * time is `localNow - serverStart`, which is wrong by however far the local
 * clock has drifted.
 */
export function clockOffset(serverIso: string, sentAtMs: number, receivedAtMs: number): number {
  return Date.parse(serverIso) - (sentAtMs + receivedAtMs) / 2;
}

/** Local wall-clock time of day, e.g. "14:36". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * The open-ended stopwatch has no target to fill, so the ring sweeps once per
 * hour and wraps. Long sessions stay legible instead of pinning at full.
 */
export function ringProgress(elapsed: number): number {
  return (elapsed % 3600) / 3600;
}
