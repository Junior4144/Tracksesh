import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/components/AuthProvider';
import { Page } from '@/components/ui/Page';
import { formatMinutes } from '@/lib/study-plan';
import { PlayIcon, ListCheckIcon, BarChartIcon } from '@/components/icons';
import '@/styles/home.scss';

export default function HomePage() {
  const { isLoggedIn } = useAuth();
  const [minutes, setMinutes] = useState(20);
  return (
    <Page className="landing-page">
      <section className="landing-hero" aria-labelledby="home-title">
        <p className="landing-kicker">
          <span /> A little more intentional
        </p>
        <h1 id="home-title">
          Make time for your
          <br />
          <em>next big thing.</em>
        </h1>
        <p className="landing-description">
          The language you want to speak. The exam you want to ace.
          <br className="landing-desktop-break" /> Give your learning a home, one focused session at
          a time.
        </p>
        <div className="landing-actions">
          <Link className="btn btn-accent" to={isLoggedIn ? '/dashboard' : '/register'}>
            {isLoggedIn ? 'Open workspace' : 'Get started'} <span aria-hidden="true">↗</span>
          </Link>
          <Link className="landing-text-link" to={isLoggedIn ? '/planner' : '/login'}>
            {isLoggedIn ? 'Explore the planner' : 'Sign in'} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="landing-caption">Plan a little. Focus a little. Go a little further.</p>
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
            title: 'A plan that fits your life.',
            text: 'Start with the time you have. Split it between subjects and leave room for breaks.',
          },
          {
            icon: PlayIcon,
            title: 'Space to settle in.',
            text: 'A simple timer for focused sessions. Pause when you need to, and pick up where you left off.',
          },
          {
            icon: BarChartIcon,
            title: 'Progress you can see.',
            text: 'Look back at your recorded effort. Find your rhythm across days, weeks and subjects.',
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
      <footer className="landing-footer">
        <span>
          Tracksesh <span>/ a home for your learning</span>
        </span>
        <span>Good things take a little time.</span>
      </footer>
    </Page>
  );
}
