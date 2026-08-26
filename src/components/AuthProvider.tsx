import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { NOT_CONFIGURED_MESSAGE, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { deleteAccount as deleteAccountOnServer } from '@/lib/blocks';

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
  /** Sends the recovery email. Never reports whether the address exists. */
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  /**
   * Sets a new password. `currentPassword` is required when changing it from
   * the account page and omitted after a recovery link, where the emailed
   * token is what proved ownership.
   */
  updatePassword: (password: string, currentPassword?: string) => Promise<AuthResult>;
  /**
   * Deletes the account and everything in it, then signs out. Takes the
   * password so the server can refuse if it's wrong.
   */
  deleteAccount: (password: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toUser(u: SupabaseUser | null | undefined): User | null {
  if (!u?.email) return null;
  return { id: u.id, email: u.email };
}

/**
 * Who is signed in.
 *
 * Sign-in, sign-out and token refresh are Supabase Auth's job and always were.
 * What changed with the move to the .NET API is where the session lives: there
 * are no cookies and no server render to seed this from, so `ready` starts
 * false on every load and the route guards hold the page until the initial
 * lookup resolves. Rendering signed-out while that is in flight would bounce a
 * signed-in user to /login on every refresh.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const supabase = useMemo(() => (isSupabaseConfigured() ? getSupabase() : null), []);
  const [user, setUser] = useState<User | null>(null);
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

    // Fires on sign-in, sign-out and token refresh — including refreshes driven
    // by another tab, since both share the same storage key.
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
      return { error: null };
    },
    [supabase]
  );

  const register = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED_MESSAGE };
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message || 'Registration failed. Please try again.' };
      // With "Confirm email" on (the Supabase default) sign-up returns no
      // session — the user has to click the emailed link before signing in.
      if (!data.session) return { error: null, needsConfirmation: true };
      return { error: null };
    },
    [supabase]
  );

  const logout = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
    navigate('/login', { replace: true });
  }, [supabase, navigate]);

  /**
   * Supabase deliberately doesn't say whether an address has an account, so
   * neither does this — callers show the same "check your inbox" either way.
   * A per-address answer here would be a user-enumeration endpoint.
   *
   * No `redirectTo`: where the link lands is baked into the email template
   * (supabase/templates/recovery.html), which points at /auth/confirm with
   * `next=/account/update-password`.
   */
  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED_MESSAGE };
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      // Rate limiting is the one thing worth surfacing — silently swallowing it
      // would leave the user pressing a button that looks like it worked.
      if (error && error.status === 429) {
        return { error: 'Too many requests. Wait a minute and try again.' };
      }
      return { error: null };
    },
    [supabase]
  );

  /**
   * `currentPassword` is checked here, by signing in with it, rather than being
   * left to Supabase.
   *
   * Supabase does accept a `current_password` on `updateUser`, and it is passed
   * along below — but it is not reliably enforced. With
   * `secure_password_change` on, GoTrue's gate is session *recency*: a session
   * minted minutes ago satisfies it and the password changes whether or not the
   * supplied `current_password` was right. Verified against the local stack —
   * a deliberately wrong one still went through.
   *
   * So the check that actually protects the user is this one. Without it the
   * "confirm your current password" field on /account would be decoration, and
   * a session left open on a shared machine would be enough to lock its owner
   * out of their own account.
   *
   * Unlike account deletion, this one stays in the browser: changing a password
   * goes to Supabase Auth directly, so there is no request through the API for
   * a server-side check to attach to.
   */
  const updatePassword = useCallback(
    async (password: string, currentPassword?: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED_MESSAGE };

      if (currentPassword !== undefined) {
        const email = user?.email;
        if (!email) return { error: 'You need to be signed in to do that.' };

        const { error: wrong } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (wrong) return { error: 'That password is not correct.' };
      }

      const { error } = await supabase.auth.updateUser(
        currentPassword ? { password, current_password: currentPassword } : { password }
      );

      if (error) return { error: error.message || 'Could not update your password.' };
      return { error: null };
    },
    [supabase, user]
  );

  /**
   * Deletion happens on the server, which verifies the password against
   * Supabase Auth before erasing anything and then runs the SECURITY DEFINER
   * function that removes the auth user.
   *
   * That verification used to happen here, by re-signing-in, because a
   * publishable-key-only browser had no other way to check a password. It moved
   * because a check the client performs is a check the client can skip, and a
   * borrowed session should not be enough to destroy someone's ledger.
   *
   * Signing out afterwards still matters: deleting a user does not invalidate
   * access tokens already issued, so without it the browser would keep a valid
   * token for an account that no longer exists until it expired.
   */
  const deleteAccount = useCallback(
    async (password: string): Promise<AuthResult> => {
      if (!supabase) return { error: NOT_CONFIGURED_MESSAGE };

      try {
        await deleteAccountOnServer(password);
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Could not delete your account.' };
      }

      await supabase.auth.signOut();
      setUser(null);
      navigate('/login', { replace: true });
      return { error: null };
    },
    [supabase, navigate]
  );

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
        requestPasswordReset,
        updatePassword,
        deleteAccount,
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
