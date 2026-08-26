import type { Metadata, Viewport } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@/styles/globals.scss';
import '@/styles/navbar.scss';
import '@/styles/auth.scss';
import '@/styles/dashboard.scss';
import '@/styles/activity.scss';
import '@/styles/tags.scss';
import '@/styles/account.scss';

import { Navbar } from '@/components/Navbar';
import { themeBootScript } from '@/components/ThemeProvider';
import { createClient } from '@/lib/supabase/server';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Tracksesh',
  description: 'Track where your time actually goes.',
  icons: { icon: '/TS.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the session on the server so the navbar renders in its signed-in
  // state on first paint instead of flashing "Sign in".
  // If Supabase is unreachable or unconfigured we render logged-out rather
  // than 500-ing the whole app — the dashboard works for guests anyway.
  let initialUser: { id: string; email: string } | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) initialUser = { id: user.id, email: user.email };
  } catch {
    initialUser = null;
  }

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers initialUser={initialUser}>
          <div className="app-shell">
            <Navbar />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
