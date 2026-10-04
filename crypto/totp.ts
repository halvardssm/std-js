/**
 * Time-based one-time passwords (TOTP), as defined in RFC 6238.
 *
 * @example
 * ```ts
 * import { generateTotp, verifyTotp } from "@stdx/crypto/totp";
 * import { assert } from "@std/assert";
 *
 * const key = "OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP";
 * const otp = await generateTotp(key);
 * assert(await verifyTotp(otp, key));
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6238 | RFC 6238: TOTP Algorithm}
 *
 * @module
 */
import {
  equalOtp,
  generateHotp,
  type HotpOptions,
  type OtpKey,
} from "./hotp.ts";

export type { OtpKey } from "./hotp.ts";

/**
 * Options for {@linkcode generateTotp} and {@linkcode verifyTotp}.
 */
export interface TotpOptions extends HotpOptions {
  /**
   * The length of a time step in seconds.
   *
   * @default {30}
   */
  period?: number;
  /**
   * The time to start counting time steps from, as a Unix timestamp in
   * milliseconds (`T0` in RFC 6238).
   *
   * @default {0}
   */
  epoch?: number;
  /**
   * The time to generate or verify the password for, as a Unix timestamp in
   * milliseconds.
   *
   * @default {Date.now()}
   */
  time?: number;
}

function getCounter(options: TotpOptions | undefined): number {
  const period = options?.period ?? 30;
  if (!(period > 0)) {
    throw new RangeError(
      `Cannot generate one-time password as 'period' must be positive: received ${period}`,
    );
  }
  const elapsed = (options?.time ?? Date.now()) - (options?.epoch ?? 0);
  return Math.floor(elapsed / (period * 1000));
}

/**
 * Generates a time-based one-time password (TOTP) from a key and a point in
 * time, as defined in RFC 6238.
 *
 * The counter of the underlying HOTP is the number of time steps since the
 * epoch: `Math.floor((time - epoch) / (period * 1000))`.
 *
 * @param key The secret key, as a base32 string or bytes.
 * @param options The time, the time step, the number of digits and the
 * hash function.
 * @returns The one-time password, zero-padded to the number of digits.
 * @throws {RangeError} If the number of digits or the period is invalid.
 *
 * @example
 * ```ts
 * import { generateTotp } from "@stdx/crypto/totp";
 * import { assertEquals } from "@std/assert";
 *
 * // Same key and time always produce the same value.
 * assertEquals(
 *   await generateTotp("OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP", { time: 1704067200000 }),
 *   "342743",
 * );
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6238 | RFC 6238: TOTP Algorithm}
 */
export async function generateTotp(
  key: OtpKey,
  options?: TotpOptions,
): Promise<string> {
  return await generateHotp(key, getCounter(options), options);
}

/**
 * Verifies a time-based one-time password (TOTP) against a key and a point
 * in time. The passwords are compared in constant time.
 *
 * For rate-limiting against brute force, callers should throttle repeated
 * failures, and allow for clock drift by also accepting the password of the
 * previous and next time steps.
 *
 * @param otp The one-time password to verify.
 * @param key The secret key, as a base32 string or bytes.
 * @param options The time, the time step, the number of digits and the
 * hash function, which must match the ones the password was generated with.
 * @returns `true` if the password matches, `false` otherwise.
 *
 * @example
 * ```ts
 * import { verifyTotp } from "@stdx/crypto/totp";
 * import { assert, assertFalse } from "@std/assert";
 *
 * const key = "OCOMBLGUREYUXFQJIL75FQFCKYFCKLQP";
 * const time = 1704067200000;
 *
 * assert(await verifyTotp("342743", key, { time }));
 * assertFalse(await verifyTotp("000000", key, { time }));
 * ```
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6238 | RFC 6238: TOTP Algorithm}
 */
export async function verifyTotp(
  otp: string,
  key: OtpKey,
  options?: TotpOptions,
): Promise<boolean> {
  return equalOtp(otp, await generateTotp(key, options));
}
