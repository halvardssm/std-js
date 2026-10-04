# @stdx/assert

Extends [@std/assert](https://jsr.io/@std/assert)

The assert package contains type guards and assertions for narrowing unknown
values. Each guard has a matching assertion: the guard returns a boolean and
narrows the type in conditionals, the assertion throws an `AssertionError` and
narrows the type for the rest of the block.

## Entrypoints

The root module re-exports everything below.

- `isString` / `assertIsString`
- `isNumber` / `assertIsNumber`
- `isNumeric` / `assertIsNumeric`: a number that is not `NaN`
- `isObject` / `assertIsObject`
- `isRecord` / `assertIsRecord`: a plain `Record<string, unknown>`
- `objectHasProperties` / `assertObjectHasProperties`, and the `Deep` variants:
  an object that has the given keys

## Example

```ts
import {
  assertIsString,
  isNumber,
  isRecord,
  isString,
  objectHasProperties,
} from "@stdx/assert";

const someVar: unknown = "hello";

if (isString(someVar)) {
  // Returns true if a value is a string
  // someVar will typewise be a string from now on
}

assertIsString(someVar); // Throws if the value is not a string
// someVar will typewise be a string from now on

isNumber(42); // true
isRecord({ a: 1 }); // true
objectHasProperties({ a: 1, b: 2 }, ["a", "b"]); // true
```
