/**
 * The `@stdx/types` package.
 *
 * Utility types missing from TypeScript's built-ins: property modifiers
 * (`PartialBy`, `RequiredBy`, ...), map flips, value extraction and a
 * generic constructor type.
 *
 * @example
 * ```ts
 * import type { PartialBy, ValueOf } from "@stdx/types";
 *
 * type Person = { name: string; age: number };
 * type PersonDraft = PartialBy<Person, "age">; // { name: string; age?: number }
 *
 * type Field = ValueOf<Person>; // string | number
 * const _check: Field = "x";
 * ```
 *
 * @module
 */

/**
 * Flips a map or object: `Record<K, V>` becomes `Record<V, K>`.
 *
 * @example
 * ```ts
 * import type { FlipMap } from "@stdx/types";
 *
 * type Ages = { alice: 30, bob: 40 };
 * type Names = FlipMap<Ages>; // { 30: "alice", 40: "bob" }
 *
 * const _check: Names = { 30: "alice", 40: "bob" };
 * ```
 */
// deno-lint-ignore no-explicit-any
export type FlipMap<T extends Record<keyof T, keyof any>> = {
  [K in keyof T as T[K]]: K;
};

/**
 * Make properties `K` in `T` optional, leaving the rest as-is (a partial
 * version of TypeScript's `Partial`).
 *
 * @example
 * ```ts
 * import type { PartialBy } from "@stdx/types";
 *
 * type A = { a: string; b: string };
 * type B = PartialBy<A, "b">; // { a: string; b?: string }
 *
 * const _check: B = { a: "hello" };
 * ```
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make properties `K` in `T` required, leaving the rest as-is.
 *
 * @example
 * ```ts
 * import type { RequiredBy } from "@stdx/types";
 *
 * type A = { a?: string; b?: string };
 * type B = RequiredBy<A, "b">; // { a?: string; b: string }
 *
 * const _check: B = { b: "hello" };
 * ```
 */
export type RequiredBy<T, K extends keyof T> =
  & Omit<T, K>
  & Required<Pick<T, K>>;

/**
 * Make properties `K` in `T` required, and the rest optional.
 *
 * @example
 * ```ts
 * import type { RequiredPartialBy } from "@stdx/types";
 *
 * type A = { a: string; b?: string; c?: string };
 * type B = RequiredPartialBy<A, "b">; // { a?: string; b: string; c?: string }
 *
 * const _check: B = { b: "hello" };
 * ```
 */
export type RequiredPartialBy<T, K extends keyof T> =
  & RequiredBy<
    Pick<T, K>,
    K
  >
  & Partial<Omit<T, K>>;

/**
 * Make properties `K` in `T` readonly, leaving the rest writable.
 *
 * @example
 * ```ts
 * import type { ReadonlyBy } from "@stdx/types";
 *
 * type A = { a: string; b: string };
 * type B = ReadonlyBy<A, "a">; // { readonly a: string; b: string }
 *
 * const _check: B = { a: "hello", b: "world" };
 * ```
 */
export type ReadonlyBy<T, K extends keyof T> =
  & Omit<T, K>
  & Readonly<Pick<T, K>>;

/**
 * Makes an object with readonly properties writable.
 *
 * @example
 * ```ts
 * import type { Writeable } from "@stdx/types";
 *
 * type A = { readonly a: string };
 * type B = Writeable<A>; // { a: string }
 *
 * const writable: B = { a: "hello" };
 * writable.a = "world"; // allowed
 * ```
 */
export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Make properties `K` in `T` writable, leaving the rest readonly.
 *
 * @example
 * ```ts
 * import type { WriteableBy } from "@stdx/types";
 *
 * type A = { readonly a: string; readonly b: string };
 * type B = WriteableBy<A, "a">; // { a: string; readonly b: string }
 *
 * const writable: B = { a: "hello", b: "world" };
 * writable.a = "world"; // allowed
 * ```
 */
export type WriteableBy<T, K extends keyof T> =
  & Omit<T, K>
  & Writeable<Pick<T, K>>;

/**
 * Gets the values of a record or object type, like `keyof` for values.
 *
 * @example With a type
 * ```ts
 * import type { ValueOf } from "@stdx/types";
 *
 * type A = { a: "hello"; b: "world" };
 * type B = ValueOf<A>; // "hello" | "world"
 *
 * const _check: B = "hello";
 * ```
 *
 * @example With a const object
 * ```ts
 * import type { ValueOf } from "@stdx/types";
 *
 * const a = { a: "hello", b: "world" } as const;
 * type B = ValueOf<typeof a>; // "hello" | "world"
 *
 * const _check: B = "world";
 * ```
 */
export type ValueOf<T> = T[keyof T];

/**
 * Represents a generic class constructor, e.g. to accept "any class" as a
 * parameter or to type a reference to a class.
 *
 * @typeParam T The instance type the constructor creates.
 * @typeParam A The tuple of constructor argument types.
 *
 * @example As a parameter
 * ```ts
 * import type { AnyConstructor } from "@stdx/types";
 *
 * class Foo {}
 *
 * function instantiate(SomeClass: AnyConstructor<Foo>): Foo {
 *   return new SomeClass();
 * }
 *
 * const foo = instantiate(Foo);
 * ```
 *
 * @example For other types
 * ```ts
 * import type { AnyConstructor } from "@stdx/types";
 *
 * class Foo {
 *   constructor(_name: string) {}
 * }
 *
 * type FooConstructor = AnyConstructor<Foo, [string]>;
 *
 * const _check: FooConstructor = Foo;
 * ```
 */
// deno-lint-ignore no-explicit-any
export type AnyConstructor<T = any, A extends any[] = any[]> = new (
  ...args: A
) => T;
