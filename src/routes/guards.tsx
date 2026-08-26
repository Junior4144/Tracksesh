import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/components/AuthProvider';

/**
 * What proxy.ts used to do at the edge, now done in the browser.
 *
 * The rules are the same; the timing is not. Middleware knew whether there was
 * a session before a single byte of the page was sent, so it could redirect
 * without anything rendering. Here the answer arrives asynchronously, which
 * makes `ready` the whole game: rendering the redirect before the session
 * lookup resolves would throw every signed-in user back to /login on every
 * refresh, and rendering the page would flash protected content at someone who
 * turns out not to be signed in.
 *
 * Worth being clear about what this is and isn't. These guards are navigation,
 * not access control — anyone can edit their way past them. The access control
 * is the API refusing an unauthenticated request and the row level security
 * policies underneath it, neither of which this code can weaken.
 */

/** Held while the session lookup is in flight. Deliberately not a spinner. */
function Pending() {
  // A spinner for a lookup that usually resolves in one frame reads as jank.
  // An empty region of the right shape does not, and either way the guard
  // replaces it as soon as the answer lands.
  return <div className="container-sm py-5" aria-busy="true" />;
}

export function AuthOnly() {
  const { ready, isLoggedIn } = useAuth();
  const location = useLocation();

  if (!ready) return <Pending />;

  if (!isLoggedIn) {
    // Carries the intended destination so signing in resumes it instead of
    // dumping the user on the dashboard.
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  return <Outlet />;
}

export function GuestOnly() {
  const { ready, isLoggedIn } = useAuth();

  if (!ready) return <Pending />;
  if (isLoggedIn) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
