import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="auth-page">
      <aside className="auth-intro">
        <p className="eyebrow">A little more perspective</p>
        <h2>
          Make sense of
          <br />
          where your time goes.
        </h2>
        <p>Track a session. Give it a name. See the hours add up to something meaningful.</p>
        <div className="auth-principles">
          <span>Track simply</span>
          <span>Reflect clearly</span>
        </div>
      </aside>
      <div className="auth-card">{children}</div>
    </main>
  );
}
