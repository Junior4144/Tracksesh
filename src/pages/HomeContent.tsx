import { useState } from 'react';
import { Link } from 'react-router';
import { Page } from '@/components/ui/Page';
import { formatMinutes } from '@/lib/study-plan';
import { PlayIcon, ListCheckIcon, BarChartIcon } from '@/components/icons';
import '@/styles/home.scss';

export default function HomeContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [minutes, setMinutes] = useState(20);
  return (
    <Page className="landing-page">
      <section className="landing-hero" aria-labelledby="home-title">
        <p className="landing-kicker">
          <span /> Your study time tracker and planner
        </p>
        <h1 id="home-title">
          Track your study time.
          <br />
          <em>Find your focus.</em>
        </h1>
        <p className="landing-description">
          Plan time for each subject, record focused study sessions, and review your actual effort.
          <br className="landing-desktop-break" /> A study workspace for students and independent learners.
        </p>
        <div className="landing-actions">
          <Link className="btn btn-accent" to={isLoggedIn ? '/dashboard' : '/register'}>
            {isLoggedIn ? 'Open workspace' : 'Get started'} <span aria-hidden="true">↗</span>
          </Link>
          <Link className="landing-text-link" to={isLoggedIn ? '/planner' : '/register#demo'}>
            {isLoggedIn ? 'Explore the planner' : 'Try the demo'} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="landing-caption">
          {isLoggedIn ? 'Plan a little. Focus a little. Go a little further.' : 'Free account. Or explore with the demo sign-in on the next page.'}
          {!isLoggedIn && <> Already have an account? <Link to="/login">Sign in</Link>.</>}
        </p>
      </section>

      <section className="landing-preview" aria-labelledby="preview-title">
        <div className="preview-topline">
          <span className="preview-wordmark">
            Tracksesh <span>/ your study space</span>
          </span>
          <span className="preview-example">Illustrative workspace</span>
        </div>
        <div className="preview-heading">
          <div>
            <p className="preview-eyebrow">LESS SCATTERED. MORE FOCUSED.</p>
            <h2 id="preview-title">A place to begin again.</h2>
          </div>
          <span className="preview-date">Your pace. Your progress.</span>
        </div>
        <div className="preview-grid">
          <div className="preview-focus">
            <div className="preview-card-label">
              <span>IN YOUR OWN TIME</span>
              <span className="preview-ready">Ready to begin</span>
            </div>
            <div className="preview-clock">
              00<span>:</span>00
            </div>
            <p>One thing at a time is enough.</p>
            <Link to={isLoggedIn ? '/dashboard' : '/register'} className="preview-start">
              <PlayIcon aria-hidden="true" /> Find your focus
            </Link>
            <div className="preview-focus-footer">
              <span>Count up. Take breaks.</span>
              <span>Make it yours.</span>
            </div>
          </div>
          <div className="preview-subjects">
            <div className="preview-card-label">
              <span>A LITTLE ROOM FOR LEARNING</span>
              <ListCheckIcon size={18} aria-hidden="true" />
            </div>
            <h3>Your study mix</h3>
            <p className="preview-subtitle">Three subjects. One manageable plan.</p>
            <ul>
              {[
                {
                  name: 'Learn a language',
                  detail: 'A few new words',
                  time: '20 min',
                  letter: 'Aa',
                  color: 'lilac',
                },
                {
                  name: 'Understand the world',
                  detail: 'One chapter at a time',
                  time: '30 min',
                  letter: '↗',
                  color: 'sage',
                },
                {
                  name: 'Practice something new',
                  detail: 'Keep your curiosity going',
                  time: '25 min',
                  letter: '✳',
                  color: 'peach',
                },
              ].map((subject) => (
                <li key={subject.name}>
                  <span className={`subject-tile ${subject.color}`} aria-hidden="true">
                    {subject.letter}
                  </span>
                  <div>
                    <strong>{subject.name}</strong>
                    <small>{subject.detail}</small>
                  </div>
                  <span className="preview-subject-time">{subject.time}</span>
                </li>
              ))}
            </ul>
            <p className="preview-example-note">
              Example allocation · 75 minutes of study + 15 minutes of breaks
            </p>
          </div>
        </div>
      </section>

      <section className="landing-potential" aria-labelledby="potential-title">
        <div className="potential-copy">
          <p className="eyebrow">Small is a great place to start</p>
          <h2 id="potential-title">
            See what a little
            <br />
            consistency can do.
          </h2>
          <label htmlFor="daily-preview">
            Just <strong>{minutes} minutes</strong> a day
          </label>
          <input
            id="daily-preview"
            type="range"
            min="5"
            max="120"
            step="5"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
          <div className="range-endpoints">
            <span>5 min</span>
            <span>120 min</span>
          </div>
        </div>
        <div className="potential-results" aria-live="polite">
          <div>
            <span>In 30 days</span>
            <strong>{formatMinutes(minutes * 30)}</strong>
            <small>Room to build a habit.</small>
          </div>
          <div>
            <span>In 365 days</span>
            <strong>{formatMinutes(minutes * 365)}</strong>
            <small>Imagine what you could explore.</small>
          </div>
          <p>
            Illustrative planned time, assuming you study every day. Your actual sessions are
            tracked separately.
          </p>
        </div>
      </section>

      <section className="landing-features" aria-label="Your connected study suite">
        {[
          {
            icon: ListCheckIcon,
            title: 'Plan study time by subject.',
            text: 'Choose the days and minutes you can study. Divide available time between subjects after allowing for breaks.',
          },
          {
            icon: PlayIcon,
            title: 'Track focused study sessions.',
            text: 'Start the count-up timer, pause for breaks, and label your subject when you stop. Paused time is excluded from your recorded effort.',
          },
          {
            icon: BarChartIcon,
            title: 'Review your actual study hours.',
            text: 'See recorded effort across days, weeks and subjects. Add missed sessions by hand, then use your history to adjust your next plan.',
          },
        ].map(({ icon: Icon, title, text }, i) => (
          <article key={title}>
            <div className="feature-top">
              <Icon size={23} aria-hidden="true" />
              <span>0{i + 1}</span>
            </div>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className="landing-guide" aria-labelledby="study-workflow">
        <h2 id="study-workflow">From a study plan to hours you can account for</h2>
        <p>
          For example, set aside 90 minutes: 20 for a language, 30 for reading,
          25 for practice, and 15 for breaks. Track each session and choose its subject
          when you finish. If reading takes 25 minutes, your history records 25, not the
          30 you planned. This is an example, not a promise about learning outcomes.
        </p>
        <h2>Questions about tracking your study time</h2>
        <details>
          <summary>Is this a Pomodoro timer?</summary>
          <p>Tracksesh uses a count-up timer. You decide when to pause or stop; it does not enforce a 25-minute focus period.</p>
        </details>
        <details>
          <summary>Can I record study time I forgot to track?</summary>
          <p>Yes. Add a session manually with its time, subject and optional note. You can review and edit it in Insights.</p>
        </details>
        <details>
          <summary>Where are my plans and study sessions saved?</summary>
          <p>Plans are saved in the browser where you create them, separately for each account. Recorded sessions are saved to your account and can be reviewed when you sign in on another device.</p>
        </details>
        <details>
          <summary>Can I explore before creating an account?</summary>
          <p>Yes. The <Link to="/register#demo">registration page</Link> includes demo sign-in details. The workspace requires signing in with your own account or the demo account.</p>
        </details>
      </section>
      <footer className="landing-footer">
        <span>
          Tracksesh <span>/ a home for your learning</span>
        </span>
        <span>Good things take a little time.</span>
      </footer>
    </Page>
  );
}
