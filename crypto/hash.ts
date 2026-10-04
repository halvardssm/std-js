/**
 * Utilities for data hashing.
 *
 * The `hash` and `verify` functions hash and verify data using the
 * specified password-hashing algorithm. The algorithm can be specified by
 * name (using the default options) or as an algorithm object with options,
 * similar to the SubtleCrypto interface.
 *
 * All algorithms are password hashing schemes and produce a PHC string
 * (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`) embedding the options and
 * salt, so a hash can be verified without knowing the options it was
 * created with.
 *
 * ```ts
 * import { hash, verify } from "@stdx/crypto/hash";
 * import { assert } from "@std/assert";
 *
 * // By name, using default options:
 * const h = hash("argon2", "password");
 * assert(verify("argon2", "password", h));
 *
 * // By name with options:
 * const h2 = hash({ name: "argon2", algorithm: "argon2i" }, "password");
 * assert(verify({ name: "argon2", algorithm: "argon2i" }, "password", h2));
 * ```
 *
 * @module
 */

import { argon2, bcrypt, scrypt } from "./hash/mod.ts";

/**
 * The names of the hashing algorithms supported by this module.
 */
export const AlgorithmName = {
  Argon2: "argon2",
  Bcrypt: "bcrypt",
  Scrypt: "scrypt",
} as const;
export type AlgorithmName = typeof AlgorithmName[keyof typeof AlgorithmName];

/**
 * Hashing algorithms supported by this module with their options.
 */
export type Algorithm =
  | ({
    name: typeof AlgorithmName.Argon2;
  } & argon2.Argon2Options)
  | ({
    name: typeof AlgorithmName.Bcrypt;
  } & bcrypt.BcryptOptions)
  | ({
    name: typeof AlgorithmName.Scrypt;
  } & scrypt.ScryptOptions);

/**
 * Allows to specify the hashing algorithm and its options, or just the
 * algorithm name (in which case the algorithm's default options are used).
 */
export type AlgorithmIdentifier = Algorithm["name"] | Algorithm;

/**
 * Converts the algorithm identifier to the algorithm object.
 */
function getAlgorithm(algorithm: AlgorithmIdentifier): Algorithm {
  if (typeof algorithm === "string") {
    return { name: algorithm };
  } else {
    return algorithm;
  }
}

/**
 * Hashes the data using the specified algorithm.
 *
 * Specifying the name of the algorithm only will use the default options.
 *
 * @param algorithm The algorithm name or algorithm object with options.
 * @param data The data to hash.
 * @returns The hash as a PHC string, embedding the algorithm, options and
 * salt.
 * @throws {Error} If the algorithm is not supported, or the options are
 * invalid.
 *
 * @example
 * ```ts
 * import { hash } from "@stdx/crypto/hash";
 * import { assertMatch } from "@std/assert";
 *
 * // Argon2 with default options:
 * assertMatch(hash("argon2", "password"), /^\$argon2id\$v=19\$/);
 *
 * // Scrypt with custom options:
 * const h = hash({ name: "scrypt", logN: 17, blockSize: 8, parallelism: 1 }, "password");
 * assertMatch(h, /^\$scrypt\$ln=17,r=8,p=1\$/);
 * ```
 */
export function hash(algorithm: AlgorithmIdentifier, data: string): string {
  const algo = getAlgorithm(algorithm);

  switch (algo.name) {
    case AlgorithmName.Argon2:
      return argon2.hash(data, algo);
    case AlgorithmName.Bcrypt:
      return bcrypt.hash(data, algo);
    case AlgorithmName.Scrypt:
      return scrypt.hash(data, algo);
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
}

/**
 * Verifies the hash against the data using the specified algorithm.
 *
 * The options are read from the hash itself, so the algorithm identifier's
 * options (if any) are ignored.
 *
 * @param algorithm The algorithm name or algorithm object.
 * @param data The data to verify.
 * @param hash The hash to verify against, as produced by
 * {@linkcode hash}.
 * @returns `true` if the hash matches the data, `false` otherwise.
 * @throws {Error} If the algorithm is not supported, or the hash cannot be
 * parsed.
 *
 * @example
 * ```ts
 * import { hash, verify } from "@stdx/crypto/hash";
 * import { assert, assertFalse } from "@std/assert";
 *
 * const h = hash("bcrypt", "password");
 * assert(verify("bcrypt", "password", h));
 * assertFalse(verify("bcrypt", "wrong password", h));
 * ```
 */
export function verify(
  algorithm: AlgorithmIdentifier,
  data: string,
  hash: string,
): boolean {
  const algo = getAlgorithm(algorithm);

  switch (algo.name) {
    case AlgorithmName.Argon2:
      return argon2.verify(data, hash, algo);
    case AlgorithmName.Bcrypt:
      return bcrypt.verify(data, hash, algo);
    case AlgorithmName.Scrypt:
      return scrypt.verify(data, hash, algo);
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
}
