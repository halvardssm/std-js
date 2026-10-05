# @stdx/validation

[![JSR](https://jsr.io/badges/@stdx/validation)](https://jsr.io/@stdx/validation)
[![JSR Score](https://jsr.io/badges/@stdx/validation/score)](https://jsr.io/@stdx/validation)
[![Weekly downloads](https://jsr.io/badges/@stdx/validation/weekly-downloads)](https://jsr.io/@stdx/validation)
[![Total downloads](https://jsr.io/badges/@stdx/validation/total-downloads)](https://jsr.io/@stdx/validation)

Schemas that implement both [Standard Schema](https://standardschema.dev/) and
[Standard JSON Schema](https://standardschema.dev/#json-schema), and a small,
fully typed factory to build them.

- A schema works with any consumer of either standard: validators, form
  libraries, OpenAPI generators.
- `createSchema` infers the input type, output type and kind from the options.
- Schemas nest by calling one schema's `validate` from another's, sync or async.
- It uses `@stdx/validation` as vendor identifier.

## Helper functions

These work with any Standard Schema, including schemas from other libraries such
as Zod.

| Function                                                      | What it does                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `validate(schema, input)`                                     | Returns the `{ value }` or `{ issues }` result. Throws a `TypeError` if the schema is async.                 |
| `validateAsync(schema, input)`                                | Like `validate`, for sync and async schemas.                                                                 |
| `parse(schema, input)`                                        | Returns the value, or throws a `SchemaError` with the issues. Throws a `TypeError` if the schema is async.   |
| `parseAsync(schema, input)`                                   | Like `parse`, for sync and async schemas.                                                                    |
| `isValid(schema, value)`                                      | A type guard: whether the value is valid, narrowing it to the schema's input type. The value is not changed. |
| `assertValid(schema, value)`                                  | Like `isValid`, as an assertion: throws a `SchemaError` with the issues if the value is not valid.           |
| `toJSONSchema(schema, options?)`                              | The JSON Schema of a Standard JSON Schema. Options: `io` (`"output"` by default), `target`, `silent`.        |
| `isStandardSchemaV1(value)` / `isStandardJSONSchemaV1(value)` | Type guards, requiring `version` 1.                                                                          |
| `stringify(value)`                                            | Formats any value for a message and never throws.                                                            |

`validate`, `validateAsync`, `parse` and `parseAsync` also accept the boolean
schemas `true` (accepts everything) and `false` (rejects everything).

```ts
import { z } from "@zod/zod";
import { parse, string, toJSONSchema, validate } from "@stdx/validation";

const User = z.object({ name: z.string() });

validate(User, { name: "Alice" }); // { value: { name: "Alice" } }
validate(User, { name: 1 }); // { issues: [...] }
parse(User, { name: "Alice" }); // { name: "Alice" }

// `io: "input"` gives the JSON Schema of what a schema accepts
toJSONSchema(string(), { io: "input" }); // { type: "string" }

// `silent` returns `undefined` for a schema without Standard JSON Schema
// support, instead of throwing a TypeError
const plain = {
  "~standard": {
    version: 1,
    vendor: "other",
    validate: (value: unknown) => ({ value }),
  },
} as const;
toJSONSchema(plain, { silent: true }); // undefined
```

## Ready-made schemas

Schemas built with `createSchema`. Every one has its own JSON Schema, its types
are inferred, and it takes an `options` argument (see [Options](#options)).

| Schema                  | Accepts                                                                                                          | Type                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `string()`              | strings                                                                                                          | `string`                          |
| `integer()`             | numbers without a fractional part                                                                                | `number`                          |
| `float()`               | finite numbers                                                                                                   | `number`                          |
| `number()`              | any JavaScript number, including `NaN` and `Infinity`                                                            | `number`                          |
| `boolean()`             | booleans                                                                                                         | `boolean`                         |
| `symbol()`              | symbols                                                                                                          | `symbol`                          |
| `func()`                | functions; `func<(a: number) => string>()` sets the type                                                         | the function type                 |
| `null_()`               | `null`                                                                                                           | `null`                            |
| `literal(value)`        | exactly that string, number, boolean or `null`                                                                   | the literal type                  |
| `enumerator(values)`    | one of the values                                                                                                | the union of the values           |
| `instanceOf(Class)`     | instances of the class (checked with `instanceof`), subclasses included                                          | the instance type                 |
| `unknown()` / `never()` | everything / nothing                                                                                             | `unknown` / `never`               |
| `nullable(schema)`      | `null` or what the schema accepts                                                                                | `T \| null`                       |
| `optional(schema)`      | `undefined` or what the schema accepts                                                                           | `T \| undefined`                  |
| `nullish(schema)`       | `null`, `undefined` or what the schema accepts                                                                   | `T \| null \| undefined`          |
| `object(properties)`    | plain objects, string or symbol keys; properties that accept `undefined` may be absent, unknown keys are removed | an object type with optional keys |
| `shape(properties)`     | duck typing: any non-null object with the properties, returned as it is (not a copy)                             | the input type                    |
| `array(item)`           | arrays of items                                                                                                  | `T[]`                             |
| `record(value)`         | objects with any string keys                                                                                     | `Record<string, T>`               |
| `tuple(items)`          | arrays with exactly one item per schema                                                                          | a tuple type                      |
| `anyOf(schemas)`        | what any schema accepts, the first match wins                                                                    | the union                         |
| `oneOf(schemas)`        | what exactly one schema accepts                                                                                  | the union                         |
| `allOf(schemas)`        | what every schema accepts; object outputs are merged                                                             | the intersection                  |
| `not(schema)`           | what the schema rejects                                                                                          | `unknown`                         |
| `lazy(getter)`          | what the resolved schema accepts, for recursive schemas                                                          | the type of the schema            |

```ts
import {
  array,
  integer,
  lazy,
  literal,
  object,
  optional,
  type Schema,
  string,
  validate,
} from "@stdx/validation";

const user = object({
  name: string(),
  age: optional(integer()),
  role: literal("admin"),
  tags: array(string()),
});
// { name: string; role: "admin"; tags: string[]; age?: number | undefined }

validate(user, { name: "Alice", role: "admin", tags: ["a"] });
// { value: { name: "Alice", role: "admin", tags: ["a"] } }
validate(user, { name: "Alice", role: "admin", tags: [1] });
// { issues: [{ ..., path: ["tags", 0] }] }

// Recursive schemas need an explicit type annotation
interface Category {
  name: string;
  children: Category[];
}
const category: Schema<Category> = object({
  name: string(),
  children: array(lazy(() => category)),
});
```

Symbol keys work in `object`: they are validated, kept in the output and typed,
but left out of the JSON Schema, as JSON has no symbol keys. The schemas that
nest others stay synchronous unless one of the nested schemas is async. The JSON
Schema of a recursive `lazy` schema uses `$anchor` and `$ref`.

### Checking the shape of existing objects

`object` builds a new object with the declared keys, and only accepts plain
objects. To check that a value of any kind has some properties, such as an
instance of a class, use `shape`. It accepts every non-null object, reads
inherited members like methods and getters, and returns the value itself, so its
identity and prototype are kept. With `isValid` it makes a type guard:

```ts
import { boolean, func, isValid, optional, shape } from "@stdx/validation";

const closable = shape({
  closed: boolean(),
  close: func(),
  reset: optional(func()),
});

class Connection {
  closed = false;
  close() {}
}

const value: unknown = new Connection();
if (isValid(closable, value)) {
  // `value` has closed, close and reset here
  value.close();
}
```

`shape({})` accepts any non-null object. The property schemas only check, so
what they output is not used.

### Options

Options are named after the JSON Schema keywords, and the ones that have an
equivalent are exported to the generated JSON Schema.

- **All schemas**: `title`, `description`, `examples`, `deprecated`, `readOnly`,
  `writeOnly` and `$comment` are added to the JSON Schema. `message` replaces
  the default message of the issues the schema reports itself.
- **`string`**: `minLength`, `maxLength` (in code points), `pattern` (a string
  or a `RegExp`) and `format` (`date-time`, `date`, `time`, `duration`, `email`,
  `idn-email`, `hostname`, `idn-hostname`, `ipv4`, `ipv6`, `uri`,
  `uri-reference`, `iri`, `iri-reference`, `uri-template`, `uuid`,
  `json-pointer`, `relative-json-pointer` and `regex`).
- **`integer`, `float`, `number`**: `minimum`, `maximum`, `exclusiveMinimum`,
  `exclusiveMaximum` and `multipleOf`.
- **`array`**: `minItems`, `maxItems`, `uniqueItems`, and `contains` with
  `minContains` and `maxContains`.
- **`tuple`**: `rest` for the items after the listed ones, and
  `minItems`/`maxItems`.
- **`object`**: `additionalProperties` (`false` rejects unknown keys, `true`
  keeps them, a schema validates and keeps them; unknown keys are removed by
  default) and `minProperties`/`maxProperties`.
- **`shape`**: `minProperties` and `maxProperties`.
- **`record`**: `keys`, a schema for every key (`propertyNames`), and
  `minProperties`/`maxProperties`.
- **`optional`, `nullish`**: `default`, a value or a function that returns one,
  used when the input is `undefined`. The output type no longer includes
  `undefined`.
- **`anyOf`, `oneOf`**: `discriminator`, the key of a property that selects the
  schema to validate with, so only its issues are reported.

Options that are not valid, such as `minLength: -1` or `minItems` greater than
`maxItems`, throw a `TypeError` when the schema is created.

```ts
import { array, integer, object, string, validate } from "@stdx/validation";

const user = object({
  name: string({ minLength: 1, message: "Name is required" }),
  email: string({ format: "email" }),
  age: integer({ minimum: 0 }),
  tags: array(string(), { uniqueItems: true, maxItems: 5 }),
}, { additionalProperties: false });

validate(user, { name: "", email: "x", age: -1, tags: [], extra: 1 });
```

## Creating a schema

`createSchema(kind, options)` takes a `validate` function and the JSON Schema of
the schema:

```ts
import { createSchema } from "@stdx/validation";

const string = createSchema("string", {
  validate: (value) =>
    typeof value === "string"
      ? { value }
      : { issues: [{ message: "Expected a string" }] },
  jsonSchema: {
    input: () => ({ type: "string" }),
    output: () => ({ type: "string" }),
  },
});
// Schema<string, string, "string">

string.kind; // "string"
string["~standard"].validate("a"); // { value: "a" }
string["~standard"].validate(1); // { issues: [{ message: "Expected a string" }] }
```

The result is a frozen object: a `Schema`, which is a Standard Schema and a
Standard JSON Schema at once.

### Type inference

- The **output type** comes from the `{ value }` results `validate` returns. It
  works for async validators, keeps literal types (`"on" | "off"`), keeps
  `undefined` when the value may be `undefined`, and is `never` if `validate`
  always fails. Returning `{ issues }` never adds anything to the output.
- The **input type** defaults to the output type. When they differ, pass the
  phantom `types` option, which is never read at runtime.
- The **kind** is a literal type.

Read the types with the standard's helpers:

```ts
import { createSchema } from "@stdx/validation";
import type { StandardSchemaV1 } from "@standard-schema/spec";

const length = createSchema("length", {
  validate: (value) =>
    typeof value === "string"
      ? { value: value.length }
      : { issues: [{ message: "Expected a string" }] },
  jsonSchema: {
    input: () => ({ type: "string" }),
    output: () => ({ type: "integer" }),
  },
  types: undefined as unknown as StandardSchemaV1.Types<string, number>,
});
// Schema<string, number, "length">

type Input = StandardSchemaV1.InferInput<typeof length>; // string
type Output = StandardSchemaV1.InferOutput<typeof length>; // number
```

### Async

A schema is async when `validate` returns a promise. Nothing else changes: the
types are inferred through the promise.

```ts
import { createSchema } from "@stdx/validation";

const taken = new Set(["admin"]);
const isTaken = (name: string) => Promise.resolve(taken.has(name));

const unusedName = createSchema("unusedName", {
  validate: async (value) =>
    typeof value === "string" && !(await isTaken(value))
      ? { value }
      : { issues: [{ message: "Name is taken or not a string" }] },
  jsonSchema: {
    input: () => ({ type: "string" }),
    output: () => ({ type: "string" }),
  },
});
```

## Nesting schemas

Every schema is a Standard Schema, so a `validate` function can call any other
schema, or you can reuse its `validate` directly. A container validates its
items with the item schema and prefixes the issue paths:

```ts
import { type CombinedSchemaV1, createSchema } from "@stdx/validation";
import type { StandardSchemaV1 } from "@standard-schema/spec";

function list<TItem extends CombinedSchemaV1>(item: TItem) {
  return createSchema("list", {
    validate: (value) => {
      if (!Array.isArray(value)) {
        return { issues: [{ message: "Expected an array" }] };
      }

      const values: StandardSchemaV1.InferOutput<TItem>[] = [];
      for (const [index, entry] of value.entries()) {
        const result = item["~standard"].validate(entry);
        if (result instanceof Promise) {
          throw new TypeError("Async items are not supported");
        }
        if (result.issues) {
          return {
            issues: result.issues.map((issue) => ({
              ...issue,
              path: [index, ...(issue.path ?? [])],
            })),
          };
        }
        values.push(result.value);
      }
      return { value: values };
    },
    jsonSchema: {
      input: (options) => ({
        type: "array",
        items: item["~standard"].jsonSchema.input(options),
      }),
      output: (options) => ({
        type: "array",
        items: item["~standard"].jsonSchema.output(options),
      }),
    },
  });
}
```

`list(string)` is inferred as a schema of `string[]`. To support async items,
check whether any result is a promise and only then wait for all of them. Always
call a nested schema through its object, `item["~standard"].validate(x)`, as
other libraries' `validate` may rely on `this`.

## JSON Schema

A schema describes itself through `~standard.jsonSchema`. `input` is the JSON
Schema of what the schema accepts and `output` of what it produces; they only
differ for schemas that transform their input.

```ts
import { createSchema } from "@stdx/validation";

const age = createSchema("age", {
  validate: (value) =>
    Number.isInteger(value) && (value as number) >= 0
      ? { value: value as number }
      : { issues: [{ message: "Expected a non-negative integer" }] },
  jsonSchema: {
    input: () => ({ type: "integer", minimum: 0 }),
    output: () => ({ type: "integer", minimum: 0 }),
  },
});

age["~standard"].jsonSchema.input({ target: "draft-2020-12" });
// { type: "integer", minimum: 0 }
```

## Helpers for building schemas

The ready-made schemas are built from a few helpers, which you can use for your
own schemas:

| Helper                                    | What it does                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `collect(items)`                          | Waits for a list of values, but only if one is a promise, so a schema stays synchronous when all of them are.     |
| `chain(value, fn)`                        | Applies `fn` to a value, waiting for it first if it is a promise.                                                 |
| `prefixIssues(segment, issues)`           | Prefixes the `path` of issues, for a schema that validates a part of its value.                                   |
| `failure(kind, message, extra?)`          | A failure result with one issue of the given kind.                                                                |
| `typeIssue(expected, actual)`             | The failure result for a value that is not of the expected type.                                                  |
| `jsonSchemaOf(build)`                     | The `jsonSchema` converters of a schema, with `convert(schema)` for nested schemas in the direction asked for.    |
| `isRecord(value)` / `setOwn(target, key)` | Checks for a plain object, and sets a property (string, number or symbol) without triggering `__proto__` setters. |
| `acceptsUndefined(schema)`                | Whether a schema accepts `undefined`, i.e. whether an object property may be absent.                              |
| `typeOf(value)`                           | The type of a value, with `null` and arrays told apart.                                                           |

## Types

| Type                          | Description                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `Schema<Input, Output, Kind>` | What `createSchema` returns: a Standard Schema and a Standard JSON Schema.       |
| `CombinedSchemaV1`            | Any schema implementing both standards, without the `kind`.                      |
| `CreateSchemaOptions`         | The options of `createSchema`.                                                   |
| `ValidateResult`              | What a `validate` function returns: a result, or a promise of one.               |
| `InferValidateOutput`         | The output type of a `validate` result, used by the inference.                   |
| `Result`                      | The result of validating a value: `{ value }` or `{ issues }`.                   |
| `Issue`                       | A Standard Schema issue with `kind`, `expected` and `actual` for form libraries. |
| `Class`                       | A class, including abstract classes and built-ins such as `Date`.                |
| `ObjectInput`, `ObjectOutput` | The types of an `object` schema, with optional keys for `undefined`.             |
| `TupleInput`, `TupleOutput`   | The types of a `tuple` schema.                                                   |

Every schema function has a matching `...Options` interface (`StringOptions`,
`ObjectOptions`, ...).
