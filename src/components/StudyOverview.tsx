import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useStudyPlan } from './StudyPlanProvider';
import { fetchTags } from '@/lib/blocks';
import { allocateMinutes, dateKey, formatMinutes, projectRoutine } from '@/lib/study-plan';
import { slotColor, type Tag } from '@/lib/types';

export function StudyOverview() {
  const { plan, saved } = useStudyPlan();
  const [tags, setTags] = useState<Tag[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    fetchTags()
      .then((rows) => {
        if (active) {
          setTags(rows);
          setState('ready');
        }
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const selected = plan.subjects.filter((s) => tags.some((t) => t.id === s.id));
  const minutes = allocateMinutes(
    plan.availableMinutes,
    plan.breakMinutes,
    selected.map((s) => s.weight),
  );
  const today = new Date();
  const inRange = dateKey(today) >= plan.startDate && dateKey(today) <= plan.endDate;
  const studyDay = inRange && plan.weekdays.includes(today.getDay());
  const projection = projectRoutine(plan.dailyMinutes, plan.weekdays, plan.startDate, 'month');
  return (
    <>
      <section className="routine-banner" aria-label="Study routine">
        <div>
          <p className="eyebrow">{saved ? 'Your saved rhythm' : 'Start small. Stay curious.'}</p>
          <h2>
            {saved
              ? `${plan.dailyMinutes} minutes. ${plan.weekdays.length} days a week.`
              : 'What could 20 minutes become?'}
          </h2>
          <p>
            {saved
              ? `${formatMinutes(projection.minutes)} planned in one calendar month from your start date.`
              : 'A little daily focus can make room for a whole lot of learning.'}
          </p>
        </div>
        <Link className="btn btn-ghost" to="/planner">
          {saved ? 'Adjust your plan' : 'Build your routine'} <span aria-hidden="true">↗</span>
        </Link>
      </section>
      <section className="suite-card today-plan" aria-labelledby="today-plan-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your next steps</p>
            <h2 className="section-title" id="today-plan-title">
              A little structure for today
            </h2>
          </div>
          <Link className="link-accent small" to="/planner">
            Edit plan →
          </Link>
        </div>
        {saved ? (
          <p className="daily-target">
            {studyDay
              ? `${plan.dailyMinutes} minutes in your routine today.`
              : inRange
                ? 'A rest day in your routine. Study if you feel like it.'
                : 'Today is outside your saved date range. Update your plan when you’re ready.'}
          </p>
        ) : (
          <p className="daily-target">
            Choose a routine, then divide the time you have between your subjects.
          </p>
        )}
        {state === 'loading' ? (
          <p role="status">Loading your subjects…</p>
        ) : state === 'error' ? (
          <div role="alert">
            <p>Your study allocation could not load.</p>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setState('loading');
                setAttempt((v) => v + 1);
              }}
            >
              Retry subjects
            </button>
          </div>
        ) : selected.length ? (
          <>
            <ol className="study-agenda">
              {selected.map((item, i) => {
                const tag = tags.find((t) => t.id === item.id)!;
                return (
                  <li key={item.id}>
                    <span className="agenda-number" style={{ color: slotColor(tag.color) }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <strong>{tag.name}</strong>
                      <small>Planned study</small>
                    </div>
                    <span>{formatMinutes(minutes[i])}</span>
                  </li>
                );
              })}
            </ol>
            <p className="field-hint">
              Saved time budget: {formatMinutes(plan.availableMinutes)}, including{' '}
              {formatMinutes(plan.breakMinutes)} of breaks. This allocation is separate from your
              daily routine.
            </p>
          </>
        ) : (
          <div className="plan-empty">
            <span aria-hidden="true">＋</span>
            <div>
              <strong>Give your subjects a place.</strong>
              <p>Allocate your available time in the Planner.</p>
            </div>
            <Link to="/planner" className="btn btn-ghost">
              Plan time
            </Link>
          </div>
        )}
        {saved && (
          <p className="field-hint">
            Plan saved on this browser · estimates, not completed sessions.
          </p>
        )}
      </section>
    </>
  );
}
