import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ApiError, PosSession } from './api-types';
import { newClientLineId } from './ids';
import { PosSocketConnection } from './pos-socket';

/** Transient feedback after a scan attempt — drives a toast/banner. */
export type CheckoutScanFeedback =
  | { kind: 'added'; productName: string }
  | { kind: 'incremented'; productName: string; quantity: number }
  | { kind: 'not-found'; code: string }
  | { kind: 'error'; code: string; message: string }
  | null;

/** High-level checkout state machine the screen renders against. */
export type CheckoutPhase =
  /** Opening the session / joining the room. */
  | 'opening'
  /** Couldn't open (terminal busy with a different basket, network, etc.). */
  | 'open-failed'
  /** Building the basket — scanning items. */
  | 'building'
  /** Basket sent to the cashier; waiting for the POS to complete the sale. */
  | 'awaiting-payment'
  /** The cashier completed the sale — show the order number, then reset. */
  | 'completed'
  /** The basket was voided (by the scanner or the cashier). */
  | 'voided';

interface UseCheckoutSessionResult {
  phase: CheckoutPhase;
  /** The current server-side session (cart, version, status). */
  session: PosSession | null;
  /** Order number once the cashier completes the sale. */
  completedOrderNumber: string | null;
  /** Reason the basket was voided, if any. */
  voidedReason: string | null;
  /** Error message when phase === 'open-failed'. */
  openError: string | null;
  /** Live WS connection state. */
  connected: boolean;
  /** True while a scan lookup / mutation is in flight (pause the camera). */
  busy: boolean;
  /** Last scan outcome — clear via clearFeedback(). */
  feedback: CheckoutScanFeedback;
  clearFeedback: () => void;

  /** Resolve a scanned barcode and add it to the basket. */
  handleScan: (code: string) => void;
  /** Adjust a line's quantity (0 removes it). */
  setLineQuantity: (lineId: string, quantity: number) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  /** Flip the session to AWAITING_PAYMENT ("Ready for payment"). */
  readyForPayment: () => void;
  /** Cancel the basket (only meaningful while ACTIVE). */
  voidBasket: (reason?: string) => void;
  /** Re-attempt opening after an open-failed. */
  retryOpen: () => void;
  /** Start a fresh basket after completed/voided (opens a new session). */
  startNewBasket: () => void;
}

function errMessage(err: unknown): string {
  const apiErr = err as Partial<ApiError>;
  if (Array.isArray(apiErr?.message)) return apiErr.message[0] ?? 'Request failed';
  return (apiErr?.message as string | undefined) ?? 'Request failed';
}

/**
 * Owns the checkout session lifecycle for one terminal:
 *  - opens (or joins) the session, joins the WS room,
 *  - holds the cart + optimistic-concurrency version,
 *  - scans → resolve barcode → add item (idempotent on clientLineId,
 *    same-variant lines merged server-side),
 *  - qty edits, "ready for payment", void,
 *  - reconciles on WS events (the server is the source of truth — every
 *    event carries the fresh cart + version),
 *  - on a version conflict (409), refetches and the next attempt uses the
 *    fresh version,
 *  - on `session:confirmed` (the cashier completed the sale at the POS),
 *    moves to `completed` and surfaces the order number; on
 *    `session:voided`, moves to `voided`.
 *
 * The scanner never calls confirm — payment happens on the POS web app.
 */
