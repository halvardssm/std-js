/**
 * Argon2 password hashing, backed by WebAssembly.
 *
 * The hashes are PHC strings (`$argon2id$v=19$m=19456,t=2,p=1$...`) that embed the options and salt, so
 * {@linkcode verify} reads them from the hash. Prefer the
 * algorithm-agnostic versions in `@stdx/crypto/hash` unless you need
 * argon2-specific options.
 *
 * @example
 * ```ts
 * import { hash, verify } from "@stdx/crypto/hash/argon2";
 * import { assert } from "@std/assert";
 *
 * const h = hash("password", { algorithm: "argon2i", memoryCost: 8192, timeCost: 1 });
 * assert(verify("password", h));
 * ```
 *
 * @module
 */
import {
  hash as wasmHash,
  verify as wasmVerify,
} from "../_wasm/crypto_hash_argon2.mjs";
import type {
  Argon2Algorithm,
  Argon2Options,
} from "../_wasm/crypto_hash_argon2.mjs";

export type { Argon2Algorithm, Argon2Options };

/**
 * Hash the data using Argon2.
 *
 * @param data The data to hash, such as a password.
 * @param options The Argon2 options. Defaults are used for omitted options.
 * @returns The hash as a PHC string, embedding the options and a random
 * salt.
 * @throws {Error} If the options are invalid.
 *
 * @example
 * ```ts
 * import { hash } from "@stdx/crypto/hash/argon2";
 *
 * const h = hash("password", { algorithm: "argon2i", memoryCost: 8192, timeCost: 1 });
 * ```
 */
export function hash(data: string, options: Argon2Options = {}): string {
  return wasmHash(data, options);
}

/**
 * Verify the data against a Argon2 hash.
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
 * import { hash, verify } from "@stdx/crypto/hash/argon2";
 * import { assert, assertFalse } from "@std/assert";
 *
 * const h = hash("password", { algorithm: "argon2i", memoryCost: 8192, timeCost: 1 });
 * assert(verify("password", h));
 * assertFalse(verify("wrong password", h));
 * ```
 */
export function verify(
  data: string,
  hash: string,
  _options?: Argon2Options,
): boolean {
  return wasmVerify(data, hash, {});
}
