'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useTimer } from '@/components/TimerProvider';
import {
  CheckCircleIcon,
  CheckSmallIcon,
  ClockIcon,
  InfoIcon,
  ListCheckIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  ResetIcon,
} from '@/components/icons';

const RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_SIZE = RADIUS * 2 + 40;

const STATE_LABEL = {
  idle: 'Ready',
  running: 'Focus time',
  paused: 'Paused',
  done: 'Session complete!',
} as const;

const RING_CLASS = {
  idle: 'ring-idle',
  running: 'ring-running',
  paused: 'ring-paused',
  done: 'ring-done',
} as const;

export default function DashboardPage() {
  const timer = useTimer();
  const { user, isLoggedIn, displayName } = useAuth();
  const router = useRouter();

  const [editingDuration, setEditingDuration] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(50);
  const [loginPrompt, setLoginPrompt] = useState(false);

  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (nudgeTimer.current !== null) clearTimeout(nudgeTimer.current);
    };
  }, []);

  const isRunning = timer.state === 'running';
  const isPaused = timer.state === 'paused';
  const isDone = timer.state === 'done';
  const isIdle = timer.state === 'idle';

  const ringClass = RING_CLASS[timer.state];
  const strokeDashoffset = CIRCUMFERENCE * (1 - timer.progress);

  function requestEdit() {
    // Can't change duration while a session is active.
    if (isRunning || isPaused) return;

    if (!isLoggedIn) {
      // Flash the login nudge briefly, then redirect.
      setLoginPrompt(true);
      nudgeTimer.current = setTimeout(() => {
        setLoginPrompt(false);
        router.push('/login?returnUrl=/dashboard');
      }, 1400);
      return;
    }

    setDraftMinutes(timer.durationMinutes);
    setEditingDuration(true);
  }

  function applyDuration() {
    if (draftMinutes >= 1 && draftMinutes <= 180) {
      timer.setDuration(draftMinutes);
    }
    setEditingDuration(false);
  }

  const editTitle = isRunning || isPaused
    ? 'Reset the timer to change the duration'
    : isLoggedIn
      ? 'Click to change session length'
      : 'Sign in to change session length';

  return (
    <div className="dashboard d-flex flex-column min-vh-100">
      <div className="dashboard-header text-center pt-5 pb-2">
        {user ? (
          <>
            <p className="text-muted mb-1 small text-uppercase letter-spacing">Welcome back</p>
            <h2 className="fw-bold mb-0">{displayName}</h2>
          </>
        ) : (
          <p className="text-muted mb-1 small">
            <Link href="/login" className="link-accent">
              Sign in
            </Link>{' '}
            to save your sessions
          </p>
        )}
      </div>

      <main className="flex-grow-1 d-flex flex-column align-items-center gap-4">
        <p className={`state-label fw-semibold mb-0 ${ringClass}`}>{STATE_LABEL[timer.state]}</p>

        <div className={`timer-ring-wrapper position-relative${isRunning ? ' pulse' : ''}`}>
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
            <div className={`timer-display${isDone ? ' done' : ''}`}>{timer.displayTime}</div>
            <div className="timer-sub text-muted small">
              {isDone ? 'Great work!' : `${timer.durationMinutes}-minute session`}
            </div>
          </div>
        </div>

        <div className="timer-controls d-flex gap-3 align-items-center">
          {isIdle && (
            <button className="btn btn-accent btn-lg px-5 fw-semibold" onClick={timer.start}>
              <PlayIcon className="me-2" size={18} />
              Start Session
            </button>
          )}

          {isRunning && (
            <>
              <button className="btn btn-outline-accent px-4 fw-semibold" onClick={timer.pause}>
                <PauseIcon className="me-2" size={18} />
                Pause
              </button>
              <button className="btn btn-ghost px-4" onClick={timer.reset}>
                <ResetIcon className="me-2" size={16} />
                Reset
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button className="btn btn-accent btn-lg px-5 fw-semibold" onClick={timer.start}>
                <PlayIcon className="me-2" size={18} />
                Resume
              </button>
              <button className="btn btn-ghost px-4" onClick={timer.reset}>
                <ResetIcon className="me-2" size={16} />
                Reset
              </button>
            </>
          )}

          {isDone && (
            <div className="text-center">
              <div className="done-banner mb-3">
                <CheckCircleIcon className="me-2" size={28} />
                Session Complete
              </div>
              <button className="btn btn-accent btn-lg px-5 fw-semibold" onClick={timer.reset}>
                Start New Session
              </button>
            </div>
          )}
        </div>

        {!isDone && (
          <div className="duration-row d-flex flex-column align-items-center gap-2">
            {loginPrompt && (
              <div className="login-nudge">
                <InfoIcon className="me-1" size={13} />
                Sign in to customise session length
              </div>
            )}

            {editingDuration ? (
              <div className="duration-editor d-flex align-items-center gap-2">
                <label htmlFor="durInput" className="text-muted small mb-0">
                  Session length
                </label>
                <input
                  id="durInput"
                  type="number"
                  className="form-control form-control-sm duration-input"
                  value={draftMinutes}
                  onChange={(e) =>
                    setDraftMinutes(Number.isNaN(e.target.valueAsNumber) ? 1 : e.target.valueAsNumber)
                  }
                  min={1}
                  max={180}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyDuration();
                    if (e.key === 'Escape') setEditingDuration(false);
                  }}
                />
                <span className="text-muted small">min</span>
                <button className="btn btn-accent btn-sm px-3" onClick={applyDuration}>
                  Set
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingDuration(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="session-chips d-flex gap-2 flex-wrap justify-content-center">
                <button
                  className="chip chip-editable"
                  onClick={requestEdit}
                  disabled={isRunning || isPaused}
                  title={editTitle}
                >
                  <ClockIcon className="me-1" size={12} />
                  {timer.durationMinutes} min session
                  {!isRunning && !isPaused && <PencilIcon className="ms-1 edit-icon" size={10} />}
                </button>

                <span className="chip">
                  <ListCheckIcon className="me-1" size={12} />
                  Flexible tracking
                </span>

                <span className="chip">
                  <CheckSmallIcon className="me-1" size={12} />
                  No distractions
                </span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
