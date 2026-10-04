/**
 * The individual password hashing algorithms, each in its own namespace:
 * {@linkcode argon2}, {@linkcode bcrypt} and {@linkcode scrypt}.
 *
 * Prefer the algorithm-agnostic `hash`/`verify` in `@stdx/crypto/hash`,
 * which dispatches on the algorithm name; these namespaces are for
 * algorithm-specific use.
 *
 * @module
 */

export * as argon2 from "./argon2.ts";
export * as bcrypt from "./bcrypt.ts";
export * as scrypt from "./scrypt.ts";
