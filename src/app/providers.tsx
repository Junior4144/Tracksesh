'use client';

import { AuthProvider, type User } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TimerProvider } from '@/components/TimerProvider';

export function Providers({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider initialUser={initialUser}>
        <TimerProvider>{children}</TimerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
