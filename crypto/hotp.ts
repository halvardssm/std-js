/**
 * HMAC-based one-time passwords (HOTP), as defined in RFC 4226.
 *
 * @example
 * ```ts
 * import { generateHotp, verifyHotp } from "@stdx/crypto/hotp";
 * import { assert } from "@std/assert";
 *
 * const key = "OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP";
 * const otp = await generateHotp(key, 42);
 * assert(await verifyHotp(otp, key, 42));
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc4226 | RFC 4226: HOTP Algorithm}
 *
 * @module
 */
import { timingSafeEqual } from "@std/crypto/timing-safe-equal";
import { decodeBase32 } from "@std/encoding/base32";
import { hmac, type HmacHash } from "./hmac.ts";

/**
 * A one-time password key: either a base32 string, as shown by authenticator
 * apps, or the raw key bytes.
 *
 * Base32 strings are case insensitive, may contain whitespace and may omit
 * the `=` padding.
 */
export type OtpKey = string | BufferSource;

/**
 * Options for {@linkcode generateHotp} and {@linkcode verifyHotp}.
 */
export interface HotpOptions {
  /**
   * The number of digits of the password, between 1 and 10.
   *
   * @default {6}
   */
  digits?: number;
  /**
   * The hash function of the HMAC. RFC 4226 uses SHA-1; RFC 6238 also
   * allows SHA-256 and SHA-512 for TOTP.
   *
   * @default {"SHA-1"}
   */
  hash?: HmacHash;
}

const encoder = new TextEncoder();

/**
 * Converts a counter value to a big-endian byte buffer.
 *
 * @ignore
 */
export function counterToBuffer(counter: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(counter), false);
  return new Uint8Array(buffer);
}

/**
 * Generates an HMAC-SHA1 hash of the key and data.
 *
 * @deprecated Use {@linkcode hmac} from `@stdx/crypto/hmac` instead:
 * `hmac("SHA-1", key, data)`.
 *
 * @ignore
 */
export function generateHmacSha1(
  key: BufferSource,
  data: BufferSource,
): Promise<Uint8Array> {
  return hmac("SHA-1", key, data);
}

/**
 * Truncates an HMAC value to a numeric one-time password of the given
 * length, zero-padded, using the dynamic truncation of RFC 4226. The offset
 * is read from the last byte, so it works for every hash length.
 *
 * @ignore
 */
export function truncate(value: Uint8Array, length: number): string {
  const offset = value[value.length - 1] & 0xf;
  const code = (value[offset] & 0x7f) << 24 |
    (value[offset + 1] & 0xff) << 16 |
    (value[offset + 2] & 0xff) << 8 |
    (value[offset + 3] & 0xff);
  const digits = code % Math.pow(10, length);
  return digits.toString().padStart(length, "0");
}

/**
 * Decode a key to bytes.
 *
 * @ignore
 */
export function decodeKey(key: OtpKey): BufferSource {
  if (typeof key !== "string") return key;
  const normalized = key.replaceAll(/\s/g, "").toUpperCase();
  return decodeBase32(
    normalized.padEnd(Math.ceil(normalized.length / 8) * 8, "="),
  );
}

function getDigits(options: HotpOptions | undefined): number {
  const digits = options?.digits ?? 6;
  if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
    throw new RangeError(
      `Cannot generate one-time password as 'digits' must be an integer between 1 and 10: received ${digits}`,
    );
  }
  return digits;
}

/**
 * Compare two one-time passwords in constant time.
 *
 * @ignore
 */
export function equalOtp(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Generates an HMAC-based one-time password (HOTP) from a key and a counter,
 * as defined in RFC 4226.
 *
 * @param key The secret key, as a base32 string or bytes.
 * @param counter The counter. Both sides must agree on it, and it should
 * increment with each use.
 * @param options The number of digits and the hash function.
 * @returns The one-time password, zero-padded to the number of digits.
 * @throws {RangeError} If the number of digits is invalid.
 *
 * @example
 * ```ts
 * import { generateHotp } from "@stdx/crypto/hotp";
 * import { assertEquals } from "@std/assert";
 *
 * // Same key and counter always produce the same value.
 * assertEquals(await generateHotp("OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP", 0), "187492");
 * assertEquals(
 *   await generateHotp("OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP", 0, { digits: 8 }),
 *   "63187492",
 * );
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc4226 | RFC 4226: HOTP Algorithm}
 */
export async function generateHotp(
  key: OtpKey,
  counter: number,
  options?: HotpOptions,
): Promise<string> {
  const digits = getDigits(options);
  const mac = await hmac(
    options?.hash ?? "SHA-1",
    decodeKey(key),
    counterToBuffer(counter) as Uint8Array<ArrayBuffer>,
  );
  return truncate(mac, digits);
}

/**
 * Verifies an HMAC-based one-time password (HOTP) against a key and a
 * counter. The passwords are compared in constant time.
 *
 * For rate-limiting against brute force, callers should throttle repeated
 * failures.
 *
 * @param otp The one-time password to verify.
 * @param key The secret key, as a base32 string or bytes.
 * @param counter The counter the password was generated with.
 * @param options The number of digits and the hash function, which must
 * match the ones the password was generated with.
 * @returns `true` if the password matches, `false` otherwise.
 *
 * @example
 * ```ts
 * import { verifyHotp } from "@stdx/crypto/hotp";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(await verifyHotp("187492", "OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP", 0));
 * assertFalse(await verifyHotp("000000", "OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP", 0));
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc4226 | RFC 4226: HOTP Algorithm}
 */
export async function verifyHotp(
  otp: string,
  key: OtpKey,
  counter: number,
  options?: HotpOptions,
): Promise<boolean> {
  return equalOtp(otp, await generateHotp(key, counter, options));
}
