/**
 * Martino Noir Scanner — API Client
 *
 * Mirrors user-mobile-app/src/lib/api.ts so token-refresh, single-flight
 * locking, and request shape stay consistent across the family of apps.
 *
 * Scanner-specific notes:
 *  - Default base URL points at production (https://api.martinonoir.com).
 *    Override via app.json > expo.extra.apiUrl for local dev.
 *  - Endpoint surface is intentionally narrow at PR #8 — auth and
 *    /branches only. Variant lookup, inventory writes, dispatch, etc.
 *    will be added in their respective PRs.
 */
import Constants from 'expo-constants';
import { tokenStore } from './token-store';
import {
  ApiError,
  AuthResponse,
  Branch,
  StockLevel,
  StockLevelRaw,
  Terminal,
  VariantLookup,
} from './api-types';

const API_BASE =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'https://api.martinonoir.com/api/v1';

type OnUnauthorized = () => void;

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshInFlight: Promise<boolean> | null = null;
  private onUnauthorized: OnUnauthorized | null = null;

  setTokens(access: string | null, refresh: string | null) {
    this.accessToken = access;
    this.refreshToken = refresh;
  }

  setOnUnauthorized(fn: OnUnauthorized | null) {
    this.onUnauthorized = fn;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    isRetry = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (
      response.status === 401 &&
      !isRetry &&
      this.refreshToken &&
      !path.startsWith('/auth/')
    ) {
      const refreshed = await this.ensureRefreshed();
      if (refreshed) {
        return this.request<T>(path, options, true);
      }
      this.onUnauthorized?.();
    }

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        statusCode: response.status,
        message: response.statusText,
        error: 'Network Error',
        correlationId: 'unknown',
      }));
      throw error;
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return undefined as T;
    return response.json();
  }

  /**
   * Single-flight refresh. Concurrent callers share the same in-flight
   * promise so we never hit /auth/refresh more than once per cycle.
   */
  private ensureRefreshed(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const rt = this.refreshToken;
    if (!rt) return Promise.resolve(false);

    this.refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { data: AuthResponse };
        this.accessToken = body.data.accessToken;
        this.refreshToken = body.data.refreshToken;
        await tokenStore.save(body.data.accessToken, body.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  // ── Auth ──

  async login(email: string, password: string) {
    return this.request<{ data: AuthResponse }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async refresh(refreshToken: string) {
    return this.request<{ data: AuthResponse }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(refreshToken: string) {
    return this.request<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  // ── Branches (read-only for staff) ──

  async listBranches() {
    return this.request<{ data: Branch[] }>('/branches');
  }

  async getBranch(id: string) {
    return this.request<{ data: Branch }>(`/branches/${id}`);
  }

  async listTerminals(branchId: string) {
    return this.request<{ data: Terminal[] }>(`/branches/${branchId}/terminals`);
  }

  // ── Variant lookup (scanner) ──

  /**
   * Resolve a scanned barcode to a variant. Throws an ApiError with
   * statusCode 404 when no active variant matches.
   */
  async lookupVariantByBarcode(code: string) {
    const encoded = encodeURIComponent(code);
    return this.request<{ data: VariantLookup }>(
      `/products/variants/by-barcode/${encoded}`,
    );
  }

  /** Resolve a SKU to a variant. 404 when no active variant matches. */
  async lookupVariantBySku(code: string) {
    const encoded = encodeURIComponent(code);
    return this.request<{ data: VariantLookup }>(
      `/products/variants/by-sku/${encoded}`,
    );
  }

  // ── Stock levels ──

  /**
   * Current stock for a variant at a warehouse. Returns a normalised
   * StockLevel (available computed client-side). If the server returns
   * null (no stock-level row), this resolves to a zeroed StockLevel so
   * callers never have to null-check.
   */
  async getStockLevel(
    variantId: string,
    warehouseCode?: string,
  ): Promise<StockLevel> {
    const qs = warehouseCode
      ? `?warehouse=${encodeURIComponent(warehouseCode)}`
      : '';
    const res = await this.request<{ data: StockLevelRaw | null }>(
      `/inventory/levels/${encodeURIComponent(variantId)}${qs}`,
    );
    const raw = res.data;
    if (!raw) {
      return {
        variantId,
        warehouseCode: warehouseCode ?? 'DEFAULT',
        onHand: 0,
        reserved: 0,
        available: 0,
      };
    }
    return {
      variantId: raw.variantId,
      warehouseCode: raw.warehouseCode,
      onHand: raw.onHand,
      reserved: raw.reserved,
      available: raw.onHand - raw.reserved,
    };
  }
}

export const api = new ApiClient();
