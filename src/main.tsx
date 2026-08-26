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

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
