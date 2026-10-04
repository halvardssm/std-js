# @stdx/types

The types package, contains general purpose type helpers.

## Examples

```ts
import { ValueOf } from "jsr:@stdx/types";

const SOME_MAP = {
  a: "b",
  c: "d",
} as const;

type SomeMapValues = ValueOf<typeof SOME_MAP>; // "b" | "d"
```
