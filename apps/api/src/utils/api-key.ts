import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const AGENT_API_KEY_PREFIX = 'agtos_';

/**
 * Read the pepper used to derive API key hashes. Read lazily from the
 * environment so this module can be imported in pure unit tests without
 * triggering env validation. Validated by env.ts at app startup.
 */
function getPepper(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET is required to derive agent API key hashes');
    }
    return secret;
}

/**
 * Generate a fresh agent API key. Returns the plaintext (shown once to the
 * caller), a one-way hash for storage, and a short hint for display.
 *
 * Format: `agtos_<43 url-safe chars>` (32 random bytes, base64url-encoded).
 * Storage: HMAC-SHA256 keyed on JWT_SECRET. Single-lookup, constant-time.
 */
export function generateAgentApiKey(): { apiKey: string; hash: string; hint: string } {
    const raw = randomBytes(32).toString('base64url');
    const apiKey = `${AGENT_API_KEY_PREFIX}${raw}`;
    return {
        apiKey,
        hash: hashAgentApiKey(apiKey),
        hint: `${AGENT_API_KEY_PREFIX}…${raw.slice(-4)}`,
    };
}

export function hashAgentApiKey(apiKey: string): string {
    return createHmac('sha256', getPepper()).update(apiKey).digest('hex');
}

export function looksLikeAgentApiKey(token: string): boolean {
    return token.startsWith(AGENT_API_KEY_PREFIX);
}

/** Constant-time comparison helper for tests / direct verification. */
export function safeCompareHash(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
