import { AssertionError } from "@std/assert";
import { isNumber } from "./is_number.ts";

/**
 * Checks if a value is a number and not `NaN`.
 *
 * Stricter than {@linkcode isNumber}: it rejects `NaN` (but accepts
 * infinities, which are valid numbers).
 *
 * @param value The value to check.
 * @returns `true` if the value is a number and not `NaN`, `false` otherwise.
 *
 * @example
 * ```ts
 * import { isNumeric } from "@stdx/assert";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isNumeric(42));
 * assertFalse(isNumeric(Number.NaN));
 * assertFalse(isNumeric("42"));
 * ```
 */
export function isNumeric(value: unknown): value is number {
  return isNumber(value) && !Number.isNaN(value);
}

/**
 * Asserts that a value is a number and not `NaN`, narrowing the type for
 * the rest of the block.
 *
 * @param value The value to check.
 * @throws {AssertionError} If the value is not a number, or is `NaN`.
 *
 * @example
 * ```ts
 * import { assertIsNumeric } from "@stdx/assert";
 * import { assertThrows } from "@std/assert";
 *
 * assertIsNumeric(42);
 * assertThrows(() => assertIsNumeric(Number.NaN));
 * ```
 */
export function assertIsNumeric(
  value: unknown,
  msg?: string,
): asserts value is number {
  if (!isNumeric(value)) {
    const msgSuffix = msg ? `: ${msg}` : ".";
    const message = `Value is not a numeric, was '${value}'${msgSuffix}`;
    throw new AssertionError(message);
  }
}
