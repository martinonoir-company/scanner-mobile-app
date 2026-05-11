import type { MovementKind } from './api-types';

/**
 * Return-reason catalogue for the returns flow.
 *
 * Locked decision (SCANNER_APP_PLAN.md §11):
 *   - "Damaged" / "Spoilt" → ADJUSTMENT (removes the bad units from stock).
 *   - "Customer return" / "Wrong size" → RETURN (credits stock back —
 *     the items are saleable again).
 *   - "Other" → RETURN by default; staff add a free-text note. If the
 *     items are actually unsaleable, staff should pick "Damaged" instead.
 *
 * The `kind` here is what gets sent to /inventory/movements/batch for
 * each line carrying this reason.
 */
export interface ReturnReason {
  id: string;
  label: string;
  description: string;
  kind: Extract<MovementKind, 'RETURN' | 'ADJUSTMENT'>;
  /** True → prompt for a free-text note (currently only "Other"). */
  requiresNote?: boolean;
}

export const RETURN_REASONS: ReturnReason[] = [
  {
    id: 'CUSTOMER_RETURN',
    label: 'Customer return',
    description: 'Returned in good condition — back to saleable stock.',
    kind: 'RETURN',
  },
  {
    id: 'WRONG_SIZE',
    label: 'Wrong size',
    description: 'Size exchange — item is fine, back to stock.',
    kind: 'RETURN',
  },
  {
    id: 'DAMAGED',
    label: 'Damaged',
    description: 'Damaged or spoilt — removed from stock (write-off).',
    kind: 'ADJUSTMENT',
  },
  {
    id: 'OTHER',
    label: 'Other',
    description: 'Specify a reason. Defaults to crediting stock back.',
    kind: 'RETURN',
    requiresNote: true,
  },
];

export function findReturnReason(id: string): ReturnReason | undefined {
  return RETURN_REASONS.find((r) => r.id === id);
}

/** The default reason a freshly scanned line starts with. */
export const DEFAULT_RETURN_REASON_ID = 'CUSTOMER_RETURN';
