/**
 * Bcrypt password hashing, backed by WebAssembly.
 *
 * The hashes are PHC strings (`$2b$12$...`) that embed the options and salt, so
 * {@linkcode verify} reads them from the hash. Prefer the
 * algorithm-agnostic versions in `@stdx/crypto/hash` unless you need
 * bcrypt-specific options.
 *
 * @example
 * ```ts
 * import { hash, verify } from "@stdx/crypto/hash/bcrypt";
 * import { assert } from "@std/assert";
 *
 * const h = hash("password", { cost: 4 });
 * assert(verify("password", h));
 * ```
 *
 * @module
 */
import {
  hash as wasmHash,
  verify as wasmVerify,
} from "../_wasm/crypto_hash_bcrypt.mjs";
import type { BcryptOptions } from "../_wasm/crypto_hash_bcrypt.mjs";

export type { BcryptOptions };

/**
 * Hash the data using Bcrypt.
 *
 * @param data The data to hash, such as a password.
 * @param options The Bcrypt options. Defaults are used for omitted options.
 * @returns The hash as a PHC string, embedding the options and a random
 * salt.
 * @throws {Error} If the options are invalid.
 *
 * @example
 * ```ts
 * import { hash } from "@stdx/crypto/hash/bcrypt";
 *
 * const h = hash("password", { cost: 4 });
 * ```
 */
export function hash(data: string, options: BcryptOptions = {}): string {
  return wasmHash(data, options);
}

/**
 * Verify the data against a Bcrypt hash.
 *
 * The options are read from the hash, so a hash can be verified without
 * knowing the options it was created with.
 *
 * @param data The data to verify, such as a password.
 * @param hash The hash to verify against, as produced by {@linkcode hash}.
 * @param _options Ignored, as the options are read from the hash. Kept for
 * compatibility.
 * @returns `true` if the hash matches the data, `false` otherwise.
 *
 * @example
 * ```ts
 * import { hash, verify } from "@stdx/crypto/hash/bcrypt";
 * import { assert, assertFalse } from "@std/assert";
 *
 * const h = hash("password", { cost: 4 });
 * assert(verify("password", h));
 * assertFalse(verify("wrong password", h));
 * ```
 */
export function verify(
  data: string,
  hash: string,
  _options?: BcryptOptions,
): boolean {
  return wasmVerify(data, hash, {});
}
