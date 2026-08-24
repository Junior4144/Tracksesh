'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import {
  NOT_CONFIGURED_MESSAGE,
  createClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';

export interface User {
  id: string;
  email: string;
}

export interface AuthResult {
  error: string | null;
  /** Sign-up succeeded but Supabase requires email confirmation before sign-in. */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  user: User | null;
  isLoggedIn: boolean;
  /** Email prefix, capitalised — e.g. "demo@tracksesh.com" -> "Demo". */
  displayName: string | null;
  /** False until the initial session lookup resolves. */
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toUser(u: SupabaseUser | null | undefined): User | null {
  if (!u?.email) return null;
  return { id: u.id, email: u.email };
}

export function AuthProvider({
  initialUser = null,
  children,
}: {
  initialUser?: User | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = useMemo(() => (isSupabaseConfigured() ? createClient() : null), []);
  const [user, setUser] = useState<User | null>(initialUser);
  // Nothing to wait for when Supabase isn't wired up.
  const [ready, setReady] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(toUser(data.user));
      setReady(true);
    });

    // Fires on sign-in, sign-out and token refresh — including refreshes
    // driven by middleware in another tab.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      setUser(toUser(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED_MESSAGE };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message || 'Invalid credentials. Please try again.' };
      // Re-run server components so middleware/layout see the new cookies.
      router.refresh();
      return { error: null };
    },
    [supabase, router]
  );

  const register = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED_MESSAGE };
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message || 'Registration failed. Please try again.' };
      // With "Confirm email" on (the Supabase default) sign-up returns no
      // session — the user has to click the emailed link before signing in.
      if (!data.session) return { error: null, needsConfirmation: true };
      router.refresh();
      return { error: null };
    },
    [supabase, router]
  );

  const logout = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    router.push('/login');
    router.refresh();
  }, [supabase, router]);

  const displayName = useMemo(() => {
    const prefix = user?.email?.split('@')[0];
    if (!prefix) return null;
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        displayName,
        ready,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
