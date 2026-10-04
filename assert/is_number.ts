/**
 * Type guard and assertion for `number` values.
 *
 * @module
 */

import { AssertionError } from "@std/assert";

/**
 * Checks if a value is a number.
 *
 * This is a type-safe alternative to `typeof value === "number"`, narrowing
 * the value to `number` when used in conditionals.
 *
 * @param value The value to check.
 * @returns `true` if the value is a number, `false` otherwise.
 *
 * @example
 * ```ts
 * import { isNumber } from "@stdx/assert";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isNumber(42));
 * assert(isNumber(Number.NaN)); // NaN is a number, see {@linkcode isNumeric}
 * assertFalse(isNumber("42"));
 * assertFalse(isNumber(null));
 * ```
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/**
 * Asserts that a value is a number, narrowing the type for the rest of the
 * block. Unlike {@linkcode assertIsNumeric}, this accepts `NaN`.
 *
 * @param value The value to check.
 * @throws {AssertionError} If the value is not a number.
 *
 * @example
 * ```ts
 * import { assertIsNumber } from "@stdx/assert";
 * import { assertThrows } from "@std/assert";
 *
 * assertIsNumber(42);
 * assertThrows(() => assertIsNumber("42"));
 * ```
 */
export function assertIsNumber(
  value: unknown,
  msg?: string,
): asserts value is number {
  if (!isNumber(value)) {
    const msgSuffix = msg ? `: ${msg}` : ".";
    const message = `Value is not a number, was '${value}'${msgSuffix}`;
    throw new AssertionError(message);
  }
}
