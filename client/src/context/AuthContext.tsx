import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  api,
  clearAuth,
  getStoredTokens,
  getStoredUser,
  restoreSession,
  storeAuth,
  type User,
} from "../api/client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    contact?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function initialLoadingState(): boolean {
  // Always revalidate stored tokens before rendering protected routes.
  return !!getStoredTokens();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [loading, setLoading] = useState(initialLoadingState);

  const refreshUser = useCallback(async () => {
    const me = await restoreSession();
    setUser(me);
  }, []);

  useEffect(() => {
    const tokens = getStoredTokens();
    if (!tokens) {
      setLoading(false);
      return;
    }

    refreshUser()
      .catch(() => {
        // refreshUser handles auth clearing for 401 responses only.
      })
      .finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, remember = true) => {
    clearAuth();
    const data = await api.login({ email, password });
    storeAuth(data, remember);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      displayName: string;
      contact?: string;
    }) => {
      clearAuth();
      const data = await api.register(input);
      storeAuth(data);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    const tokens = getStoredTokens();
    clearAuth();
    setUser(null);

    if (tokens?.refreshToken) {
      try {
        await api.logout({
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
        });
      } catch {
        // Session already cleared locally; ignore server errors.
      }
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
