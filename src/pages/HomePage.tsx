import { Link } from 'react-router';
import { useAuth } from '@/components/AuthProvider';
import { Page } from '@/components/ui/Page';
import '@/styles/home.scss';

const example = [
  { name: 'Reading', note: 'A chapter before work', time: '35m', color: 'blue' },
  { name: 'Studying', note: 'Making sense of something new', time: '1h 20m', color: 'aqua' },
  { name: 'Exercise', note: 'An afternoon outside', time: '45m', color: 'violet' },
];

export default function HomePage() {
  const { isLoggedIn } = useAuth();
  return (
    <Page className="home-page">
      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-copy">
          <p className="eyebrow">Your time, accounted for</p>
          <h1 id="home-title">
            A clearer picture
            <br />
            of your day.
          </h1>
          <p className="home-description">
            The reading, the work, the things you make time for. Tracksesh is a simple time ledger
            that helps you see where your hours went.
          </p>
          <div className="page-actions">
            <Link className="btn btn-accent" to={isLoggedIn ? '/dashboard' : '/register'}>
              {isLoggedIn ? 'Open timer' : 'Get started'}
            </Link>
            <Link className="btn btn-ghost" to={isLoggedIn ? '/activity' : '/login'}>
              {isLoggedIn ? 'View activity' : 'Sign in'}
            </Link>
          </div>
          <p className="home-note">No targets to hit. Just time to understand.</p>
        </div>

        <section className="home-ledger" aria-labelledby="example-title">
          <div className="section-heading">
            <h2 id="example-title" className="section-title">
              A day, in perspective
            </h2>
            <span className="text-muted small">Example</span>
          </div>
          <div className="home-total">
            <strong>2h 40m</strong>
            <span>Time accounted for</span>
          </div>
          <ul className="list-unstyled mb-0">
            {example.map((entry) => (
              <li className="home-entry" key={entry.name}>
                <span
                  className="legend-dot"
                  style={{ background: `var(--series-${entry.color})` }}
                />
                <div>
                  <strong>{entry.name}</strong>
                  <p>{entry.note}</p>
                </div>
                <span className="home-duration">{entry.time}</span>
              </li>
            ))}
          </ul>
          <p className="home-ledger-note">Small sessions. A more complete picture.</p>
        </section>
      </section>

      <section className="home-workflow" aria-labelledby="workflow-title">
        <div className="section-heading">
          <h2 id="workflow-title" className="section-title">
            From doing to understanding
          </h2>
          <span className="text-muted small">Three simple steps</span>
        </div>
        <ol className="panel-steps">
          <li>
            <span className="panel-step-number">01</span>
            <div>
              <strong className="panel-step-title">Start with what you’re doing.</strong>Let the
              stopwatch run. Pause when you need a break; paused time stays out of your totals.
            </div>
          </li>
          <li>
            <span className="panel-step-number">02</span>
            <div>
              <strong className="panel-step-title">Give the time a name.</strong>Stop, choose a tag,
              and add a note. Forgot to track? Add the time afterwards.
            </div>
          </li>
          <li>
            <span className="panel-step-number">03</span>
            <div>
              <strong className="panel-step-title">See how it adds up.</strong>Explore your day,
              week, or month. Review your sessions and make corrections whenever you need.
            </div>
          </li>
        </ol>
      </section>
      <footer className="home-footer">
        <span>Tracksesh</span>
        <span>A little more perspective on your time.</span>
      </footer>
    </Page>
  );
}
