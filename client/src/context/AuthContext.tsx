import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./useAuth";
import {
  api,
  clearAuth,
  getStoredTokens,
  getStoredUser,
  restoreSession,
  storeAuth,
  type User,
} from "../api/client";

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
    // Without a stored session, loading already starts false (initialLoadingState).
    if (!getStoredTokens()) return;
    // State is set in the promise callbacks, once the session check answers.
    restoreSession()
      .then(setUser)
      .catch(() => {
        // restoreSession clears auth for 401 responses only; keep the stored user otherwise.
      })
      .finally(() => setLoading(false));
  }, []);

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

