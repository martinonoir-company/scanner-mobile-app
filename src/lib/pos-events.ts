/**
 * Realtime event contract for the /pos Socket.IO namespace.
 *
 * Mirrors server/src/modules/realtime/pos-events.ts. Keep the two in sync.
 * Rooms are keyed by terminal CODE; both the POS web app and the scanner
 * join the same room. The server is the source of truth — REST writes,
 * the gateway notifies.
 */
import type { PosSessionCart } from './api-types';

export const POS_WS_NAMESPACE = '/pos';

/** Events the SERVER emits into a terminal room. */
export const PosServerEvent = {
  SESSION_OPENED: 'session:opened',
  ITEM_ADDED: 'session:item-added',
  ITEM_UPDATED: 'session:item-updated',
  ITEM_REMOVED: 'session:item-removed',
  TOTALS_CHANGED: 'session:totals-changed',
  PAYMENT_INTENT: 'session:payment-intent',
  CONFIRMED: 'session:confirmed',
  VOIDED: 'session:voided',
} as const;
export type PosServerEvent =
  (typeof PosServerEvent)[keyof typeof PosServerEvent];

/** Events the CLIENT sends to the gateway (control plane only). */
export const PosClientEvent = {
  JOIN_TERMINAL: 'terminal:join',
  LEAVE_TERMINAL: 'terminal:leave',
} as const;
export type PosClientEvent =
  (typeof PosClientEvent)[keyof typeof PosClientEvent];

// ── Event payloads ──

export interface SessionOpenedPayload {
  sessionId: string;
  terminalCode: string;
  branchCode: string;
  version: number;
  cart: PosSessionCart;
  openedByStaffId: string;
}

export interface SessionMutationPayload {
  sessionId: string;
  terminalCode: string;
  version: number;
  cart: PosSessionCart;
}

export interface SessionConfirmedPayload {
  sessionId: string;
  terminalCode: string;
  version: number;
  orderId: string;
  orderNumber: string;
}

export interface SessionVoidedPayload {
  sessionId: string;
  terminalCode: string;
  version: number;
  reason?: string;
}
