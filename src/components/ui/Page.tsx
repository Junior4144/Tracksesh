import type { ReactNode } from 'react';

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <main id="main-content" className={`page ${className}`}>
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-heading">
        <p className="eyebrow">Your time, accounted for</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function StateMessage({
  title,
  children,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`state-message${error ? ' state-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      <p className="fw-semibold mb-1">{title}</p>
      {children && <div className="text-muted small">{children}</div>}
    </div>
  );
}
