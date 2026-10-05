# @stdx/collections

[![JSR](https://jsr.io/badges/@stdx/collections)](https://jsr.io/@stdx/collections)
[![JSR Score](https://jsr.io/badges/@stdx/collections/score)](https://jsr.io/@stdx/collections)
[![Weekly downloads](https://jsr.io/badges/@stdx/collections/weekly-downloads)](https://jsr.io/@stdx/collections)
[![Total downloads](https://jsr.io/badges/@stdx/collections/total-downloads)](https://jsr.io/@stdx/collections)

The collections package contains commonly used utilities and structures.

## Entrypoints

### Deferred Stack

Contains the DeferredStack utility class, a stack where popping an element waits
until one is available. It is useful for resource pools, such as connection
pools.

```ts
import { DeferredStack } from "@stdx/collections";

const deferred = new DeferredStack<number>({
  maxSize: 1,
  // Called with the value when an element is removed, e.g. to close it
  removeFn: (value) => console.log("removed", value),
});
deferred.add(1);
const e1 = await deferred.pop();
setTimeout(() => e1.release(), 100);
const e2 = await deferred.pop(); // will be queued until e1 is released

// Waiting can be aborted with a signal
const pending = deferred.pop({ signal: AbortSignal.timeout(100) });
await pending.catch(() => console.log("timed out"));

// Remove all elements and reject queued pops
await deferred.clear();
```
