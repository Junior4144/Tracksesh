import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TimerProvider } from '@/components/TimerProvider';
import { Navbar } from '@/components/Navbar';
import { AuthOnly, GuestOnly } from '@/routes/guards';

import DashboardPage from '@/pages/DashboardPage';
import ActivityPage from '@/pages/ActivityPage';
import TagsPage from '@/pages/TagsPage';
import AccountPage from '@/pages/AccountPage';
import UpdatePasswordPage from '@/pages/UpdatePasswordPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import AuthConfirmPage from '@/pages/AuthConfirmPage';
import LinkExpiredPage from '@/pages/LinkExpiredPage';

/**
 * Provider order is load-bearing.
 *
 * BrowserRouter is outermost because AuthProvider navigates (on sign-out, and
 * after the account is deleted). TimerProvider sits above the routes so a
 * running session survives navigation rather than restarting on every page —
 * the stopwatch lives in the database, but the cached copy of it lives here.
 */
export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <TimerProvider>
            <div className="app-shell">
              <Navbar />
              <AppRoutes />
            </div>
          </TimerProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Routes that read or write the ledger, so they need a user. */}
      <Route element={<AuthOnly />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/account" element={<AccountPage />} />
        {/*
          The recovery page is auth-only and lives under /account on purpose.
          By the time someone reaches it, /auth/confirm has already turned their
          emailed token into a session, so they *are* signed in — and reaching it
          without one means the link never verified, so there is nothing to
          change. Putting it under /login would have made it guest-only, which
          bounces every user who followed a reset link straight to the dashboard
          without resetting anything.
        */}
        <Route path="/account/update-password" element={<UpdatePasswordPage />} />
      </Route>

      {/* Routes a signed-in user should never see. */}
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      {/*
        Neither guarded: this is where an emailed link lands, and whether it
        produces a session is precisely what it is there to find out.
      */}
      <Route path="/auth/confirm" element={<AuthConfirmPage />} />
      <Route path="/auth/link-expired" element={<LinkExpiredPage />} />

      {/* Mirrors the Angular `{ path: '**', redirectTo: 'dashboard' }` catch-all. */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
