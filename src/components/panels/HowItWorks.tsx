import { Link } from 'react-router';
import { InfoPanel, PanelSteps } from './InfoPanel';
import { LightbulbIcon } from '@/components/icons';

/**
 * The stopwatch explainer. Content only — the closeable behaviour lives in
 * InfoPanel, so a second panel is just another file like this one.
 *
 * Kept deliberately terse: nobody reads a wall of text sitting next to a button
 * they already understand. One line per step, one line of philosophy.
 */
export function HowItWorks() {
  return (
    <InfoPanel
      id="how-it-works"
      title="A ledger, not a focus timer"
      subtitle="The point isn’t finishing a session — it’s knowing where the hours went."
      icon={<LightbulbIcon size={16} />}
      collapsedLabel="How Tracksesh works"
    >
      <PanelSteps
        steps={[
          {
            title: 'Start when you begin.',
            body: ' Counts up, no target. Paused time never counts.',
          },
          {
            title: 'Stop, then label it.',
            body: ' The label is the point — a duration alone tells you nothing next month.',
          },
          {
            title: 'Forgot? Backfill it.',
            body: (
              <>
                {' '}
                <strong>+ Add time</strong> on{' '}
                <Link to="/activity" className="link-accent">
                  Activity
                </Link>
                . Typed-in time counts the same.
              </>
            ),
          },
        ]}
      />

      <p className="panel-note mb-0">
        One tag per block, so totals match the hours you actually lived. No streaks, no goals — an
        empty day is a fine answer.
      </p>
    </InfoPanel>
  );
}
