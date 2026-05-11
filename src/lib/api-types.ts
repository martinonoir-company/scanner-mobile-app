/**
 * API contract shared with the NestJS server. Mirrors the response shapes
 * the server returns wrapped in { data: ... }.
 */

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
  correlationId?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: 'SUPER_ADMIN' | 'COMPANY_SUPER_ADMIN' | 'COMPANY_STAFF' | 'CUSTOMER';
    firstName?: string;
    lastName?: string;
  };
}

// ── Branches ──

export interface BranchAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  postalCode?: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  warehouseCode: string;
  address?: BranchAddress | null;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Terminal {
  id: string;
  code: string;
  name: string;
  branchId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Variant lookup (PR #3 server endpoint) ──

/**
 * Result of GET /products/variants/by-barcode/:code (or /by-sku/:code).
 * Prices are MINOR units (kobo/cents) as opaque integer strings — never
 * do float math on them; format with formatMinor() in lib/format.ts.
 * Stock is NOT included here; fetch it separately via getStockLevel().
 */
export interface VariantLookup {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string | null;
  sku: string;
  barcode: string | null;
  price: {
    retailNgn: string;
    retailUsd: string;
    wholesaleNgn: string;
    wholesaleUsd: string;
  };
  options: Record<string, string> | null;
  imageUrl: string | null;
  isActive: boolean;
}

// ── Stock level (existing GET /inventory/levels/:variantId) ──

/**
 * The raw StockLevel row the server returns, or null if no row exists
 * for that variant+warehouse (treat null as zero stock). `available` is
 * computed client-side as onHand - reserved — we don't rely on the
 * server serializing the entity's computed getter.
 */
export interface StockLevelRaw {
  variantId: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  lastMovementAt?: string;
}

export interface StockLevel {
  variantId: string;
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
}

// ── Inventory movements (batch — PR #5 server endpoint) ──

/**
 * Stock movement kinds. The scanner only ever emits three:
 *   RECEIPT     — supplier restock (inbound, adds stock)
 *   RETURN      — customer return in good condition (inbound, adds stock)
 *   ADJUSTMENT  — damage / spoilage write-off (outbound, removes stock)
 * The other kinds (SALE, RESERVATION, RELEASE, TRANSFER_*) are emitted
 * server-side by the order/checkout pipelines, never by the scanner.
 */
export type MovementKind =
  | 'RECEIPT'
  | 'SALE'
  | 'RESERVATION'
  | 'RELEASE'
  | 'RETURN'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN';

export interface MovementBatchLine {
  clientLineId: string;
  variantId: string;
  kind: MovementKind;
  quantity: number;
  warehouseCode?: string;
  referenceId?: string;
  referenceType?: string;
  reason?: string;
}

export interface MovementBatchLineResult {
  clientLineId: string;
  status: 'ACCEPTED' | 'DEDUPLICATED';
  movementId: string;
}

export interface MovementBatchResult {
  accepted: number;
  deduplicated: number;
  lines: MovementBatchLineResult[];
}

// ── POS sessions (PR #11 server endpoints) ──

export type PosSessionStatus =
  | 'ACTIVE'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED'
  | 'VOIDED';

/** One line in the live POS-session cart. Prices are MINOR units. */
export interface PosSessionLine {
  clientLineId: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  barcode: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  options: Record<string, string> | null;
  maxStock: number;
  scannedByStaffId: string;
  scannedAt: string;
}

export interface PosSessionCart {
  items: PosSessionLine[];
  currency: 'NGN' | 'USD';
  totals: {
    subtotal: number;
    discountTotal: number;
    grandTotal: number;
  };
  couponCode?: string | null;
  discountAmount?: number;
  discountType?: 'COUPON' | 'MANUAL' | null;
}

export interface PosSession {
  id: string;
  terminalId: string;
  branchId: string;
  openedByStaffId: string;
  status: PosSessionStatus;
  cart: PosSessionCart;
  version: number;
  openedAt: string;
  closedAt?: string | null;
  resultOrderId?: string | null;
  resultOrderNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}
