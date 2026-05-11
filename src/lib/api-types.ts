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
