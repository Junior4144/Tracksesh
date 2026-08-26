import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/components/AuthProvider';
import { useTimer } from '@/components/TimerProvider';
import { SessionLabelPrompt } from '@/components/SessionLabelPrompt';
import { HowItWorks } from '@/components/panels/HowItWorks';
import { fetchRecentBlocks } from '@/lib/blocks';
import { blockDuration, formatClock, formatTotal } from '@/lib/time';
import { slotColor, type TimeBlockWithTag } from '@/lib/types';
import {
  AlertIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from '@/components/icons';

const RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_SIZE = RADIUS * 2 + 40;

const STATE_LABEL = {
  idle: 'Ready when you are',
  running: 'Tracking',
  paused: 'Paused',
} as const;

const RING_CLASS = {
  idle: 'ring-idle',
  running: 'ring-running',
  paused: 'ring-paused',
} as const;

export default function DashboardPage() {
  const timer = useTimer();
  const { displayName } = useAuth();

  const [recent, setRecent] = useState<TimeBlockWithTag[]>([]);

  const loadRecent = useCallback(() => {
    fetchRecentBlocks()
      .then(setRecent)
      .catch(() => {
        // Non-essential panel; the timer still works without it.
      });
  }, []);

  // Refresh the list whenever a session finishes being dealt with.
  useEffect(() => {
    if (!timer.pending) loadRecent();
  }, [timer.pending, loadRecent]);

  const ringClass = RING_CLASS[timer.status];
  const strokeDashoffset = CIRCUMFERENCE * (1 - timer.progress);
  const isIdle = timer.status === 'idle';

  return (
    <div className="dashboard d-flex flex-column min-vh-100">
      <div className="dashboard-header text-center pt-5 pb-2">
        <p className="text-muted mb-1 small text-uppercase letter-spacing">Welcome back</p>
        <h2 className="fw-bold mb-0">{displayName}</h2>
      </div>

      {/*
        Three columns on a wide screen: the timer stays optically centred while
        the explainer and the recent list fill the gutters that were empty.
        Source order is centre-first, so the narrow single-column stack still
        leads with the timer — the sides are placed by grid-column, not order.
      */}
      <main className="dashboard-layout flex-grow-1">
        <div className="dash-center d-flex flex-column align-items-center gap-4">
          <p className={`state-label fw-semibold mb-0 ${ringClass}`}>{STATE_LABEL[timer.status]}</p>

        <div className={`timer-ring-wrapper position-relative${timer.status === 'running' ? ' pulse' : ''}`}>
          <svg
            className="timer-svg"
            width={SVG_SIZE}
            height={SVG_SIZE}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            aria-hidden="true"
          >
            <circle
              className="ring-track"
              cx={RADIUS + 20}
              cy={RADIUS + 20}
              r={RADIUS}
              fill="none"
              strokeWidth="10"
            />
            <circle
              className={`ring-progress ${ringClass}`}
              cx={RADIUS + 20}
              cy={RADIUS + 20}
              r={RADIUS}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{
                transform: 'rotate(-90deg)',
                transformBox: 'fill-box',
                transformOrigin: 'center',
              }}
            />
          </svg>

          <div className="timer-center position-absolute top-50 start-50 translate-middle text-center">
            <div className="timer-display">{timer.displayTime}</div>
            <div className="timer-sub text-muted small">
              {isIdle
                ? 'Press start when you begin'
                : timer.block
                  ? `Started ${formatClock(timer.block.started_at)}`
                  : ''}
            </div>
          </div>
        </div>

        <div className="timer-controls d-flex gap-3 align-items-center">
          {isIdle && (
            <button
              className="btn btn-accent btn-lg px-5 fw-semibold"
              onClick={timer.start}
              disabled={timer.busy || !timer.ready}
            >
              <PlayIcon className="me-2" size={18} />
              Start
            </button>
          )}

          {timer.status === 'running' && (
            <>
              <button
                className="btn btn-outline-accent px-4 fw-semibold"
                onClick={timer.pause}
                disabled={timer.busy}
              >
                <PauseIcon className="me-2" size={18} />
                Pause
              </button>
              <button
                className="btn btn-stop px-4 fw-semibold"
                onClick={timer.stop}
                disabled={timer.busy}
              >
                <StopIcon className="me-2" size={16} />
                Stop
              </button>
            </>
          )}

          {timer.status === 'paused' && (
            <>
              <button
                className="btn btn-accent btn-lg px-5 fw-semibold"
                onClick={timer.resume}
                disabled={timer.busy}
              >
                <PlayIcon className="me-2" size={18} />
                Resume
              </button>
              <button
                className="btn btn-stop px-4 fw-semibold"
                onClick={timer.stop}
                disabled={timer.busy}
              >
                <StopIcon className="me-2" size={16} />
                Stop
              </button>
            </>
          )}
        </div>

          {timer.error && (
            <div className="timer-error d-flex align-items-center gap-2">
              <AlertIcon size={14} />
              {timer.error}
            </div>
          )}

          {/* Inside the centre column, not a row beneath the whole grid — so a
              long panel in the left column can never push this down. */}
          {recent.length > 0 && (
            <section className="recent-blocks">
              <h3 className="recent-title text-muted small text-uppercase letter-spacing mb-2">
                Recent
              </h3>
              <ul className="list-unstyled mb-0">
                {recent.map((b) => (
                  <li key={b.id} className="recent-row d-flex align-items-center gap-2">
                    <span className="recent-dot" style={{ background: slotColor(b.tag?.color) }} />
                    <span className="recent-name flex-grow-1 text-truncate">
                      {b.tag?.name ?? <span className="text-muted fst-italic">Unlabelled</span>}
                      {b.note && <span className="text-muted small ms-2">{b.note}</span>}
                    </span>
                    <span className="recent-time text-muted small">
                      {formatClock(b.started_at)}
                    </span>
                    <span className="recent-total fw-semibold small">
                      {formatTotal(blockDuration(b))}
                    </span>
                  </li>
                ))}
              </ul>
              <Link to="/activity" className="recent-more link-accent">
                See all activity →
              </Link>
            </section>
          )}
        </div>

        <aside className="dash-side dash-side-left">
          <HowItWorks />
        </aside>
      </main>

      {timer.pending && (
        <SessionLabelPrompt
          block={timer.pending}
          busy={timer.busy}
          onSave={(tagId, note) => timer.label(tagId, note)}
          onDiscard={timer.discard}
          onDismiss={timer.dismissPending}
        />
      )}
    </div>
  );
}
