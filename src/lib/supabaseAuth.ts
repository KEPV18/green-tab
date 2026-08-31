/**
 * Green Tab — Supabase Auth Integration
 *
 * Replaces localStorage-based auth with Supabase Auth.
 * User data (monthly performance, tickets, settings) remains in localStorage,
 * keyed by the Supabase user ID.
 *
 * After signup, a profile row is created in the `profiles` table.
 * Sign-in uses Supabase Auth email/password.
 * Session is managed by Supabase (JWT tokens, auto-refresh).
 */

import { createClient, Session, User, SupabaseClient } from "@supabase/supabase-js";
import { readJSON, writeJSON, getUserById } from "./store";

// ─── Supabase Client ──────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let supabaseInstance: SupabaseClient | null = null;

export function getAuthClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseInstance;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
  session: Session | null;
}

// ─── Helper: Map Supabase User → AuthUser ──────────────────────────────────────

function mapUser(user: User): AuthUser {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: meta.display_name ?? meta.displayName ?? meta.full_name ?? null,
    createdAt: user.created_at,
  };
}

// ─── Sign Up ────────────────────────────────────────────────────────────────────

/**
 * Sign up a new user with Supabase Auth.
 * Creates a profile row in the `profiles` table.
 * Falls back to localStorage auth if Supabase is not configured.
 */
export async function signUp(
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResult> {
  // If Supabase is not configured, fall back to local auth
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return localSignUp(email, password, displayName);
  }

  const supabase = getAuthClient();

  // Generate a username from displayName or email prefix
  // Must match ^[A-Za-z0-9_]{3,20}$ constraint in Supabase profiles table
  const rawUsername = (displayName || email.split("@")[0]).replace(/[^A-Za-z0-9_]/g, "_").substring(0, 20);
  const username = rawUsername.length < 3 ? rawUsername + "_00" : rawUsername;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || null,
        username,
      },
    },
  });

  if (error) {
    // Map common Supabase errors to user-friendly messages
    if (error.message.includes("already registered") || error.message.includes("already exists")) {
      return { user: null, error: "This email is already registered", session: null };
    }
    return { user: null, error: error.message, session: null };
  }

  // If Supabase returns a user but no session, email confirmation is required
  if (data.user && !data.session) {
    // Auto-confirm for local dev: we still return user info
    // The user will need to confirm their email before signing in
    return {
      user: mapUser(data.user),
      error: null,
      session: null,
    };
  }

  if (!data.user) {
    return { user: null, error: "Signup failed — no user returned", session: null };
  }

  // Sync to localStorage store for backward compat
  syncUserToLocalStore(mapUser(data.user));

  return {
    user: mapUser(data.user),
    error: null,
    session: data.session,
  };
}

// ─── Sign In ────────────────────────────────────────────────────────────────────

/**
 * Sign in an existing user with Supabase Auth.
 * Falls back to localStorage auth if Supabase auth fails
 * (e.g. user not found in Supabase, network error, etc.)
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  // If Supabase is not configured, fall back to local auth immediately
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return localSignIn(email, password);
  }

  const supabase = getAuthClient();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // If Supabase auth fails, try local auth as fallback
      // This handles: users who signed up locally, network errors, etc.
      if (
        error.message.includes("Invalid login credentials") ||
        error.message.includes("email_not_confirmed") ||
        error.message.includes("Email not confirmed")
      ) {
        // For "Invalid credentials" — user may have a local-only account
        // For "Email not confirmed" — try local fallback in case they have a local account
        const localResult = localSignIn(email, password);
        if (!localResult.error) {
          return localResult;
        }
        // If local auth also failed, return the original Supabase error
      }

      if (error.message.includes("email_not_confirmed") || error.message.includes("Email not confirmed")) {
        return { user: null, error: "Please confirm your email first — check your inbox for the confirmation link.", session: null };
      }

      // Try local auth as fallback for any other Supabase error
      const localResult = localSignIn(email, password);
      if (!localResult.error) {
        return localResult;
      }

      return { user: null, error: error.message, session: null };
    }

    if (!data.user) {
      return { user: null, error: "Login failed — no user returned", session: null };
    }

    // Sync to localStorage store for backward compat
    syncUserToLocalStore(mapUser(data.user));

    return {
      user: mapUser(data.user),
      error: null,
      session: data.session,
    };
  } catch (err) {
    // Network error or Supabase unavailable — fall back to local auth
    const localResult = localSignIn(email, password);
    if (!localResult.error) {
      return localResult;
    }
    return { user: null, error: err instanceof Error ? err.message : "Network error", session: null };
  }
}

// ─── Sign Out ────────────────────────────────────────────────────────────────────

/**
 * Sign out the current user.
 * Clears both Supabase session and localStorage session.
 */
