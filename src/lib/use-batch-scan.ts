import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ApiError, VariantLookup } from './api-types';
import { newClientLineId } from './ids';

/**
 * One pending line in a batch flow. Created when a barcode resolves to a
 * variant; carries a stable `clientLineId` (UUID) that survives qty edits
 * and is sent to the server as the idempotency key.
 */
export interface PendingLine {
  clientLineId: string;
  variant: VariantLookup;
  quantity: number;
  /** Per-line note (returns flow uses this for the reason text). */
  note?: string;
  /** Per-line reason category (returns flow). */
  reason?: string;
}

/** Transient feedback after a scan attempt — drives a toast/banner. */
export type ScanFeedback =
  | { kind: 'added'; productName: string; quantity: number }
  | { kind: 'incremented'; productName: string; quantity: number }
  | { kind: 'not-found'; code: string }
  | { kind: 'error'; code: string; message: string }
  | null;

interface UseBatchScanResult {
  lines: PendingLine[];
  /** Sum of all line quantities — the "N items" count. */
  totalQuantity: number;
  /** True while a scan lookup is in flight (scanner should pause). */
  resolving: boolean;
  /** Last scan outcome — clear it by calling clearFeedback(). */
  feedback: ScanFeedback;
  clearFeedback: () => void;
  /** Resolve a scanned barcode and add/increment a line. */
  handleScan: (code: string) => void;
  /** Adjust a line's quantity. Removes the line if qty hits 0. */
  setLineQuantity: (clientLineId: string, quantity: number) => void;
  incrementLine: (clientLineId: string) => void;
  decrementLine: (clientLineId: string) => void;
  removeLine: (clientLineId: string) => void;
  /** Update a line's reason + note (returns flow). */
  setLineReason: (clientLineId: string, reason: string, note?: string) => void;
  /** Clear the whole batch. */
  reset: () => void;
}

/**
 * The shared batch-scan primitive used by restock, returns (and reused
 * conceptually by checkout). Owns:
 *  - the pending-line list,
 *  - scan resolution against the variant-lookup endpoint,
 *  - same-barcode-in-batch dedupe (qty++ instead of a duplicate row),
 *  - quantity stepper logic.
 *
 * It does NOT submit anything — each flow builds its own batch payload
 * from `lines` and calls the appropriate API. This keeps the hook
 * flow-agnostic.
 */
export function useBatchScan(): UseBatchScanResult {
  const [lines, setLines] = useState<PendingLine[]>([]);
  const [resolving, setResolving] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback>(null);

  // Keep a ref in sync with `lines` so handleScan can read the current
  // batch synchronously without making `lines` a dependency (which would
  // re-create the callback on every scan).
  const linesRef = useRef<PendingLine[]>([]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // Guards against overlapping lookups when scans arrive in a burst.
  const inFlightRef = useRef(false);

  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

  const clearFeedback = useCallback(() => setFeedback(null), []);

  const handleScan = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed || inFlightRef.current) return;

    // Client-side dedupe: if this barcode is already in the batch, bump
    // its qty with no network round-trip. (§4.8 — kills ~30% of lookup
    // traffic in batch flows where the camera grazes the same label.)
    const existing = linesRef.current.find(
      (l) => l.variant.barcode === trimmed,
    );
    if (existing) {
      const nextQty = existing.quantity + 1;
      setLines((prev) =>
        prev.map((l) =>
          l.clientLineId === existing.clientLineId
            ? { ...l, quantity: nextQty }
            : l,
        ),
      );
      setFeedback({
        kind: 'incremented',
        productName: existing.variant.productName,
        quantity: nextQty,
      });
      return;
    }

    // New barcode → resolve it against the variant-lookup endpoint.
    inFlightRef.current = true;
    setResolving(true);
    (async () => {
      try {
        const res = await api.lookupVariantByBarcode(trimmed);
        const variant = res.data;

        // A racing scan may have added this exact variant while the
        // lookup was in flight — if so, increment that line instead of
        // creating a duplicate.
        const racing = linesRef.current.find(
          (l) => l.variant.id === variant.id,
        );
        if (racing) {
          const nextQty = racing.quantity + 1;
          setLines((prev) =>
            prev.map((l) =>
              l.clientLineId === racing.clientLineId
                ? { ...l, quantity: nextQty }
                : l,
            ),
          );
          setFeedback({
            kind: 'incremented',
            productName: variant.productName,
            quantity: nextQty,
          });
          return;
        }

        const clientLineId = newClientLineId();
        setLines((prev) => [
          ...prev,
          { clientLineId, variant, quantity: 1 },
        ]);
        setFeedback({
          kind: 'added',
          productName: variant.productName,
          quantity: 1,
        });
      } catch (err) {
        const apiErr = err as Partial<ApiError>;
        if (apiErr?.statusCode === 404) {
          setFeedback({ kind: 'not-found', code: trimmed });
        } else {
          const msg = Array.isArray(apiErr?.message)
            ? apiErr.message[0] ?? 'Lookup failed'
            : (apiErr?.message as string | undefined) ?? 'Lookup failed';
          setFeedback({ kind: 'error', code: trimmed, message: msg });
        }
      } finally {
        inFlightRef.current = false;
        setResolving(false);
      }
    })();
  }, []);

  const setLineQuantity = useCallback(
    (clientLineId: string, quantity: number) => {
      setLines((prev) => {
        if (quantity <= 0) {
          return prev.filter((l) => l.clientLineId !== clientLineId);
        }
        return prev.map((l) =>
          l.clientLineId === clientLineId ? { ...l, quantity } : l,
        );
      });
    },
    [],
  );

  const incrementLine = useCallback((clientLineId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.clientLineId === clientLineId
          ? { ...l, quantity: l.quantity + 1 }
          : l,
      ),
    );
  }, []);

  const decrementLine = useCallback((clientLineId: string) => {
    setLines((prev) => {
      const target = prev.find((l) => l.clientLineId === clientLineId);
      if (!target) return prev;
      if (target.quantity <= 1) {
        return prev.filter((l) => l.clientLineId !== clientLineId);
      }
      return prev.map((l) =>
        l.clientLineId === clientLineId
          ? { ...l, quantity: l.quantity - 1 }
          : l,
      );
    });
  }, []);

  const removeLine = useCallback((clientLineId: string) => {
    setLines((prev) => prev.filter((l) => l.clientLineId !== clientLineId));
  }, []);

  const setLineReason = useCallback(
    (clientLineId: string, reason: string, note?: string) => {
      setLines((prev) =>
        prev.map((l) =>
          l.clientLineId === clientLineId ? { ...l, reason, note } : l,
        ),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    setLines([]);
    setFeedback(null);
  }, []);

  return {
    lines,
    totalQuantity,
    resolving,
    feedback,
    clearFeedback,
    handleScan,
    setLineQuantity,
    incrementLine,
    decrementLine,
    removeLine,
    setLineReason,
    reset,
  };
}
