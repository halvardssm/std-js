# @stdx/json

Extends [@std/json](https://jsr.io/@std/json)

The json package, contains helpers for json parsing, querying (jsonpath) and
processing

## Entrypoints

### JSONPath

JSONPath ([RFC9535](https://datatracker.ietf.org/doc/html/rfc9535))

```ts
import { JSONPath } from "@stdx/json";
// or: import { JSONPath } from "@stdx/json/jsonpath";

const jp = new JSONPath({ a: "b" });
jp.query("$.a"); // ["b"]
```

### JSON Schema

JSON Schema ([see](https://json-schema.org))

```ts
import type { JSONSchema } from "@stdx/json/json-schema/2020-12";

const schema: JSONSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};
```
