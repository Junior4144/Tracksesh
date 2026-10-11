import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader, StateMessage } from '@/components/ui/Page';
import { useStudyPlan } from '@/components/StudyPlanProvider';
import { fetchTags } from '@/lib/blocks';
import {
  allocateMinutes,
  defaultPlan,
  formatMinutes,
  planError,
  projectRoutine,
  type Horizon,
  type StudyPlan,
} from '@/lib/study-plan';
import { slotColor, type Tag } from '@/lib/types';

const days = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 0, name: 'Sunday' },
];

export default function PlannerPage() {
  const saved = useStudyPlan();
  const [draft, setDraft] = useState<StudyPlan>(saved.plan);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [mode, setMode] = useState<'routine' | 'allocate'>('routine');
  useEffect(() => {
    let active = true;
    fetchTags()
      .then((rows) => {
        if (active) {
          setTags(rows);
          setLoadError('');
        }
      })
      .catch(() => {
        if (active) setLoadError('Your subjects could not load. Try again to allocate time.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  function update(patch: Partial<StudyPlan>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setMessage('');
    setSaveError('');
  }
  const problem = planError(draft);
  const selected = draft.subjects.filter((s) => tags.some((t) => t.id === s.id));
  let allocation: number[] = [];
  let allocationError = '';
  try {
    allocation = allocateMinutes(
      draft.availableMinutes,
      draft.breakMinutes,
      selected.map((s) => s.weight),
    );
  } catch (e) {
    allocationError = (e as Error).message;
  }
  function save() {
    const failure = saved.save({ ...draft, subjects: selected });
    setSaveError(failure ?? '');
    setMessage(failure ? '' : 'Plan saved on this browser. Your Today workspace is updated.');
  }
  function reset() {
    const failure = saved.reset();
    if (failure) setSaveError(failure);
    else {
      setDraft(defaultPlan());
      setMessage('Saved plan reset.');
      setSaveError('');
    }
  }
  return (
    <Page className="planner-page">
      <PageHeader
        title="Make room for learning."
        description="A little time, with a little intention. See where it can take you."
      >
        <button
          className="btn btn-accent"
          disabled={!!problem || loading || !!loadError}
          onClick={save}
        >
          Save plan
        </button>
      </PageHeader>
      <div className="planner-tabs" role="group" aria-label="Planning tools">
        <button
          className={mode === 'routine' ? 'selected' : ''}
          aria-pressed={mode === 'routine'}
          onClick={() => setMode('routine')}
        >
          Build a routine
        </button>
        <button
          className={mode === 'allocate' ? 'selected' : ''}
          aria-pressed={mode === 'allocate'}
          onClick={() => setMode('allocate')}
        >
          Allocate my time
        </button>
      </div>
      {mode === 'routine' && loadError && (
        <StateMessage title={loadError} error>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setLoading(true);
              setAttempt((v) => v + 1);
            }}
          >
            Retry subjects
          </button>
        </StateMessage>
      )}
      {mode === 'routine' ? (
        <div className="planner-layout">
          <section className="suite-card planner-inputs" aria-labelledby="routine-title">
            <p className="eyebrow">01 / Your rhythm</p>
            <h2 id="routine-title">Small sessions. Lasting progress.</h2>
            <label className="form-label" htmlFor="daily-minutes">
              Study minutes per day
            </label>
            <div className="number-with-unit">
              <input
                id="daily-minutes"
                className="form-control"
                type="number"
                min="1"
                max="720"
                step="1"
                value={Number.isNaN(draft.dailyMinutes) ? '' : draft.dailyMinutes}
                onChange={(e) => update({ dailyMinutes: e.target.valueAsNumber })}
              />
              <span>minutes</span>
            </div>
            <fieldset className="weekday-field">
              <legend>Study days</legend>
              <div className="weekday-picker">
                {days.map((day) => (
                  <button
                    type="button"
                    key={day.id}
                    aria-label={day.name}
                    aria-pressed={draft.weekdays.includes(day.id)}
                    onClick={() =>
                      update({
                        weekdays: draft.weekdays.includes(day.id)
                          ? draft.weekdays.filter((d) => d !== day.id)
                          : [...draft.weekdays, day.id],
                      })
                    }
                  >
                    {day.name.slice(0, 2)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <label>
                Start date
                <input
                  className="form-control"
                  type="date"
                  min="2000-01-01"
                  max="2100-12-31"
                  value={draft.startDate}
                  onChange={(e) => update({ startDate: e.target.value })}
                />
              </label>
              <label>
                Custom end date
                <input
                  className="form-control"
                  type="date"
                  min={draft.startDate}
                  max="2100-12-31"
                  value={draft.endDate}
                  onChange={(e) => update({ endDate: e.target.value })}
                />
              </label>
            </div>
            <p className="field-hint">
              Custom ranges include both dates. Month and year projections start on your chosen
              date.
            </p>
          </section>
          <section className="projection-panel" aria-labelledby="projection-title">
            <p className="eyebrow">02 / The bigger picture</p>
            <h2 id="projection-title">Look how it adds up.</h2>
            <div className="projection-grid" aria-live="polite">
              {(['week', 'month', 'year', 'custom'] as Horizon[]).map((horizon) => {
                try {
                  const result = projectRoutine(
                    draft.dailyMinutes,
                    draft.weekdays,
                    draft.startDate,
                    horizon,
                    draft.endDate,
                  );
                  return (
                    <div key={horizon} className={`projection-item projection-${horizon}`}>
                      <span>{horizon === 'custom' ? 'Your date range' : `In one ${horizon}`}</span>
                      <strong>{formatMinutes(result.minutes)}</strong>
                      <small>{result.days} study days</small>
                    </div>
                  );
                } catch (e) {
                  return (
                    <div key={horizon} className="projection-item">
                      <span>{horizon === 'custom' ? 'Your date range' : `In one ${horizon}`}</span>
                      <p className="text-danger">{(e as Error).message}</p>
                    </div>
                  );
                }
              })}
            </div>
            <p className="projection-note">
              Planned time, not recorded study. Real calendar dates include leap years; rest days
              are excluded.
            </p>
          </section>
        </div>
      ) : (
        <div className="planner-layout">
          <section className="suite-card planner-inputs" aria-labelledby="allocation-title">
            <p className="eyebrow">01 / Your time budget</p>
            <h2 id="allocation-title">What can you fit in?</h2>
            <div className="form-grid">
              <label>
                Available minutes
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  max="1440"
                  value={Number.isNaN(draft.availableMinutes) ? '' : draft.availableMinutes}
                  onChange={(e) => update({ availableMinutes: e.target.valueAsNumber })}
                />
              </label>
              <label>
                Break minutes
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  max={draft.availableMinutes || 1440}
                  value={Number.isNaN(draft.breakMinutes) ? '' : draft.breakMinutes}
                  onChange={(e) => update({ breakMinutes: e.target.valueAsNumber })}
                />
              </label>
            </div>
            <p className="field-hint">
              Include all breaks in the break budget. Everything left goes to studying.
            </p>
            <h3 className="section-title">Choose your subjects</h3>
            <p className="field-hint">
              Higher priority receives more time. Equal priorities split time evenly.
            </p>
            {loading ? (
              <StateMessage title="Loading subjects…" />
            ) : loadError ? (
              <StateMessage title={loadError} error>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setLoading(true);
                    setAttempt((v) => v + 1);
                  }}
                >
                  Retry subjects
                </button>
              </StateMessage>
            ) : !tags.length ? (
              <StateMessage title="Add your first subject">
                <Link to="/subjects">Create a subject</Link> to divide your study time.
              </StateMessage>
            ) : (
              <div className="allocation-subjects">
                {tags.map((tag) => {
                  const item = selected.find((s) => s.id === tag.id);
                  return (
                    <div className="allocation-subject" key={tag.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!item}
                          onChange={() =>
                            update({
                              subjects: item
                                ? draft.subjects.filter((s) => s.id !== tag.id)
                                : [...draft.subjects, { id: tag.id, weight: 1 }],
                            })
                          }
                        />
                        <span className="recent-dot" style={{ background: slotColor(tag.color) }} />
                        {tag.name}
                      </label>
                      {item && (
                        <label className="priority-field">
                          Priority
                          <input
                            aria-label={`${tag.name} priority`}
                            type="number"
                            className="form-control"
                            min="1"
                            max="10"
                            value={Number.isNaN(item.weight) ? '' : item.weight}
                            onChange={(e) =>
                              update({
                                subjects: draft.subjects.map((s) =>
                                  s.id === tag.id ? { ...s, weight: e.target.valueAsNumber } : s,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="projection-panel" aria-labelledby="split-title">
            <p className="eyebrow">02 / Your study mix</p>
            <h2 id="split-title">Give every minute a place.</h2>
            {allocationError ? (
              <StateMessage error title={allocationError} />
            ) : (
              <>
                <div className="allocation-total">
                  <strong>{formatMinutes(draft.availableMinutes - draft.breakMinutes)}</strong>
                  <span>available for study · {formatMinutes(draft.breakMinutes)} of breaks</span>
                </div>
                {!selected.length ? (
                  <StateMessage title="Choose a subject to get started">
                    Your time will be divided here as you select subjects.
                  </StateMessage>
                ) : (
                  <ol className="study-agenda">
                    {selected.map((item, i) => {
                      const tag = tags.find((t) => t.id === item.id)!;
                      return (
                        <li key={item.id}>
                          <span className="agenda-number">{String(i + 1).padStart(2, '0')}</span>
                          <div>
                            <strong>{tag.name}</strong>
                            <div className="allocation-track">
                              <span
                                style={{
                                  width: `${draft.availableMinutes > draft.breakMinutes ? (allocation[i] / (draft.availableMinutes - draft.breakMinutes)) * 100 : 0}%`,
                                  background: slotColor(tag.color),
                                }}
                              />
                            </div>
                          </div>
                          <span>{formatMinutes(allocation[i])}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <p className="projection-note">
                  An editable estimate. Starting the timer records what you actually study; it does
                  not automatically complete this plan.
                </p>
                <Link className="btn btn-ghost" to="/dashboard">
                  Go to Today →
                </Link>
              </>
            )}
          </section>
        </div>
      )}
      <div className="planner-save">
        <div>
          <strong>Your plan, ready when you return.</strong>
          <p>Saved on this browser for your account. It does not sync across devices.</p>
        </div>
        <button className="btn btn-ghost" onClick={reset}>
          Reset saved plan
        </button>
      </div>
      {problem && (
        <p className="text-danger" role="alert">
          {problem}
        </p>
      )}
      {saveError && (
        <p className="text-danger" role="alert">
          {saveError}
        </p>
      )}
      {message && (
        <p className="save-feedback" role="status">
          {message}
        </p>
      )}
    </Page>
  );
}
