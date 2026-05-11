import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';
import {
  POS_WS_NAMESPACE,
  PosClientEvent,
  PosServerEvent,
  type SessionConfirmedPayload,
  type SessionMutationPayload,
  type SessionOpenedPayload,
  type SessionVoidedPayload,
} from './pos-events';

/**
 * Thin wrapper around the /pos Socket.IO connection.
 *
 *  - Connects with the staff access token in the handshake.
 *  - Joins the terminal room.
 *  - Surfaces typed listeners for the session events the scanner cares
 *    about. The scanner treats every event as "the session changed —
 *    refetch or apply the payload"; the server is the source of truth.
 *  - Auto-reconnects (socket.io default). On reconnect it re-joins the
 *    room and the caller is expected to refetch the session via REST.
 *
 * Usage:
 *   const conn = new PosSocketConnection(token, terminalCode);
 *   conn.onItemAdded(p => ...);
 *   conn.onConfirmed(p => ...);
 *   conn.onReconnect(() => refetchSession());
 *   conn.connect();
 *   ...later
 *   conn.disconnect();
 */
export class PosSocketConnection {
  private socket: Socket | null = null;
  private readonly url: string;

  private mutationHandlers: ((p: SessionMutationPayload) => void)[] = [];
  private openedHandlers: ((p: SessionOpenedPayload) => void)[] = [];
  private paymentIntentHandlers: ((p: SessionMutationPayload) => void)[] = [];
  private confirmedHandlers: ((p: SessionConfirmedPayload) => void)[] = [];
  private voidedHandlers: ((p: SessionVoidedPayload) => void)[] = [];
  private reconnectHandlers: (() => void)[] = [];
  private connectionStateHandlers: ((connected: boolean) => void)[] = [];

  constructor(
    private readonly accessToken: string,
    private readonly terminalCode: string,
  ) {
    const base =
      (Constants.expoConfig?.extra as { wsUrl?: string } | undefined)?.wsUrl ??
      'wss://api.martinonoir.com/pos';
    // `wsUrl` already includes the namespace path; socket.io-client wants
    // the host root + the namespace passed separately. We accept either:
    // strip a trailing /pos so we can re-append the namespace cleanly.
    const root = base.replace(/\/pos\/?$/i, '');
    this.url = `${root}${POS_WS_NAMESPACE}`;
  }

  // ── Listeners ──

  onSessionOpened(fn: (p: SessionOpenedPayload) => void) {
    this.openedHandlers.push(fn);
  }
  /** Fires on item-added / item-updated / item-removed / totals-changed. */
  onSessionMutated(fn: (p: SessionMutationPayload) => void) {
    this.mutationHandlers.push(fn);
  }
  onPaymentIntent(fn: (p: SessionMutationPayload) => void) {
    this.paymentIntentHandlers.push(fn);
  }
  onConfirmed(fn: (p: SessionConfirmedPayload) => void) {
    this.confirmedHandlers.push(fn);
  }
  onVoided(fn: (p: SessionVoidedPayload) => void) {
    this.voidedHandlers.push(fn);
  }
  /** Fires after a reconnect — caller should refetch the session via REST. */
  onReconnect(fn: () => void) {
    this.reconnectHandlers.push(fn);
  }
  onConnectionStateChange(fn: (connected: boolean) => void) {
    this.connectionStateHandlers.push(fn);
  }

  // ── Lifecycle ──

  connect(): void {
    if (this.socket) return;
    const socket = io(this.url, {
      transports: ['websocket'],
      auth: { token: this.accessToken },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 12000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.emitConnectionState(true);
      this.joinRoom();
    });
    socket.io.on('reconnect', () => {
      // socket.io re-emits 'connect' too; this is the explicit hook for
      // callers to refetch state.
      this.joinRoom();
      this.reconnectHandlers.forEach((h) => h());
    });
    socket.on('disconnect', () => this.emitConnectionState(false));
    socket.on('connect_error', () => this.emitConnectionState(false));

    socket.on(PosServerEvent.SESSION_OPENED, (p: SessionOpenedPayload) =>
      this.openedHandlers.forEach((h) => h(p)),
    );
    socket.on(PosServerEvent.ITEM_ADDED, (p: SessionMutationPayload) =>
      this.mutationHandlers.forEach((h) => h(p)),
    );
    socket.on(PosServerEvent.ITEM_UPDATED, (p: SessionMutationPayload) =>
      this.mutationHandlers.forEach((h) => h(p)),
    );
    socket.on(PosServerEvent.ITEM_REMOVED, (p: SessionMutationPayload) =>
      this.mutationHandlers.forEach((h) => h(p)),
    );
    socket.on(PosServerEvent.TOTALS_CHANGED, (p: SessionMutationPayload) =>
      this.mutationHandlers.forEach((h) => h(p)),
    );
    socket.on(PosServerEvent.PAYMENT_INTENT, (p: SessionMutationPayload) =>
      this.paymentIntentHandlers.forEach((h) => h(p)),
    );
    socket.on(PosServerEvent.CONFIRMED, (p: SessionConfirmedPayload) =>
      this.confirmedHandlers.forEach((h) => h(p)),
    );
    socket.on(PosServerEvent.VOIDED, (p: SessionVoidedPayload) =>
      this.voidedHandlers.forEach((h) => h(p)),
    );
  }

  disconnect(): void {
    if (!this.socket) return;
    try {
      this.socket.emit(PosClientEvent.LEAVE_TERMINAL, {
        terminalCode: this.terminalCode,
      });
    } catch {
      /* ignore */
    }
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ── Internals ──

  private joinRoom(): void {
    this.socket?.emit(PosClientEvent.JOIN_TERMINAL, {
      terminalCode: this.terminalCode,
    });
  }

  private emitConnectionState(connected: boolean): void {
    this.connectionStateHandlers.forEach((h) => h(connected));
  }
}
