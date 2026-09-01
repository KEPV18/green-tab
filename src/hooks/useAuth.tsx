import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import {
  AuthUser,
  getCurrentSession,
  onAuthStateChange,
  signOutUser,
} from "@/lib/supabaseAuth";
import { Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Check for existing session on mount
    getCurrentSession().then((result) => {
      if (result?.user) {
        setUser(result.user);
        setSession(result.session);
      }
      setIsLoading(false);
      initializedRef.current = true;
    });

    // Listen for auth state changes (Supabase or localStorage)
    // Debounce rapid auth events to prevent navigation loops
    const unsubscribe = onAuthStateChange((authUser, authSession) => {
      // Only process auth changes after initial load
      if (!initializedRef.current) return;

      setUser(authUser);
      setSession(authSession);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await signOutUser();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};