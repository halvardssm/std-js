/**
 * Type guard and assertion for plain `Record<string, unknown>` values.
 *
 * @module
 */

import { AssertionError } from "@std/assert";
import { isObject } from "./is_object.ts";

/**
 * Checks if a value is a `Record<string, unknown>`.
 *
 * Only plain objects pass: class instances fail (their `Object.prototype.toString`
 * tag differs), as do arrays, `null` and objects with symbol keys.
 *
 * @param value The value to check.
 * @returns `true` if the value is a plain object without symbol keys,
 * `false` otherwise.
 *
 * @example
 * ```ts
 * import { isRecord } from "@stdx/assert";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isRecord({}));
 * assert(isRecord({ key: "value" }));
 * assertFalse(isRecord(null));
 * assertFalse(isRecord([]));
 * assertFalse(isRecord(new Date())); // not a plain object
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  return true;
}

/**
 * Asserts that a value is a `Record<string, unknown>`, narrowing the type
 * for the rest of the block.
 *
 * @param value The value to check.
 * @throws {AssertionError} If the value is not a plain object, or has
 * symbol keys.
 *
 * @example
 * ```ts
 * import { assertIsRecord } from "@stdx/assert";
 * import { assertThrows } from "@std/assert";
 *
 * assertIsRecord({ key: "value" });
 * assertThrows(() => assertIsRecord("not a record"));
 * ```
 */
export function assertIsRecord(
  value: unknown,
  msg?: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    const msgSuffix = msg ? `: ${msg}` : ".";
    const message = `Value is not a Record, was '${value}'${msgSuffix}`;
    throw new AssertionError(message);
  }
}
