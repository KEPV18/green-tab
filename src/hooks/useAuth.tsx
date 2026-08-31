import { useState, useEffect, createContext, useContext, ReactNode } from "react";
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

  useEffect(() => {
    // Check for existing session on mount
    getCurrentSession().then((result) => {
      if (result?.user) {
        setUser(result.user);
        setSession(result.session);
      }
      setIsLoading(false);
    });

    // Listen for auth state changes (Supabase or localStorage)
    const unsubscribe = onAuthStateChange((authUser, authSession) => {
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