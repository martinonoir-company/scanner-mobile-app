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
