import { Link, useLocation } from 'react-router';
import { useTimer } from './TimerProvider';
import { SessionLabelPrompt } from './SessionLabelPrompt';
import { useAuth } from './AuthProvider';

export function SessionDock() {
  const timer = useTimer();
  const { isLoggedIn } = useAuth();
  const { pathname } = useLocation();
  if (!isLoggedIn) return null;
  return (
    <>
      {timer.status !== 'idle' && pathname !== '/dashboard' && (
        <aside className="session-dock" aria-label="Active study session">
          <Link to="/dashboard">
            <span className="status-dot" />
            <span>
              {timer.status === 'paused' ? 'Paused' : 'Studying'}{' '}
              <strong>{timer.displayTime}</strong>
            </span>
          </Link>
          <div>
            <button
              className="btn btn-ghost"
              disabled={timer.busy}
              onClick={timer.status === 'running' ? timer.pause : timer.resume}
            >
              {timer.status === 'running' ? 'Pause' : 'Resume'}
            </button>
            <button className="btn btn-accent" disabled={timer.busy} onClick={timer.stop}>
              Stop
            </button>
          </div>
          {timer.error && <p role="alert">{timer.error}</p>}
        </aside>
      )}
      {timer.pending && (
        <SessionLabelPrompt
          block={timer.pending}
          busy={timer.busy}
          error={timer.error}
          onSave={timer.label}
          onDiscard={timer.discard}
          onDismiss={timer.dismissPending}
        />
      )}
    </>
  );
}
