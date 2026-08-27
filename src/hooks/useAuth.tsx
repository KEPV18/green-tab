import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { getSession, signOut as signOutLocal, LocalUser, getUserById } from "@/lib/store";

interface AuthContextType {
  user: LocalUser | null;
  session: { userId: string } | null;
  isLoading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [session, setSession] = useState<{ userId: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const existingSession = getSession();
    if (existingSession) {
      const localUser = getUserById(existingSession.userId);
      setSession({ userId: existingSession.userId });
      setUser(localUser);
    }
    setIsLoading(false);
  }, []);

  // Listen for storage events to sync auth state across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith("gt_") || e.key === null) {
        const existingSession = getSession();
        if (existingSession) {
          const localUser = getUserById(existingSession.userId);
          setSession({ userId: existingSession.userId });
          setUser(localUser);
        } else {
          setSession(null);
          setUser(null);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleSignOut = () => {
    signOutLocal();
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