export function useCheckoutSession(
  terminalCode: string,
  accessToken: string | null,
): UseCheckoutSessionResult {
  const [phase, setPhase] = useState<CheckoutPhase>('opening');
  const [session, setSession] = useState<PosSession | null>(null);
  const [completedOrderNumber, setCompletedOrderNumber] = useState<
    string | null
  >(null);
  const [voidedReason, setVoidedReason] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<CheckoutScanFeedback>(null);

  // Refs for things callbacks need synchronously without re-subscribing.
  const sessionRef = useRef<PosSession | null>(null);
  const connRef = useRef<PosSocketConnection | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const clearFeedback = useCallback(() => setFeedback(null), []);

  // ── Apply a server session snapshot ──
  const applySession = useCallback((s: PosSession) => {
    if (!mountedRef.current) return;
    setSession(s);
    sessionRef.current = s;
    if (s.status === 'AWAITING_PAYMENT') setPhase('awaiting-payment');
    else if (s.status === 'ACTIVE') setPhase('building');
    else if (s.status === 'COMPLETED') {
      setCompletedOrderNumber(s.resultOrderNumber ?? null);
      setPhase('completed');
    } else if (s.status === 'VOIDED') {
      setPhase('voided');
    }
  }, []);

  // ── Open / refetch ──
  const refetchSession = useCallback(async () => {
    try {
      const res = await api.getPosSession(terminalCode);
      applySession(res.data);
    } catch {
      // 404 here means the session was closed between events — leave the
      // last known state; the WS confirmed/voided event will have set the
      // terminal phase already.
    }
  }, [terminalCode, applySession]);

  const doOpen = useCallback(async () => {
    setPhase('opening');
    setOpenError(null);
    try {
      const res = await api.openPosSession(terminalCode);
      applySession(res.data);
    } catch (err) {
      if (mountedRef.current) {
        setOpenError(errMessage(err));
        setPhase('open-failed');
      }
    }
  }, [terminalCode, applySession]);

  // ── Socket wiring ──
  useEffect(() => {
    mountedRef.current = true;
    if (!accessToken) return;

    const conn = new PosSocketConnection(accessToken, terminalCode);
    connRef.current = conn;

    conn.onConnectionStateChange((c) => {
      if (mountedRef.current) setConnected(c);
    });
    conn.onSessionMutated((p) => {
      // Apply the fresh cart + version straight from the event.
      setSession((prev) =>
        prev ? { ...prev, cart: p.cart, version: p.version } : prev,
      );
    });
    conn.onPaymentIntent((p) => {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              cart: p.cart,
              version: p.version,
              status: 'AWAITING_PAYMENT',
            }
          : prev,
      );
      setPhase('awaiting-payment');
    });
    conn.onConfirmed((p) => {
      setCompletedOrderNumber(p.orderNumber || null);
      setSession((prev) =>
        prev
          ? { ...prev, version: p.version, status: 'COMPLETED', resultOrderId: p.orderId, resultOrderNumber: p.orderNumber }
          : prev,
      );
      setPhase('completed');
    });
    conn.onVoided((p) => {
      setVoidedReason(p.reason ?? null);
      setSession((prev) =>
        prev ? { ...prev, version: p.version, status: 'VOIDED' } : prev,
      );
      setPhase('voided');
    });
    conn.onReconnect(() => {
      void refetchSession();
    });
    conn.connect();

    // Open the session via REST (the WS room join happens on connect).
    void doOpen();

    return () => {
      mountedRef.current = false;
      conn.disconnect();
      connRef.current = null;
    };
    // We intentionally key this effect on terminalCode + accessToken only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalCode, accessToken]);

  // ── Mutations ──

  /**
   * Run a session mutation with optimistic-concurrency retry: on a 409
   * SESSION_VERSION_CONFLICT, refetch and retry ONCE with the fresh
   * version. Other errors surface as feedback.
   */
  const withVersionRetry = useCallback(
    async (
      doIt: (version: number) => Promise<{ data: PosSession }>,
      onSuccess?: (s: PosSession) => void,
      onError?: (msg: string) => void,
    ) => {
      const current = sessionRef.current;
      if (!current) return;
      const attempt = async (version: number, isRetry: boolean) => {
        try {
          const res = await doIt(version);
          applySession(res.data);
          onSuccess?.(res.data);
        } catch (err) {
          const apiErr = err as Partial<ApiError> & {
            currentVersion?: number;
          };
          const isConflict =
            apiErr?.statusCode === 409 ||
            (typeof apiErr?.message === 'string' &&
              apiErr.message.includes('SESSION_VERSION_CONFLICT'));
          if (isConflict && !isRetry) {
            await refetchSession();
            const fresh = sessionRef.current;
            if (fresh) await attempt(fresh.version, true);
            return;
          }
          onError?.(errMessage(err));
        }
      };
      await attempt(current.version, false);
    },
    [applySession, refetchSession],
  );

  const handleScan = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || inFlightRef.current) return;
      if (sessionRef.current?.status !== 'ACTIVE') return;

      // Client-side dedupe: same barcode already in the cart → just bump
      // its qty (server merges same-variant lines too, but this avoids a
      // round-trip).
      const existing = sessionRef.current.cart.items.find(
        (l) => l.barcode === trimmed,
      );
      if (existing) {
        inFlightRef.current = true;
        setBusy(true);
        void withVersionRetry(
          (version) =>
            api.updatePosSessionItem(terminalCode, existing.clientLineId, {
              quantity: existing.quantity + 1,
              version,
            }),
          (s) => {
            const updated = s.cart.items.find(
              (l) => l.clientLineId === existing.clientLineId,
            );
            setFeedback({
              kind: 'incremented',
              productName: existing.productName,
              quantity: updated?.quantity ?? existing.quantity + 1,
            });
          },
          (msg) => setFeedback({ kind: 'error', code: trimmed, message: msg }),
        ).finally(() => {
          inFlightRef.current = false;
          setBusy(false);
        });
        return;
      }

      // New barcode → resolve, then add.
      inFlightRef.current = true;
      setBusy(true);
      (async () => {
        try {
          const lookup = await api.lookupVariantByBarcode(trimmed);
          const variant = lookup.data;
          await withVersionRetry(
            (version) =>
              api.addPosSessionItem(terminalCode, {
                clientLineId: newClientLineId(),
                variantId: variant.id,
                quantity: 1,
                version,
              }),
            () =>
              setFeedback({ kind: 'added', productName: variant.productName }),
            (msg) =>
              setFeedback({ kind: 'error', code: trimmed, message: msg }),
          );
        } catch (err) {
          const apiErr = err as Partial<ApiError>;
          if (apiErr?.statusCode === 404) {
            setFeedback({ kind: 'not-found', code: trimmed });
          } else {
            setFeedback({
              kind: 'error',
              code: trimmed,
              message: errMessage(err),
            });
          }
        } finally {
          inFlightRef.current = false;
          setBusy(false);
        }
      })();
    },
    [terminalCode, withVersionRetry],
  );

  const setLineQuantity = useCallback(
    (lineId: string, quantity: number) => {
      if (sessionRef.current?.status !== 'ACTIVE') return;
      setBusy(true);
      void withVersionRetry(
        (version) =>
          api.updatePosSessionItem(terminalCode, lineId, { quantity, version }),
        undefined,
        (msg) => setFeedback({ kind: 'error', code: lineId, message: msg }),
      ).finally(() => setBusy(false));
    },
    [terminalCode, withVersionRetry],
  );

  const incrementLine = useCallback(
    (lineId: string) => {
      const line = sessionRef.current?.cart.items.find(
        (l) => l.clientLineId === lineId,
      );
      if (line) setLineQuantity(lineId, line.quantity + 1);
    },
    [setLineQuantity],
  );
  const decrementLine = useCallback(
    (lineId: string) => {
      const line = sessionRef.current?.cart.items.find(
        (l) => l.clientLineId === lineId,
      );
      if (line) setLineQuantity(lineId, line.quantity - 1);
    },
    [setLineQuantity],
  );

  const readyForPayment = useCallback(() => {
    if (sessionRef.current?.status !== 'ACTIVE') return;
    if ((sessionRef.current?.cart.items.length ?? 0) === 0) return;
    setBusy(true);
    void withVersionRetry(
      (version) => api.posSessionPaymentIntent(terminalCode, { version }),
      undefined,
      (msg) => setFeedback({ kind: 'error', code: 'payment-intent', message: msg }),
    ).finally(() => setBusy(false));
  }, [terminalCode, withVersionRetry]);

  const voidBasket = useCallback(
    (reason?: string) => {
      const s = sessionRef.current;
      if (!s) return;
      // The scanner only voids ACTIVE baskets; once AWAITING_PAYMENT the
      // cashier owns it (the screen hides the button by then anyway).
      if (s.status !== 'ACTIVE') return;
      setBusy(true);
      void withVersionRetry(
        (version) => api.voidPosSession(terminalCode, { version, reason }),
        undefined,
        (msg) => setFeedback({ kind: 'error', code: 'void', message: msg }),
      ).finally(() => setBusy(false));
    },
    [terminalCode, withVersionRetry],
  );

  const retryOpen = useCallback(() => {
    void doOpen();
  }, [doOpen]);

  const startNewBasket = useCallback(() => {
    setCompletedOrderNumber(null);
    setVoidedReason(null);
    setFeedback(null);
    void doOpen();
  }, [doOpen]);

  return {
    phase,
    session,
    completedOrderNumber,
    voidedReason,
    openError,
    connected,
    busy,
    feedback,
    clearFeedback,
    handleScan,
    setLineQuantity,
    incrementLine,
    decrementLine,
    readyForPayment,
    voidBasket,
    retryOpen,
    startNewBasket,
  };
}
