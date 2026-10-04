/**
 * Keyed-hash message authentication codes (HMAC), using the Web Crypto API.
 *
 * @example
 * ```ts
 * import { hmac } from "@stdx/crypto/hmac";
 * import { assertEquals } from "@std/assert";
 *
 * const mac = await hmac("SHA-256", "key", "The quick brown fox jumps over the lazy dog");
 * assertEquals(
 *   mac.toHex(),
 *   "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
 * );
 * ```
 *
 * @module
 */

/**
 * The hash functions supported for HMAC by the Web Crypto API
 */
export type HmacHash = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

const encoder = new TextEncoder();

function toBufferSource(value: BufferSource | string): BufferSource {
  return typeof value === "string" ? encoder.encode(value) : value;
}

/**
 * Compute the HMAC of the data with the key, as defined in RFC 2104.
 *
 * @param hash the hash function
 * @param key the secret key, strings are encoded as UTF-8
 * @param data the data to authenticate, strings are encoded as UTF-8
 * @returns the message authentication code
 *
 * @example
 * ```ts
 * import { hmac } from "@stdx/crypto/hmac";
 * import { assertEquals } from "@std/assert";
 *
 * const mac = await hmac("SHA-1", new Uint8Array(20), "data");
 * assertEquals(mac.length, 20);
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc2104 | RFC 2104: HMAC}
 */
export async function hmac(
  hash: HmacHash,
  key: BufferSource | string,
  data: BufferSource | string,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toBufferSource(key),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, toBufferSource(data)),
  );
}
