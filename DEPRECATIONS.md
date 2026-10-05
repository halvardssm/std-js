# Deprecations

This document contains information about deprecated modules and functions.

## `@stdext` scope

The packages were previously published under the `@stdext` scope on JSR. That
scope is deprecated and replaced by [`@stdx`](https://jsr.io/@stdx). No new
versions will be published under `@stdext`.

To migrate, replace the scope in your dependencies and imports. The package
names and exports are unchanged.

| Deprecated          | Replacement       |
| ------------------- | ----------------- |
| `@stdext/<package>` | `@stdx/<package>` |

```diff
- import { dump } from "@stdext/encoding/hex";
+ import { dump } from "@stdx/encoding/hex";
```