export async function signOutUser(): Promise<void> {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = getAuthClient();
    await supabase.auth.signOut();
  }

  // Also clear local session
  try {
    localStorage.removeItem("gt_session");
  } catch {}
}

// ─── Get Session ────────────────────────────────────────────────────────────────

/**
 * Get the current session.
 * Checks Supabase first, then falls back to localStorage.
 */
export async function getCurrentSession(): Promise<{
  user: AuthUser | null;
  session: Session | null;
} | null> {
  // Try Supabase first
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = getAuthClient();
    const { data } = await supabase.auth.getSession();

    if (data.session?.user) {
      const authUser = mapUser(data.session.user);
      syncUserToLocalStore(authUser);
      return { user: authUser, session: data.session };
    }
  }

  // Fall back to localStorage session
  const localSession = readJSON<{
    userId: string;
    email: string;
    displayName: string | null;
    loggedInAt: string;
  } | null>("session", null);

  if (!localSession) return null;

  const localUser = getUserById(localSession.userId);
  if (!localUser) return null;

  return {
    user: {
      id: localUser.id,
      email: localUser.email,
      displayName: localUser.displayName,
      createdAt: localUser.createdAt,
    },
    session: null,
  };
}

// ─── Auth State Listener ─────────────────────────────────────────────────────────

/**
 * Subscribe to auth state changes (login, logout, token refresh).
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null, session: Session | null) => void
): () => void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // No Supabase: listen for localStorage changes instead
    const handler = (e: StorageEvent) => {
      if (e.key?.startsWith("gt_") || e.key === null) {
        getCurrentSession().then((result) => {
          callback(result?.user ?? null, result?.session ?? null);
        });
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }

  const supabase = getAuthClient();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      const authUser = mapUser(session.user);
      syncUserToLocalStore(authUser);
      callback(authUser, session);
    } else {
      callback(null, null);
    }
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

// ─── Sync: Ensure Supabase user exists in localStorage store ─────────────────────

/**
 * After Supabase login/signup, ensure the user exists in the localStorage
 * users array so that `getUserById()` and other local store functions work.
 */
function syncUserToLocalStore(user: AuthUser): void {
  const users = readJSON<
    Array<{
      id: string;
      email: string;
      displayName: string | null;
      createdAt: string;
      passwordHash?: string;
    }>
  >("users", []);

  const existing = users.find((u) => u.id === user.id);
  if (!existing) {
    users.push({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
      passwordHash: "", // Supabase manages passwords
    });
    writeJSON("users", users);
  } else {
    // Update display name if changed
    if (user.displayName && existing.displayName !== user.displayName) {
      existing.displayName = user.displayName;
      writeJSON("users", users);
    }
  }

  // Also write a session entry for backward compat
  writeJSON("session", {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    loggedInAt: new Date().toISOString(),
  });
}

// ─── Local Auth Fallback ─────────────────────────────────────────────────────────

/**
 * Fallback: Sign up using localStorage only (when Supabase is not configured).
 */
function localSignUp(email: string, password: string, displayName?: string): AuthResult {
  // Use inline local signup logic (same as store.ts but we avoid circular deps)
  const users = readJSON<
    Array<{
      id: string;
      email: string;
      displayName: string | null;
      createdAt: string;
      passwordHash: string;
    }>
  >("users", []);
  const existing = users.find((u) => u.email === email);

  if (existing) {
    return {
      user: { id: existing.id, email: existing.email, displayName: existing.displayName, createdAt: existing.createdAt },
      error: "This email is already registered",
      session: null,
    };
  }

  // Simple hash (same as store.ts)
  function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const chr = input.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return hash.toString(36);
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    displayName: displayName ?? null,
    passwordHash: simpleHash(password),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeJSON("users", users);

  const sessionObj = { userId: user.id, email: user.email, displayName: user.displayName, loggedInAt: new Date().toISOString() };
  writeJSON("session", sessionObj);

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    error: null,
    session: null,
  };
}

/**
 * Fallback: Sign in using localStorage only (when Supabase is not configured).
 */
function localSignIn(email: string, password: string): AuthResult {
  function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const chr = input.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return hash.toString(36);
  }

  const users = readJSON<
    Array<{
      id: string;
      email: string;
      displayName: string | null;
      createdAt: string;
      passwordHash: string;
    }>
  >("users", []);
  const user = users.find((u) => u.email === email);

  if (!user) {
    return { user: null, error: "Invalid login credentials", session: null };
  }

  if (user.passwordHash !== simpleHash(password)) {
    return { user: null, error: "Invalid login credentials", session: null };
  }

  const sessionObj = { userId: user.id, email: user.email, displayName: user.displayName, loggedInAt: new Date().toISOString() };
  writeJSON("session", sessionObj);

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    error: null,
    session: null,
  };
}