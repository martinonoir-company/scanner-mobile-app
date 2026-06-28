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
  DispatchOrder,
  MovementBatchLine,
  MovementBatchResult,
  PosSession,
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

  // ── Dispatch ──

  /** Paginated dispatch queue: shipping orders needing branch pickup. */
  async fetchDispatchQueue(params: {
    page?: number;
    dispatchStatus?: string;
    search?: string;
  } = {}) {
    const q = new URLSearchParams();
    q.set('page', String(params.page ?? 1));
    q.set('limit', '20');
    if (params.dispatchStatus) q.set('dispatchStatus', params.dispatchStatus);
    if (params.search?.trim()) q.set('search', params.search.trim());
    return this.request<{
      data: {
        items: DispatchOrder[];
        total: number;
        page: number;
        limit: number;
        pages: number;
      };
    }>(`/orders/dispatch-queue?${q.toString()}`);
  }

  /** Mark an order DISPATCHED by its barcode value (order number or id). */
  async markOrderDispatched(ref: string, note?: string) {
    return this.request<{ data: DispatchOrder }>(
      `/orders/dispatch-scan/${encodeURIComponent(ref)}`,
      { method: 'POST', body: JSON.stringify({ note }) },
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

  // ── Inventory movements (batch — restock / returns) ──

  /**
   * Submit a batch of stock movements in ONE server-side transaction:
   * all lines succeed or all roll back. Per-line idempotency via the
   * `clientLineId` UUID — resubmitting the same batch returns those
   * lines as DEDUPLICATED with no extra stock change.
   *
   * Throws an ApiError on a 4xx (e.g. 409 when an ADJUSTMENT line would
   * drive a variant below zero — the whole batch is rejected).
   */
  async recordMovementsBatch(lines: MovementBatchLine[]) {
    return this.request<{ data: MovementBatchResult }>(
      '/inventory/movements/batch',
      {
        method: 'POST',
        body: JSON.stringify({ lines }),
      },
    );
  }

  // ── Refunds (returns with refund-request creation) ──

  /**
   * Resolve an order by its order number for the "Which order?" screen
   * at the start of the returns flow. The cashier scans / types the
   * order number from the receipt; this returns the items so we can
   * match each scanned variant against the original sale.
   */
  async lookupOrderForReturn(orderNumber: string) {
    return this.request<{
      data: {
        id: string;
        orderNumber: string;
        channel: 'STOREFRONT' | 'MOBILE' | 'POS' | 'ADMIN';
        status: string;
        grandTotal: number;
        currency: string;
        customerName?: string | null;
        customerPhone?: string | null;
        paidAt?: string | null;
        items: Array<{
          id: string;
          variantId: string;
          productName: string;
          variantName?: string;
          sku: string;
          quantity: number;
          unitPrice: number;
        }>;
      };
    }>(`/refunds/order-lookup/${encodeURIComponent(orderNumber)}`);
  }

  async listBanks() {
    return this.request<{ data: Array<{ name: string; code: string }> }>(
      '/refunds/banks',
    );
  }

  async verifyBankAccount(input: { accountNumber: string; bankCode: string }) {
    return this.request<{
      data: { ok: true; accountName: string } | { ok: false; error: string };
    }>('/refunds/verify-bank-account', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Submit a return-with-refund. Server writes the RETURN stock movements
   * AND a refund_request row in one transaction. The shape mirrors the
   * batch endpoint so the existing batch UI is reused on the wire.
   */
  async submitRefundRequest(input: {
    orderId: string;
    lines: Array<{
      clientLineId: string;
      variantId: string;
      quantity: number;
      orderItemId?: string;
      reasonCode?: string;
      reasonNote?: string;
    }>;
    warehouseCode?: string;
    reason?: string;
    posCashRefund?: boolean;
    bankDetails?: {
      bankCode: string;
      accountNumber: string;
      accountName: string;
    };
    /** Custom refund total in minor units. Required when lines is empty. */
    customAmount?: number;
  }) {
    return this.request<{
      data: {
        id: string;
        amount: number;
        currency: string;
        itemsCount: number;
        status: string;
        method: string;
      };
    }>('/refunds', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  // ── POS sessions (checkout — item capture only) ──
  //
  // The scanner is an item-capture device: it opens a session, adds/edits
  // items, and flips it to AWAITING_PAYMENT ("ready for payment"). It does
  // NOT call confirm — payment + completion happen on the POS web app.
  // Every mutation carries the optimistic-concurrency `version`; a stale
  // version returns 409 SESSION_VERSION_CONFLICT with the current value.

  /** Open (or join) the session on a terminal. Idempotent. */
  async openPosSession(terminalCode: string, currency?: 'NGN' | 'USD') {
    return this.request<{ data: PosSession }>(
      `/pos-sessions/${encodeURIComponent(terminalCode)}/open`,
      {
        method: 'POST',
        body: JSON.stringify(currency ? { currency } : {}),
      },
    );
  }

  /** Fetch the current open session for a terminal (404 if none). */
  async getPosSession(terminalCode: string) {
    return this.request<{ data: PosSession }>(
      `/pos-sessions/${encodeURIComponent(terminalCode)}`,
    );
  }

  /** Add a scanned line. `clientLineId` is the idempotency key. */
  async addPosSessionItem(
    terminalCode: string,
    body: {
      clientLineId: string;
      variantId: string;
      quantity: number;
      version: number;
    },
  ) {
    return this.request<{ data: PosSession }>(
      `/pos-sessions/${encodeURIComponent(terminalCode)}/items`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** Update a line's quantity (0 removes it). */
  async updatePosSessionItem(
    terminalCode: string,
    lineId: string,
    body: { quantity: number; version: number },
  ) {
    return this.request<{ data: PosSession }>(
      `/pos-sessions/${encodeURIComponent(terminalCode)}/items/${encodeURIComponent(lineId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }

  /** Snapshot totals and flip the session to AWAITING_PAYMENT. */
  async posSessionPaymentIntent(
    terminalCode: string,
    body: { version: number },
  ) {
    return this.request<{ data: PosSession }>(
      `/pos-sessions/${encodeURIComponent(terminalCode)}/payment-intent`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** Cancel the basket. Allowed while ACTIVE; the cashier handles voids
   *  once it's AWAITING_PAYMENT (the scanner hides the button by then). */
  async voidPosSession(
    terminalCode: string,
    body: { version: number; reason?: string },
  ) {
    return this.request<{ data: PosSession }>(
      `/pos-sessions/${encodeURIComponent(terminalCode)}/void`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  }
}

export const api = new ApiClient();
