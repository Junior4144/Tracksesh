import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import HomeContent from './pages/HomeContent';

// Only public content is rendered at build time. No auth client, API or secrets.
// React replaces this preview when the interactive application starts.
export function renderHomepage() {
  return renderToString(
    <MemoryRouter initialEntries={['/']}>
      <div className="app-shell">
        <div className="workspace-content"><HomeContent /></div>
      </div>
    </MemoryRouter>,
  );
}
