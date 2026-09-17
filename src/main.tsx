import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'bootstrap/dist/css/bootstrap.min.css';
import '@/styles/globals.scss';
import '@/styles/navbar.scss';
import '@/styles/auth.scss';
import '@/styles/dashboard.scss';
import '@/styles/activity.scss';
import '@/styles/tags.scss';
import '@/styles/account.scss';
import '@/styles/admin.scss';

import { App } from './App';
import { authCallbackPath } from '@/lib/auth-links';

// Handle emailed links before a guest/auth guard can discard their fragment.
const callback = authCallbackPath(new URL(window.location.href));
if (callback) window.history.replaceState(null, '', callback);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
