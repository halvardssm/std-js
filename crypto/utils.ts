import { encodeBase32 } from "@std/encoding/base32";

/**
 * Generates a cryptographically random secret key.
 *
 * The bytes come from {@linkcode crypto.getRandomValues}, so the result is
 * suitable for use as an HMAC key (e.g. for HOTP/TOTP).
 *
 * @param length How many bytes the secret key should be.
 * @returns A secret as a byte array.
 *
 * @example
 * ```ts
 * import { generateSecretBytes } from "@stdx/crypto/utils";
 * import { assert } from "@std/assert";
 *
 * const secret = generateSecretBytes(20);
 * assert(secret.length === 20);
 * ```
 */
export function generateSecretBytes(length: number = 20): Uint8Array {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  return buffer;
}

/**
 * Generates a cryptographically random secret key in base32 encoding, as
 * used by HOTP/TOTP applications.
 *
 * At least `max(6, length)` random bytes are generated, base32-encoded
 * (padding stripped), and the last `length` characters are returned.
 *
 * The secret can be used as a key for `generateHotp` and `generateTotp`,
 * which accept base32 without padding. Note that
 * base32 strings with a length of 1, 3 or 6 modulo 8 can not be decoded, so
 * prefer the default, or a multiple of 8.
 *
 * @param length How many characters the secret key should be. Defaults
 * to `20`.
 * @returns A secret as a base32 string without padding.
 *
 * @example
 * ```ts
 * import { generateSecret } from "@stdx/crypto/utils";
 * import { generateTotp } from "@stdx/crypto/totp";
 * import { assert } from "@std/assert";
 *
 * const secret = generateSecret();
 * assert(secret.length === 20);
 *
 * // Use it as a TOTP key:
 * const otp = await generateTotp(secret);
 * assert(otp.length === 6);
 * ```
 */
export function generateSecret(
  length: number = 20,
): string {
  const buffer = generateSecretBytes(Math.max(6, length));

  const encoded = encodeBase32(buffer);

  return encoded.replaceAll("=", "").slice(-length);
}
