/**
 * Auth context for the scanner app.
 *
 * Mirrors user-mobile-app's pattern (JWT in expo-secure-store, single-flight
 * refresh, periodic silent refresh, automatic logout on permanent 401).
 *
 * Scanner-specific:
 *  - Login REJECTS customer accounts. Only SUPER_ADMIN, COMPANY_SUPER_ADMIN,
 *    and COMPANY_STAFF may sign in here. This is enforced client-side AND
 *    on the server — the role guard here is a UX layer so the user sees a
 *    clear message instead of a generic 403.
 *  - No registration flow. Staff are admin-created.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from './api';
import { AuthResponse } from './api-types';
import { tokenStore } from './token-store';

export type StaffRole = 'SUPER_ADMIN' | 'COMPANY_SUPER_ADMIN' | 'COMPANY_STAFF';

const ALLOWED_ROLES: ReadonlySet<StaffRole> = new Set([
  'SUPER_ADMIN',
  'COMPANY_SUPER_ADMIN',
  'COMPANY_STAFF',
]);

export interface AuthUser {
  id: string;
  email: string;
  role: StaffRole;
  firstName?: string;
  lastName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function base64UrlDecode(input: string): string {
  const pad = input.length % 4;
  const padded = pad ? input + '='.repeat(4 - pad) : input;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof globalThis.atob === 'function') return globalThis.atob(base64);
  // Hermes/React Native lacks atob reliably in some configs — manual decode.
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < base64.length; ) {
    const a = chars.indexOf(base64.charAt(i++));
    const b = chars.indexOf(base64.charAt(i++));
    const c = chars.indexOf(base64.charAt(i++));
    const d = chars.indexOf(base64.charAt(i++));
    const triplet =
      (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);
    output += String.fromCharCode((triplet >> 16) & 0xff);
    if (c !== 64) output += String.fromCharCode((triplet >> 8) & 0xff);
    if (d !== 64) output += String.fromCharCode(triplet & 0xff);
  }
  return output;
}

function parseJwt(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    return JSON.parse(base64UrlDecode(parts[1]!));
  } catch {
    return {};
  }
}

function tokenToUser(token: string): AuthUser | null {
  const payload = parseJwt(token);
  const sub = payload['sub'] as string | undefined;
  const role = payload['role'] as string | undefined;
  if (!sub || !role) return null;
  if (!ALLOWED_ROLES.has(role as StaffRole)) return null;
  return {
    id: sub,
    email: (payload['email'] as string) ?? '',
    role: role as StaffRole,
    firstName: payload['firstName'] as string | undefined,
    lastName: payload['lastName'] as string | undefined,
  };
}

export class CustomerAccountRejected extends Error {
  constructor() {
    super(
      'This app is for staff only. Customer accounts cannot sign in here — please use the Martino Noir storefront app.',
    );
    this.name = 'CustomerAccountRejected';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const applyTokens = useCallback(
    async (access: string, refresh: string, hint?: Partial<AuthUser>) => {
      api.setTokens(access, refresh);
      await tokenStore.save(access, refresh);
      const parsed = tokenToUser(access);
      if (parsed) {
        setUser({ ...parsed, ...(hint ?? {}) });
      } else {
        setUser(null);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    clearRefreshTimer();
    const rt = api.getRefreshToken();
    if (rt) {
      // Fire-and-forget; never block UI on server-side session revoke.
      api.logout(rt).catch(() => {});
    }
    api.setTokens(null, null);
    await tokenStore.clear();
    setUser(null);
  }, []);

  // Hook api client → on permanent 401, nuke the local session.
  useEffect(() => {
    api.setOnUnauthorized(() => {
      void logout();
    });
    return () => api.setOnUnauthorized(null);
  }, [logout]);

  // Restore persisted session on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { accessToken, refreshToken } = await tokenStore.load();
      if (cancelled) return;
      if (accessToken && refreshToken) {
        api.setTokens(accessToken, refreshToken);
        const restored = tokenToUser(accessToken);
        if (restored) {
          setUser(restored);
        } else {
          // Persisted token belongs to a non-staff account (rare, e.g.
          // role got demoted server-side). Wipe.
          api.setTokens(null, null);
          await tokenStore.clear();
        }
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Periodic silent refresh — 12 min cadence for a 15-min access token TTL.
  useEffect(() => {
    clearRefreshTimer();
    if (!user) return;
    const id = setInterval(async () => {
      const rt = api.getRefreshToken();
      if (!rt) return;
      try {
        const result = await api.refresh(rt);
        await applyTokens(result.data.accessToken, result.data.refreshToken);
      } catch {
        await logout();
      }
    }, 12 * 60 * 1000);
    refreshTimerRef.current = id;
    return () => clearInterval(id);
  }, [user, applyTokens, logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password);
      const data: AuthResponse = result.data;

      // Role check: refuse customer accounts up front (server also refuses
      // to grant scanner-side permissions, but failing fast here gives a
      // clear message).
      if (!ALLOWED_ROLES.has(data.user.role as StaffRole)) {
        throw new CustomerAccountRejected();
      }

      await applyTokens(data.accessToken, data.refreshToken, {
        firstName: data.user.firstName,
        lastName: data.user.lastName,
      });
    },
    [applyTokens],
  );

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
