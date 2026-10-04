/**
 * Type guard and assertion for `string` values.
 *
 * @module
 */

import { AssertionError } from "@std/assert";

/**
 * Checks if a value is a string.
 *
 * This is a type-safe alternative to `typeof value === "string"`, narrowing
 * the value to `string` when used in conditionals.
 *
 * @param value The value to check.
 * @returns `true` if the value is a string, `false` otherwise.
 *
 * @example
 * ```ts
 * import { isString } from "@stdx/assert";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isString("hello"));
 * assertFalse(isString(42));
 * assertFalse(isString(null));
 * ```
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Asserts that a value is a string, narrowing the type for the rest of the
 * block.
 *
 * @param value The value to check.
 * @throws {AssertionError} If the value is not a string.
 *
 * @example
 * ```ts
 * import { assertIsString } from "@stdx/assert";
 * import { assertThrows } from "@std/assert";
 *
 * assertIsString("hello");
 * assertThrows(() => assertIsString(42));
 * ```
 */
export function assertIsString(
  value: unknown,
  msg?: string,
): asserts value is string {
  if (!isString(value)) {
    const msgSuffix = msg ? `: ${msg}` : ".";
    const message = `Value is not a string, was '${value}'${msgSuffix}`;
    throw new AssertionError(message);
  }
}
