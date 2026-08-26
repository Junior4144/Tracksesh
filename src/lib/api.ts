import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * The one place this app talks to its backend.
 *
 * Every request carries the Supabase access token as a bearer credential; the
 * API verifies it against Supabase's published signing keys and then runs the
 * query as that user, so the row level security policies still decide what the
 * query can see. See server/Tracksesh.Api/Data/Db.cs.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** An error the API described in words, with the status that carried it. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The current access token, refreshed if it has expired.
 *
 * `getSession()` rather than `getUser()` — deliberately, and not in conflict
 * with the project rule that says otherwise. That rule is about *servers*
 * trusting a session: `getSession()` reads storage without revalidating, so a
 * server must never authorise on it. Here there is nothing to authorise; this
 * is a client fetching the token it will send, and the check that matters
 * happens where it should, when the API verifies the signature. Calling
 * `getUser()` would add a network round trip to Supabase before every single
 * request and still prove nothing to this process.
 */
async function accessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * A token the API refused ends the session here, too.
 *
 * supabase-js already handles the ordinary case: it refreshes on its own, and
 * emits SIGNED_OUT when a refresh token is spent, which AuthProvider turns into
 * a signed-out user and the route guards act on. What it cannot see is the API
 * rejecting a token the client still believes in — a revoked key, a deleted
 * user, a clock far enough out for `nbf` to fail. Without this the app keeps
 * rendering as though signed in while every request fails, and the only way out
 * is to know to type /login.
 *
 * Only when a token was actually sent. A 401 on a request that carried no
 * credentials says nothing about the session, and signing out on it would make
 * an unconfigured app look like an expired one.
 */
async function endRejectedSession(sentToken: boolean) {
  if (!sentToken || !isSupabaseConfigured()) return;
  try {
    await getSupabase().auth.signOut();
  } catch {
    // Already gone, or storage is unavailable. The throw below still happens.
  }
}

async function describe(response: Response): Promise<string> {
  // The API reports refusals as { message }. ProblemDetails, from an unhandled
  // path, uses `detail`/`title` instead — worth reading rather than replacing
  // with a generic string, because it is usually the specific thing that broke.
  try {
    const body = await response.json();
    const message = body?.message ?? body?.detail ?? body?.title;
    if (typeof message === 'string' && message) return message;
  } catch {
    // Not JSON — a proxy error page, or nothing at all.
  }

  if (response.status === 401) return 'Your session has expired. Sign in again.';
  if (response.status === 429) return 'Too many requests. Wait a moment and try again.';
  if (response.status === 503) return 'That service is briefly unavailable. Try again in a moment.';
  return `Something went wrong (${response.status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const message = await describe(response);
    if (response.status === 401) await endRejectedSession(!!token);
    throw new ApiError(message, response.status);
  }

  /*
   * An empty body is a real answer, not a missing one. A 204 means the write
   * landed and there is nothing to say about it; a 200 with no body is a
   * stopwatch transition that turned out to be a no-op — pausing when nothing
   * was running, say. Both mean null, and `response.json()` would throw on
   * either.
   */
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

/** Query strings, without the `?` when there is nothing to ask. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
