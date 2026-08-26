import { useState } from 'react';
import { formatTotal } from '@/lib/time';
import { slotColor } from '@/lib/types';
import type { DayTotal, TagTotal } from '@/lib/summary';

const DAY_INITIAL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Daily totals, stacked by tag — shows consistency and drift.
 *
 * Columns because the axis is time and reading left-to-right is the point.
 * Empty days are drawn as empty columns rather than skipped: a gap is the
 * signal in a consistency chart, and dropping it would silently compress the
 * timeline.
 *
 * Heights are relative to the tallest day in the range, so the scale is honest
 * within a range but not comparable across ranges — hence the axis label.
 */
export function DailyTrend({ days, legend }: { days: DayTotal[]; legend: TagTotal[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const max = Math.max(...days.map((d) => d.seconds), 1);
  const tracked = days.filter((d) => d.seconds > 0).length;

  return (
    <figure className="chart-figure mb-0">
      <figcaption className="chart-title">
        Daily total
        <span className="chart-subtitle">
          {tracked} of {days.length} days tracked · peak {formatTotal(max)}
        </span>
      </figcaption>

      <div className="trend-plot" role="img" aria-label={`Daily tracked time across ${days.length} days`}>
        {days.map((day, i) => {
          const key = day.date.getTime();
          const isHovered = hovered === key;

          return (
            <div
              key={key}
              className={`trend-col${isHovered ? ' hovered' : ''}`}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(key)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
            >
              {isHovered && day.seconds > 0 && (
                <div className="trend-tooltip">
                  <div className="fw-semibold mb-1">
                    {day.date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                  {day.segments.map((s) => (
                    <div key={s.tagId ?? 'none'} className="trend-tooltip-row">
                      <span className="legend-dot" style={{ background: slotColor(s.slot) }} />
                      <span className="flex-grow-1">{s.name}</span>
                      <span className="fw-semibold">{formatTotal(s.seconds)}</span>
                    </div>
                  ))}
                  <div className="trend-tooltip-total">Total {formatTotal(day.seconds)}</div>
                </div>
              )}

              <div className="trend-stack" style={{ height: `${(day.seconds / max) * 100}%` }}>
                {/* Bottom-up so the largest segment sits on the baseline. */}
                {[...day.segments].reverse().map((s) => (
                  <div
                    key={s.tagId ?? 'none'}
                    className="trend-seg"
                    style={{
                      height: `${(s.seconds / day.seconds) * 100}%`,
                      background: slotColor(s.slot),
                    }}
                  />
                ))}
              </div>

              <span className="trend-label">
                {days.length > 14 ? (i % 5 === 0 ? day.date.getDate() : '') : DAY_INITIAL[(day.date.getDay() + 6) % 7]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Identity is never colour-alone: a legend is present whenever more than
          one series is stacked. */}
      {legend.length > 1 && (
        <ul className="chart-legend list-unstyled">
          {legend.map((t) => (
            <li key={t.tagId ?? 'none'}>
              <span className="legend-dot" style={{ background: slotColor(t.slot) }} />
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
