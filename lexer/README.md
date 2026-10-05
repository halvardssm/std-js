# @stdx/lexer

[![JSR](https://jsr.io/badges/@stdx/lexer)](https://jsr.io/@stdx/lexer)
[![JSR Score](https://jsr.io/badges/@stdx/lexer/score)](https://jsr.io/@stdx/lexer)
[![Weekly downloads](https://jsr.io/badges/@stdx/lexer/weekly-downloads)](https://jsr.io/@stdx/lexer)
[![Total downloads](https://jsr.io/badges/@stdx/lexer/total-downloads)](https://jsr.io/@stdx/lexer)

The lexer package contains general purpose lexers/tokenizers.

## Example

```ts
import { StringTokenizer } from "@stdx/lexer";

const t = new StringTokenizer({
  data: "ab1",
  matchers: [
    {
      key: /[a-z]/,
      handler: (v, i) => ({ index: i, type: "letter", value: v }),
    },
  ],
  defaultHandler: (v, i) => ({ index: i, type: "other", value: v }),
});

const tokens = t.tokenize();
// [
//   { index: 0, type: "letter", value: "a" },
//   { index: 1, type: "letter", value: "b" },
//   { index: 2, type: "other", value: "1" },
// ]
```
