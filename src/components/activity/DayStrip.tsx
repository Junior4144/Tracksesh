'use client';

import { useState } from 'react';
import { blockDuration, formatClock, formatTotal } from '@/lib/time';
import { slotColor, type TimeBlockWithTag } from '@/lib/types';
import { addDays, startOfDay } from '@/lib/summary';

const HOUR_MARKS = [0, 3, 6, 9, 12, 15, 18, 21];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One day laid out on a 24-hour track — shows *when* the work happened, which
 * a totals chart can't.
 *
 * Overlapping blocks are drawn as lanes rather than rejected. The ledger allows
 * overlap on purpose (you can be on a call while commuting), so the view has to
 * render it honestly instead of hiding one of them.
 */
export function DayStrip({
  day,
  blocks,
  onSelect,
}: {
  day: Date;
  blocks: TimeBlockWithTag[];
  /** Opens the block for editing — the strip is where a misplaced one is spotted. */
  onSelect?: (block: TimeBlockWithTag) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();

  // Clip to the day so a block running past midnight draws to the edge rather
  // than overflowing the track.
  const placed = blocks
    .filter((b) => b.ended_at)
    .map((b) => {
      const start = Math.max(Date.parse(b.started_at), dayStart);
      const end = Math.min(Date.parse(b.ended_at!), dayEnd);
      return { block: b, start, end };
    })
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start);

  // Greedy lane packing: a block goes in the first lane whose last block ended
  // before it started.
  const laneEnds: number[] = [];
  const withLanes = placed.map((p) => {
    let lane = laneEnds.findIndex((end) => end <= p.start);
    if (lane === -1) {
      laneEnds.push(p.end);
      lane = laneEnds.length - 1;
    } else {
      laneEnds[lane] = p.end;
    }
    return { ...p, lane };
  });

  const laneCount = Math.max(laneEnds.length, 1);

  return (
    <figure className="chart-figure mb-0">
      <figcaption className="chart-title">
        When
        <span className="chart-subtitle">
          {day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </figcaption>

      <div className="day-strip">
        <div className="day-strip-track" style={{ height: `${laneCount * 34}px` }}>
          {HOUR_MARKS.map((h) => (
            <div key={h} className="day-strip-gridline" style={{ left: `${(h / 24) * 100}%` }} />
          ))}

          {withLanes.map(({ block, start, end, lane }) => {
            const left = ((start - dayStart) / DAY_MS) * 100;
            const width = ((end - start) / DAY_MS) * 100;

            return (
              <div
                key={block.id}
                className={`day-block${hovered === block.id ? ' hovered' : ''}${onSelect ? ' selectable' : ''}`}
                style={{
                  left: `${left}%`,
                  width: `max(${width}%, 3px)`,
                  top: `${lane * 34}px`,
                  background: slotColor(block.tag?.color),
                }}
                onMouseEnter={() => setHovered(block.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(block.id)}
                onBlur={() => setHovered(null)}
                onClick={onSelect && (() => onSelect(block))}
                onKeyDown={
                  onSelect &&
                  ((e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(block);
                    }
                  })
                }
                role={onSelect ? 'button' : undefined}
                tabIndex={0}
                title={
                  onSelect
                    ? `${block.tag?.name ?? 'Unlabelled'} · ${formatClock(block.started_at)}–${formatClock(block.ended_at!)} — click to edit`
                    : `${block.tag?.name ?? 'Unlabelled'} · ${formatClock(block.started_at)}–${formatClock(block.ended_at!)}`
                }
              >
                <span className="day-block-label">{block.tag?.name ?? 'Unlabelled'}</span>

                {hovered === block.id && (
                  <div className="day-block-tooltip">
                    <div className="fw-semibold">{block.tag?.name ?? 'Unlabelled'}</div>
                    <div className="text-muted small">
                      {formatClock(block.started_at)}–{formatClock(block.ended_at!)} ·{' '}
                      {formatTotal(blockDuration(block))}
                    </div>
                    {block.note && <div className="small mt-1">{block.note}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="day-strip-axis">
          {HOUR_MARKS.map((h) => (
            <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
