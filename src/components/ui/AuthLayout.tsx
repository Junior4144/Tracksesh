import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="auth-page">
      <aside className="auth-intro">
        <p className="eyebrow">Your study space</p>
        <h2>
          Make room for
          <br />
          what you want to learn.
        </h2>
        <p>Plan your time. Find your focus. Watch small study sessions add up.</p>
        <div className="auth-principles">
          <span>Plan intentionally</span>
          <span>Study at your pace</span>
        </div>
      </aside>
      <div className="auth-card">{children}</div>
    </main>
  );
}
