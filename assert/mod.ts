/**
 * Type guards and assertions for narrowing unknown values.
 *
 * Each guard has a matching assertion: `isString`/`assertIsString`,
 * `isNumber`/`assertIsNumber`, and so on. The guards narrow types in
 * conditionals; the assertions narrow types by throwing an
 * {@linkcode AssertionError} from `@std/assert` when the check fails.
 *
 * @example
 * ```ts
 * import { assertIsNumber, isString } from "@stdx/assert";
 * import { assert } from "@std/assert";
 *
 * const value: unknown = "hello";
 *
 * assert(isString(value));
 * value.toUpperCase(); // narrowed to string
 *
 * assertIsNumber(42); // narrows for the rest of the block
 * ```
 *
 * @module
 */

export * from "./is_number.ts";
export * from "./is_numeric.ts";
export * from "./is_object.ts";
export * from "./is_record.ts";
export * from "./is_string.ts";
export * from "./object_has_properties.ts";
