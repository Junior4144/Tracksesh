'use client';

import type { ReactNode } from 'react';
import { useDismissed } from '@/lib/useDismissed';
import { XIcon } from '@/components/icons';

/**
 * A closeable explainer panel. The reusable half of the pattern — write a new
 * one by rendering this with a fresh `id` and whatever content you like:
 *
 *   <InfoPanel id="tags-explainer" title="Why tag your time?" icon={<TagIcon />}>
 *     …
 *   </InfoPanel>
 *
 * Dismissal is remembered per id, so panels are independent and adding one
 * never re-opens another. Closing is never destructive: a dismissed panel
 * collapses to a small button that brings it straight back, because a user who
 * closes the instructions on day one may well want them on day three.
 */
export function InfoPanel({
  id,
  title,
  subtitle,
  icon,
  collapsedLabel,
  children,
}: {
  /** Stable, unique — this is the localStorage key. */
  id: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Text on the button shown once closed. Defaults to the title. */
  collapsedLabel?: string;
  children: ReactNode;
}) {
  const { dismissed, dismiss, restore } = useDismissed(id);

  if (dismissed) {
    return (
      <button type="button" className="panel-restore" onClick={restore}>
        {icon}
        <span>{collapsedLabel ?? title}</span>
      </button>
    );
  }

  return (
    <section className="info-panel card-surface" aria-labelledby={`${id}-title`}>
      <header className="info-panel-head">
        {icon && <span className="info-panel-icon">{icon}</span>}

        <div className="flex-grow-1">
          <h2 id={`${id}-title`} className="info-panel-title">
            {title}
          </h2>
          {subtitle && <p className="info-panel-subtitle">{subtitle}</p>}
        </div>

        <button
          type="button"
          className="info-panel-close"
          onClick={dismiss}
          aria-label={`Close ${title}`}
          title="Close — you can reopen this any time"
        >
          <XIcon size={14} />
        </button>
      </header>

      <div className="info-panel-body">{children}</div>
    </section>
  );
}

/** Numbered steps, for panels that explain a flow. */
export function PanelSteps({ steps }: { steps: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="panel-steps">
      {steps.map((step, i) => (
        <li key={step.title}>
          <span className="panel-step-number" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <strong className="panel-step-title">{step.title}</strong>
            <span className="panel-step-body">{step.body}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
