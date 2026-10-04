import {
  type Args,
  parseArgs as stdParseArgs,
  type ParseOptions,
} from "@std/cli/parse-args";
import type {
  Aliases,
  BooleanType,
  Collectable,
  Negatable,
  StringType,
  Values,
} from "./_types.ts";

type AsUnion<TValue> = TValue extends ReadonlyArray<infer TItem> ? TItem
  : TValue;

// The flags, and everything they are an alias of or have as an alias.
type WithAliases<TFlags extends string, TAliases> = TAliases extends
  Record<string, unknown> ?
    | TFlags
    | {
      [TName in keyof TAliases & string]: [
        Extract<TFlags, TName | AsUnion<TAliases[TName]>>,
      ] extends [never] ? never
        : TName | AsUnion<TAliases[TName]>;
    }[keyof TAliases & string]
  : TFlags;

type FlagsOf<TDefaults, TRequired, TAliases> = Extract<
  WithAliases<
    | (TDefaults extends Record<string, unknown> ? keyof TDefaults & string
      : never)
    | (TRequired extends ReadonlyArray<string> ? TRequired[number] : never),
    TAliases
  >,
  string
>;

// The result, where the given flags are not `undefined`.
type WithFlags<TResult, TFlags extends string> = string extends TFlags ? TResult
  :
    & {
      [TKey in keyof TResult as TKey extends TFlags ? never : TKey]:
        TResult[TKey];
    }
    & {
      [TKey in TFlags]-?: TKey extends keyof TResult
        ? unknown extends TResult[TKey] ? NonNullable<unknown>
        : Exclude<TResult[TKey], undefined>
        : NonNullable<unknown>;
    };

/**
 * Options for {@linkcode parseArgs}, which are the options of `parseArgs` in
 * `@std/cli` and `required`.
 */
export interface ParseArgsOptions<
  TBooleans extends BooleanType = BooleanType,
  TStrings extends StringType = StringType,
  TCollectable extends Collectable = Collectable,
  TNegatable extends Negatable = Negatable,
  TDefault extends Record<string, unknown> | undefined =
    | Record<string, unknown>
    | undefined,
  TAliases extends Aliases | undefined = Aliases | undefined,
  TDoubleDash extends boolean | undefined = boolean | undefined,
  TRequired extends ReadonlyArray<string> | undefined =
    | ReadonlyArray<string>
    | undefined,
> extends
  ParseOptions<
    TBooleans,
    TStrings,
    TCollectable,
    TNegatable,
    TDefault,
    TAliases,
    TDoubleDash
  > {
  /**
   * A list of flags that must have a value in the parsed arguments.
   * {@linkcode parseArgs} throws if any of them is missing. A flag is present
   * when it, or one of its aliases, is passed, including a negated flag such as
   * `--no-color`. A default also counts as a value, and so does the `false`
   * that is set for flags in `boolean`.
   *
   * The flags are not `undefined` in the type of the result, as are the flags
   * with a default.
   */
  required?: TRequired;
}

/**
 * Parses command line arguments like `parseArgs` in `@std/cli`, and throws when
 * a flag marked as `required` is not present.
 *
 * It is a drop in replacement for the `@std/cli` version, and any options
 * and behavior not mentioned here are the same.
 *
 * @param args the command line arguments to parse
 * @param options the {@linkcode ParseArgsOptions} to parse with
 * @returns the parsed arguments
 * @throws {TypeError} when a required flag is missing
 *
 * @example
 * ```ts
 * import { parseArgs } from "@stdx/cli/parse-args";
 * import { assertEquals, assertThrows } from "@std/assert";
 *
 * const options = { string: ["name"], boolean: ["verbose"], required: ["name"] };
 *
 * assertEquals(parseArgs(["--name", "foo"], options).name, "foo");
 * assertThrows(() => parseArgs(["--verbose"], options), TypeError);
 * ```
 */
export function parseArgs<
  TArgs extends Values<
    TBooleans,
    TStrings,
    TCollectable,
    TNegatable,
    TDefaults,
    TAliases
  >,
  TDoubleDash extends boolean | undefined = undefined,
  TBooleans extends BooleanType = undefined,
  TStrings extends StringType = undefined,
  TCollectable extends Collectable = undefined,
  TNegatable extends Negatable = undefined,
  TDefaults extends Record<string, unknown> | undefined = undefined,
  TAliases extends Aliases<TAliasArgNames, TAliasNames> | undefined = undefined,
  TAliasArgNames extends string = string,
  TAliasNames extends string = string,
  const TRequired extends ReadonlyArray<string> | undefined = undefined,
>(
  args: readonly string[],
  options?: ParseArgsOptions<
    TBooleans,
    TStrings,
    TCollectable,
    TNegatable,
    TDefaults,
    TAliases,
    TDoubleDash,
    TRequired
  >,
): WithFlags<
  Args<TArgs, TDoubleDash>,
  FlagsOf<TDefaults, TRequired, TAliases>
> {
  const { required = [], ...parseOptions } = options ?? {};
  const result = stdParseArgs(args, parseOptions as ParseOptions) as Record<
    string,
    unknown
  >;

  const missing = required.filter((flag) => result[flag] === undefined);
  if (missing.length > 0) {
    throw new TypeError(
      `Missing required flag${missing.length > 1 ? "s" : ""}: ${
        missing.map((flag) => flag.length === 1 ? `-${flag}` : `--${flag}`)
          .join(", ")
      }`,
    );
  }

  return result as never;
}
