import * as Crypto from 'expo-crypto';

/**
 * Generate an RFC-4122 v4 UUID. Used as the `clientLineId` idempotency
 * key for every scanned line in the batch flows (restock, returns).
 *
 * Backed by expo-crypto's randomUUID() — cryptographically random,
 * available on iOS, Android, and web. Each scanned line gets a fresh ID
 * the moment it's added to the batch; the ID survives client-side retries
 * and offline-queue replay, so resubmitting the same batch is a no-op
 * server-side (those lines come back DEDUPLICATED).
 */
export function newClientLineId(): string {
  return Crypto.randomUUID();
}
