"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { logout as apiLogout, me, type CurrentUser } from "@/lib/api/auth";
import { tokenStore } from "@/lib/api/token";

interface AuthContextValue {
  user: CurrentUser;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthGuard>.");
  return value;
}

/**
 * Guards the workspace: requires a token, verifies it with /auth/me, and
 * redirects to /login (preserving the current path) on any 401.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const toLogin = useCallback(() => {
    const { pathname, search } = window.location;
    router.replace(`/login?next=${encodeURIComponent(pathname + search)}`);
  }, [router]);

  useEffect(() => {
    let active = true;
    if (!tokenStore.get()) {
      toLogin();
      return;
    }
    me()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          tokenStore.clear();
          toLogin();
        } else {
          setUnreachable(true);
        }
      });
    // Any 401 elsewhere clears the token; send the user back to sign in.
    const unsubscribe = tokenStore.subscribe((token) => {
      if (token === null && active) toLogin();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [toLogin]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* the token is cleared by apiLogout regardless */
    }
    router.replace("/login");
  }, [router]);

  const value = useMemo(() => (user ? { user, logout } : null), [user, logout]);

  if (!value) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8">
        {unreachable ? (
          <p role="alert" className="text-sm text-destructive">
            Could not verify your session. Is the API running?
          </p>
        ) : (
          <Skeleton
            className="h-24 w-72"
            role="status"
            aria-label="Checking your session"
          />
        )}
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
