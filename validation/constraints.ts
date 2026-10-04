/**
 * The constraints of the schema options: checks that the options are valid
 * when a schema is built, and checks of a value against them.
 *
 * Every check reports all the constraints a value violates, as issues whose
 * `kind` is the JSON Schema keyword, with the limit as `expected` and what was
 * found as `actual`.
 *
 * @module
 */

import type { JSONSchema } from "@stdx/json/json-schema/2020-12";
import type { Issue } from "./core.ts";
import { isStringFormat, matchesFormat, type StringFormat } from "./formats.ts";

function issue(
  kind: string,
  message: string,
  expected: unknown,
  actual: unknown,
  override?: string,
): Issue {
  return { kind, message: override ?? message, expected, actual };
}

function show(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function properties(count: number): string {
  return `${count} ${count === 1 ? "property" : "properties"}`;
}

/** The keys of `options` that are set, as an object. */
export function pick<T extends object, K extends keyof T>(
  options: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (options[key] !== undefined) picked[key] = options[key];
  }
  return picked;
}

/** A count option must be a non-negative integer. */
function checkCount(name: string, value: number | undefined): void {
  if (value !== undefined && !(Number.isInteger(value) && value >= 0)) {
    throw new TypeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/** A pair of count options must be valid, and the minimum within the maximum. */
export function checkCounts(
  minName: string,
  min: number | undefined,
  maxName: string,
  max: number | undefined,
): void {
  checkCount(minName, min);
  checkCount(maxName, max);
  if (min !== undefined && max !== undefined && min > max) {
    throw new TypeError(
      `${minName} (${min}) must not be greater than ${maxName} (${max})`,
    );
  }
}

/** The length of a string in Unicode code points, as JSON Schema counts it. */
export function codePointLength(value: string): number {
  let length = 0;
  for (const _ of value) length++;
  return length;
}

/**
 * Whether `value` is a multiple of `divisor`, tolerating binary floating point
 * error (`0.3` is a multiple of `0.1`).
 */
export function isMultipleOf(value: number, divisor: number): boolean {
  const quotient = value / divisor;
  if (!Number.isFinite(quotient)) return false;
  return Math.abs(quotient - Math.round(quotient)) <=
    Number.EPSILON * Math.max(1, Math.abs(quotient)) * 4;
}

/**
 * Serializes a value to JSON with the keys of objects sorted, so that equal
 * JSON values give the same string whatever the order of their keys. Values
 * JSON cannot hold do not throw: a bigint is `1n`, and a reference to an
 * object that contains it is `[Circular]`.
 */
export function canonicalJSON(
  value: unknown,
  ancestors: readonly object[] = [],
): string {
  if (typeof value === "object" && value !== null) {
    if (ancestors.includes(value)) return "[Circular]";
    const path = [...ancestors, value];
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJSON(item, path)).join(",")}]`;
    }
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${
          canonicalJSON((value as Record<string, unknown>)[key], path)
        }`
      ).join(",")
    }}`;
  }
  if (Object.is(value, -0)) return "0";
  if (typeof value === "bigint") return `${value}n`;
  return value === undefined
    ? "undefined"
    : JSON.stringify(value) ?? String(value);
}

// ---------------------------------------------------------------------------
// string
// ---------------------------------------------------------------------------

/** The constraints of {@linkcode string}. */
export interface StringConstraints
  extends Pick<JSONSchema, "minLength" | "maxLength"> {
  /** A regular expression, or its source. */
  pattern?: string | RegExp;
  /** A format that can be asserted. */
  format?: StringFormat;
}

/** The regular expression of a `pattern` option, as JSON Schema writes it. */
export function patternSource(pattern: string | RegExp): string {
  return typeof pattern === "string" ? pattern : pattern.source;
}

/**
 * Checks the string constraints when a schema is built.
 *
 * @returns The compiled `pattern`, if there is one
 * @throws TypeError if an option is not valid
 */
export function compileStringConstraints(
  constraints: StringConstraints,
): RegExp | undefined {
  checkCounts(
    "minLength",
    constraints.minLength,
    "maxLength",
    constraints.maxLength,
  );

  if (
    constraints.format !== undefined && !isStringFormat(constraints.format)
  ) {
    throw new TypeError(`format ${constraints.format} is not supported`);
  }

  const { pattern } = constraints;
  if (pattern === undefined) return undefined;
  if (typeof pattern !== "string" && pattern.flags) {
    throw new TypeError(
      `pattern cannot have flags (${pattern.flags}): a JSON Schema pattern has none`,
    );
  }
  try {
    return new RegExp(patternSource(pattern));
  } catch {
    throw new TypeError(
      `pattern ${patternSource(pattern)} is not a valid regular expression`,
    );
  }
}

/** Checks a string against its constraints. */
export function stringIssues(
  value: string,
  constraints: StringConstraints,
  pattern: RegExp | undefined,
  message?: string,
): Issue[] {
  const issues: Issue[] = [];
  const { minLength, maxLength, format } = constraints;

  if (minLength !== undefined || maxLength !== undefined) {
    const length = codePointLength(value);
    if (minLength !== undefined && length < minLength) {
      issues.push(issue(
        "minLength",
        `Expected a string of at least ${
          plural(minLength, "character")
        }, received ${length}`,
        minLength,
        length,
        message,
      ));
    }
    if (maxLength !== undefined && length > maxLength) {
      issues.push(issue(
        "maxLength",
        `Expected a string of at most ${
          plural(maxLength, "character")
        }, received ${length}`,
        maxLength,
        length,
        message,
      ));
    }
  }

  if (format !== undefined && !matchesFormat(value, format)) {
    issues.push(issue(
      "format",
      `Expected a string of format ${format}, received ${show(value)}`,
      format,
      value,
      message,
    ));
  }

  if (pattern && !pattern.test(value)) {
    issues.push(issue(
      "pattern",
      `Expected a string matching the pattern ${pattern.source}, received ${
        show(value)
      }`,
      pattern.source,
      value,
      message,
    ));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// number
// ---------------------------------------------------------------------------

/** The constraints of the number schemas: the JSON Schema number keywords. */
export type NumberConstraints = Pick<
  JSONSchema,
  | "minimum"
  | "maximum"
  | "exclusiveMinimum"
  | "exclusiveMaximum"
  | "multipleOf"
>;

const NUMBER_LIMITS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
] as const;

/**
 * Checks the number constraints when a schema is built.
 *
 * @throws TypeError if an option is not valid
 */
export function checkNumberConstraints(constraints: NumberConstraints): void {
  for (const name of NUMBER_LIMITS) {
    const value = constraints[name];
    if (value !== undefined && !Number.isFinite(value)) {
      throw new TypeError(`${name} must be a finite number, got ${value}`);
    }
  }
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } =
    constraints;
  if (multipleOf !== undefined && !(multipleOf > 0)) {
    throw new TypeError(`multipleOf must be greater than 0, got ${multipleOf}`);
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new TypeError(
      `minimum (${minimum}) must not be greater than maximum (${maximum})`,
    );
  }
  if (
    exclusiveMinimum !== undefined && exclusiveMaximum !== undefined &&
    exclusiveMinimum >= exclusiveMaximum
  ) {
    throw new TypeError(
      `exclusiveMinimum (${exclusiveMinimum}) must be less than exclusiveMaximum (${exclusiveMaximum})`,
    );
  }
}

/** Checks a number against its constraints. */
export function numberIssues(
  value: number,
  constraints: NumberConstraints,
  message?: string,
): Issue[] {
  const issues: Issue[] = [];
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } =
    constraints;

  if (minimum !== undefined && value < minimum) {
    issues.push(issue(
      "minimum",
      `Expected a number of at least ${minimum}, received ${value}`,
      minimum,
      value,
      message,
    ));
  }
  if (maximum !== undefined && value > maximum) {
    issues.push(issue(
      "maximum",
      `Expected a number of at most ${maximum}, received ${value}`,
      maximum,
      value,
      message,
    ));
  }
  if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
    issues.push(issue(
      "exclusiveMinimum",
      `Expected a number greater than ${exclusiveMinimum}, received ${value}`,
      exclusiveMinimum,
      value,
      message,
    ));
  }
  if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) {
    issues.push(issue(
      "exclusiveMaximum",
      `Expected a number less than ${exclusiveMaximum}, received ${value}`,
      exclusiveMaximum,
      value,
      message,
    ));
  }
  if (multipleOf !== undefined && !isMultipleOf(value, multipleOf)) {
    issues.push(issue(
      "multipleOf",
      `Expected a multiple of ${multipleOf}, received ${value}`,
      multipleOf,
      value,
      message,
    ));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// array
// ---------------------------------------------------------------------------

/** The constraints of {@linkcode array} that do not need other schemas. */
export type ArrayConstraints = Pick<
  JSONSchema,
  "minItems" | "maxItems" | "uniqueItems"
>;

/** Checks the number of items, and optionally that they are unique. */
export function arrayIssues(
  value: readonly unknown[],
  constraints: ArrayConstraints,
  message?: string,
): Issue[] {
  const issues: Issue[] = [];
  const { minItems, maxItems, uniqueItems } = constraints;

  if (minItems !== undefined && value.length < minItems) {
    issues.push(issue(
      "minItems",
      `Expected an array of at least ${
        plural(minItems, "item")
      }, received ${value.length}`,
      minItems,
      value.length,
      message,
    ));
  }
  if (maxItems !== undefined && value.length > maxItems) {
    issues.push(issue(
      "maxItems",
      `Expected an array of at most ${
        plural(maxItems, "item")
      }, received ${value.length}`,
      maxItems,
      value.length,
      message,
    ));
  }

  if (uniqueItems) {
    const seen = new Map<string, number[]>();
    value.forEach((item, index) => {
      const key = canonicalJSON(item);
      const indexes = seen.get(key);
      if (indexes) indexes.push(index);
      else seen.set(key, [index]);
    });
    for (const indexes of seen.values()) {
      if (indexes.length > 1) {
        issues.push(issue(
          "uniqueItems",
          `Expected unique items, found duplicates at indexes ${
            indexes.join(", ")
          }`,
          true,
          indexes,
          message,
        ));
      }
    }
  }

  return issues;
}

/** Checks how many items matched `contains`. */
export function containsIssues(
  matches: number,
  minContains: number | undefined,
  maxContains: number | undefined,
  message?: string,
): Issue[] {
  const issues: Issue[] = [];
  const min = minContains ?? 1;
  if (matches < min) {
    issues.push(issue(
      "minContains",
      `Expected at least ${
        plural(min, "item")
      } matching the schema, received ${matches}`,
      min,
      matches,
      message,
    ));
  }
  if (maxContains !== undefined && matches > maxContains) {
    issues.push(issue(
      "maxContains",
      `Expected at most ${
        plural(maxContains, "item")
      } matching the schema, received ${matches}`,
      maxContains,
      matches,
      message,
    ));
  }
  return issues;
}

// ---------------------------------------------------------------------------
// object
// ---------------------------------------------------------------------------

/** The constraints on the number of properties of an object. */
export type PropertyCountConstraints = Pick<
  JSONSchema,
  "minProperties" | "maxProperties"
>;

/** Checks the number of properties. */
export function propertyCountIssues(
  count: number,
  constraints: PropertyCountConstraints,
  message?: string,
): Issue[] {
  const issues: Issue[] = [];
  const { minProperties, maxProperties } = constraints;

  if (minProperties !== undefined && count < minProperties) {
    issues.push(issue(
      "minProperties",
      `Expected an object with at least ${
        properties(minProperties)
      }, received ${count}`,
      minProperties,
      count,
      message,
    ));
  }
  if (maxProperties !== undefined && count > maxProperties) {
    issues.push(issue(
      "maxProperties",
      `Expected an object with at most ${
        properties(maxProperties)
      }, received ${count}`,
      maxProperties,
      count,
      message,
    ));
  }
  return issues;
}
