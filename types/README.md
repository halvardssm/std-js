# @stdx/types

[![JSR](https://jsr.io/badges/@stdx/types)](https://jsr.io/@stdx/types)
[![JSR Score](https://jsr.io/badges/@stdx/types/score)](https://jsr.io/@stdx/types)
[![Weekly downloads](https://jsr.io/badges/@stdx/types/weekly-downloads)](https://jsr.io/@stdx/types)
[![Total downloads](https://jsr.io/badges/@stdx/types/total-downloads)](https://jsr.io/@stdx/types)

The types package, contains general purpose type helpers.

## Examples

```ts
import { ValueOf } from "@stdx/types";

const SOME_MAP = {
  a: "b",
  c: "d",
} as const;

type SomeMapValues = ValueOf<typeof SOME_MAP>; // "b" | "d"
```
