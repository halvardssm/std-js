# @stdx/event

Extends [@std/event](https://jsr.io/@std/event)

The event package contains typed extensions of the Web Event APIs: a
`CustomEvent` and a `CustomEventTarget` with typed event types and details. They
do not change the behavior of the global classes they extend, they only add a
better typing experience.

## Example

```ts
import { CustomEvent, CustomEventTarget } from "@stdx/event";

type MyEvents = "notify";
interface NotifyEvent extends CustomEvent<MyEvents, { message: string }> {}

const target = new CustomEventTarget<MyEvents, NotifyEvent>();

target.addEventListener("notify", (event) => {
  // Narrow the contextually typed event to the event class of the target.
  const { message } = (event as NotifyEvent).detail;
  console.log(message); // hi
});

target.dispatchEvent(new CustomEvent("notify", { detail: { message: "hi" } }));
```
