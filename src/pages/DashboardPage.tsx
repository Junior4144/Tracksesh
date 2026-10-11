import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/components/AuthProvider';
import { useTimer } from '@/components/TimerProvider';
import { StudyOverview } from '@/components/StudyOverview';
import { Page, PageHeader, StateMessage } from '@/components/ui/Page';
import { fetchRecentBlocks } from '@/lib/blocks';
import { blockDuration, formatClock, formatTotal } from '@/lib/time';
import { slotColor, type TimeBlockWithTag } from '@/lib/types';
import { PauseIcon, PlayIcon, StopIcon } from '@/components/icons';

const STATE_LABEL = { idle: 'Ready when you are', running: 'Tracking', paused: 'Paused' } as const;

export default function DashboardPage() {
  const timer = useTimer();
  const { displayName } = useAuth();
  const [recent, setRecent] = useState<TimeBlockWithTag[]>([]);
  const [recentState, setRecentState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [recentError, setRecentError] = useState('');
  const loadRecent = useCallback(() => {
    fetchRecentBlocks()
      .then((rows) => {
        setRecent(rows);
        setRecentState('ready');
      })
      .catch((failure: unknown) => {
        setRecentError(failure instanceof Error ? failure.message : 'Please try again.');
        setRecentState('error');
      });
  }, []);
  useEffect(() => {
    if (!timer.pending) loadRecent();
  }, [timer.pending, loadRecent]);
  const isIdle = timer.status === 'idle';

  return (
    <Page className="dashboard">
      <PageHeader title={`A fresh moment, ${displayName}.`} description={new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}>
        <Link to="/insights?add=1" className="btn btn-ghost">
          Add time manually
        </Link>
      </PageHeader>
      <StudyOverview />
      <div className="dashboard-layout">
        <section className={`timer-workspace timer-${timer.status}`} aria-label="Stopwatch">
          <div className="timer-workspace-heading">
            <h2 className="section-title">Your focus space</h2>
            <span className="state-label" role="status">
              <span className="status-dot" />
              {timer.ready
                ? STATE_LABEL[timer.status]
                : timer.error
                  ? 'Unavailable'
                  : 'Connecting…'}
            </span>
          </div>
          <div className="timer-readout">
            <div className="timer-display" aria-label={`Elapsed time ${timer.displayTime}`}>
              {timer.displayTime}
            </div>
            <p className="timer-sub">
              {isIdle
                ? 'One subject. A little focus. Begin when you’re ready.'
                : timer.block
                  ? `Started at ${formatClock(timer.block.started_at)}`
                  : ''}
            </p>
          </div>
          <div className="timer-controls">
            {isIdle ? (
              <button
                className="btn btn-accent"
                onClick={timer.start}
                disabled={timer.busy || !timer.ready}
              >
                <PlayIcon size={16} />
                Start
              </button>
            ) : (
              <>
                <button
                  className="btn btn-accent"
                  onClick={timer.status === 'running' ? timer.pause : timer.resume}
                  disabled={timer.busy}
                >
                  {timer.status === 'running' ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                  {timer.status === 'running' ? 'Pause' : 'Resume'}
                </button>
                <button className="btn btn-ghost" onClick={timer.stop} disabled={timer.busy}>
                  <StopIcon size={14} />
                  Stop
                </button>
              </>
            )}
          </div>
          {timer.error && (
            <p className="timer-error" role="alert">
              {timer.error}
            </p>
          )}
          {!timer.ready && timer.error && (
            <button className="btn btn-ghost" onClick={timer.retry}>
              Retry current session
            </button>
          )}
          <p className="timer-footnote">
            {isIdle
              ? 'Count up at your own pace. Choose a subject when you finish.'
              : 'Paused time is excluded. Label your session when you stop.'}
          </p>
        </section>
        <section className="recent-blocks" aria-labelledby="recent-title">
          <div className="section-heading">
            <h2 id="recent-title" className="section-title">
              Recent sessions
            </h2>
            <Link to="/insights" className="link-accent small">
              View insights →
            </Link>
          </div>
          {recentState === 'loading' ? (
            <StateMessage title="Loading recent sessions…" />
          ) : recentState === 'error' ? (
            <StateMessage title="Recent sessions couldn’t load" error>
              <p>{recentError}</p>
              <button
                className="btn btn-ghost mt-2"
                onClick={() => {
                  setRecentState('loading');
                  loadRecent();
                }}
              >
                Try again
              </button>
            </StateMessage>
          ) : recent.length === 0 ? (
            <StateMessage title="Your ledger starts here">
              Finish a session and choose a subject. It will appear here.
            </StateMessage>
          ) : (
            <ul className="list-unstyled recent-list">
              {recent.map((b) => (
                <li key={b.id} className="recent-row">
                  <span className="recent-dot" style={{ background: slotColor(b.tag?.color) }} />
                  <div className="recent-detail">
                    <span className="recent-name">{b.tag?.name ?? 'Unlabelled'}</span>
                    <span className="recent-note">{b.note || formatClock(b.started_at)}</span>
                  </div>
                  <div className="recent-numbers">
                    <span className="recent-total">{formatTotal(blockDuration(b))}</span>
                    <span className="recent-time">
                      {new Date(b.started_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
