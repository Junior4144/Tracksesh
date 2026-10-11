import { Link } from 'react-router';
import { useAuth } from '@/components/AuthProvider';
import { Page } from '@/components/ui/Page';
import '@/styles/home.scss';

export default function HomePage() {
  const { isLoggedIn } = useAuth();
  return (
    <Page className="home-page">
      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-copy">
          <p className="eyebrow">A home for your learning</p>
          <h1 id="home-title">
            Small sessions.
            <br />
            Bigger possibilities.
          </h1>
          <p className="home-description">
            Make room for what you want to learn. Plan your study time, settle into a session, and
            see your effort take shape — all in one quiet workspace.
          </p>
          <div className="page-actions">
            <Link className="btn btn-accent" to={isLoggedIn ? '/dashboard' : '/register'}>
              {isLoggedIn ? 'Open workspace' : 'Get started'}
            </Link>
            <Link className="btn btn-ghost" to={isLoggedIn ? '/planner' : '/login'}>
              {isLoggedIn ? 'Explore the planner' : 'Sign in'}
            </Link>
          </div>
          <p className="home-note">Your subjects. Your rhythm. A little progress, every day.</p>
        </div>
        <section className="home-ledger" aria-labelledby="example-title">
          <div className="section-heading">
            <h2 id="example-title" className="section-title">
              A little time goes a long way.
            </h2>
            <span className="text-muted small">Example</span>
          </div>
          <div className="home-total">
            <strong>20 minutes a day</strong>
            <span>A daily routine, starting April 1, 2026</span>
          </div>
          <ul className="list-unstyled mb-0">
            {[
              { name: 'One week', note: '7 study days', time: '2h 20m', color: 'blue' },
              { name: 'One month', note: '30 study days', time: '10h', color: 'aqua' },
              { name: 'One year', note: '365 study days', time: '121h 40m', color: 'violet' },
            ].map((entry) => (
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
          <p className="home-ledger-note">
            Illustrative planned time. Your recorded sessions tell the real story.
          </p>
        </section>
      </section>
      <section className="home-workflow" aria-labelledby="workflow-title">
        <div className="section-heading">
          <h2 id="workflow-title" className="section-title">
            Everything you need to find your rhythm.
          </h2>
          <span className="text-muted small">One connected workspace</span>
        </div>
        <ol className="panel-steps">
          <li>
            <span className="panel-step-number">01</span>
            <div>
              <strong className="panel-step-title">Make a little room.</strong>Choose study days,
              explore your monthly potential, and divide available time between your subjects.
            </div>
          </li>
          <li>
            <span className="panel-step-number">02</span>
            <div>
              <strong className="panel-step-title">Give it your attention.</strong>Start the timer,
              pause for a break, and label what you studied when you finish. Manual entries are
              welcome too.
            </div>
          </li>
          <li>
            <span className="panel-step-number">03</span>
            <div>
              <strong className="panel-step-title">See your effort add up.</strong>Review your
              recorded sessions by subject, day, week or month. Adjust your routine as life changes.
            </div>
          </li>
        </ol>
      </section>
      <footer className="home-footer">
        <span>Tracksesh / Study suite</span>
        <span>A little more intentional.</span>
      </footer>
    </Page>
  );
}
