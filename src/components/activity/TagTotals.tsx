'use client';

import { formatTotal } from '@/lib/time';
import { slotColor } from '@/lib/types';
import type { TagTotal } from '@/lib/summary';

/**
 * Time per tag — the headline "where did my time go" answer.
 *
 * Horizontal bars because the job is comparing magnitudes across a handful of
 * named categories, and horizontal gives the names room to be read without
 * rotating them. Sorted largest first, so rank is positional and doesn't
 * depend on colour.
 *
 * Every row is directly labelled with its tag name and total. That is what
 * discharges the palette validator's light-mode contrast warning: identity and
 * value are carried by text, and the colour is only a secondary cue.
 */
export function TagTotals({ totals }: { totals: TagTotal[] }) {
  if (totals.length === 0) return null;

  const max = Math.max(...totals.map((t) => t.seconds));

  return (
    <figure className="chart-figure mb-0">
      <figcaption className="chart-title">Time per tag</figcaption>

      <ul className="tag-totals list-unstyled mb-0">
        {totals.map((t) => (
          <li key={t.tagId ?? 'none'} className="tag-total-row">
            <span className="tag-total-name" title={t.name}>
              {t.name}
            </span>

            <span className="tag-total-track">
              <span
                className="tag-total-bar"
                style={{
                  width: `${max === 0 ? 0 : (t.seconds / max) * 100}%`,
                  background: slotColor(t.slot),
                }}
              />
            </span>

            <span className="tag-total-value">{formatTotal(t.seconds)}</span>
            <span className="tag-total-share">{Math.round(t.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
