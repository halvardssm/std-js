/**
 * Typed extensions of the Web Event APIs: a {@linkcode CustomEvent} and a
 * {@linkcode CustomEventTarget} with typed event types and details.
 *
 * The classes do not change the behavior of the global classes they extend;
 * they only add a better typing experience for custom events.
 *
 * @module
 */

/**
 * CustomEvent
 *
 * Extension of the global CustomEvent with a typed event type and detail.
 *
 * @see {@link globalThis.CustomEvent}
 *
 * @template T the event type
 * @template D the custom event details
 *
 * @example
 * ```ts
 * import { CustomEvent } from "@stdx/event";
 *
 * const event = new CustomEvent<"notify", { message: string }>("notify", {
 *   detail: { message: "hi" },
 * });
 * console.log(event.type, event.detail.message);
 * // notify hi
 * ```
 */
// deno-lint-ignore no-explicit-any
export class CustomEvent<T extends string = string, D = any>
  extends globalThis.CustomEvent<D> {
  /**
   * Typed constructor for CustomEvent
   *
   * @param typeArg the event types that the custom event should support
   * @param eventInitDict typed EventInit
   */
  constructor(typeArg: T, eventInitDict?: CustomEventInit<D>) {
    super(typeArg, eventInitDict);
  }
}

/**
 * CustomEventTarget
 *
 * Extension of the global EventTarget whose methods are typed to the events
 * it handles: listeners can only be added, removed and dispatched with the
 * event types and event classes of its type parameters.
 *
 * @see {@link globalThis.EventTarget}
 *
 * @template T the event type (string literal)
 * @template E the event type that extends CustomEvent
 * @template L the event listener type
 * @template AO add event listener options type
 * @template RO remove event listener options type
 *
 * @example
 * ```ts
 * import { CustomEvent, CustomEventTarget } from "@stdx/event";
 *
 * type MyEvents = "notify";
 * interface NotifyEvent extends CustomEvent<MyEvents, { message: string }> {}
 *
 * const target = new CustomEventTarget<MyEvents, NotifyEvent>();
 * target.addEventListener("notify", (event) => {
 *   // Narrow the contextually typed event to the event class of the target.
 *   const { message } = (event as NotifyEvent).detail;
 *   console.log(message);
 * });
 * target.dispatchEvent(new CustomEvent("notify", { detail: { message: "hi" } }));
 * // hi
 * ```
 */
export class CustomEventTarget<
  T extends string = string,
  E extends CustomEvent<T> = CustomEvent<T>,
  L extends CustomEventListenerOrEventListenerObject<E> =
    CustomEventListenerOrEventListenerObject<E>,
  AO extends AddEventListenerOptions = AddEventListenerOptions,
  RO extends EventListenerOptions = EventListenerOptions,
> extends EventTarget {
  /**
   * Typed addEventListener
   *
   * @inheritdoc
   */
  override addEventListener(
    type: T,
    listener: L | null,
    options?: boolean | AO,
  ): void {
    return super.addEventListener(type, listener, options);
  }

  /**
   * Typed dispatchEvent
   *
   * @inheritdoc
   */
  override dispatchEvent(event: E): boolean {
    return super.dispatchEvent(event);
  }

  /**
   * Typed removeEventListener
   *
   * @inheritdoc
   */
  override removeEventListener(
    type: T,
    callback: L | null,
    options?: boolean | RO,
  ): void {
    return super.removeEventListener(type, callback, options);
  }
}

/**
 * CustomEventListener
 *
 * A function type that represents an event listener for a specific event type
 *
 * It extends the global `EventListener`, which the typed overrides of
 * {@linkcode CustomEventTarget} require to stay compatible with the global
 * `EventTarget`. As a result, an inline listener of a typed event target is
 * contextually typed as `Event | E`, so narrow the event, such as with a type
 * assertion, to access its detail.
 *
 * @template E the event type
 * @param evt the event object
 */
export interface CustomEventListener<E extends Event = Event>
  extends EventListener {
  (evt: E): void;
}

/**
 * CustomEventListenerObject
 *
 * An object that can handle events with a handleEvent method
 *
 * @template E the event type
 */
export interface CustomEventListenerObject<E extends Event = Event>
  extends EventListenerObject {
  /**
   * Handles the event
   *
   * @param evt the event object to handle
   */
  handleEvent(evt: E): void;
}

/**
 * CustomEventListenerOrEventListenerObject
 *
 * Union type representing either a function listener or an object listener
 *
 * @template E the event type
 */
export type CustomEventListenerOrEventListenerObject<E extends Event = Event> =
  | CustomEventListener<E>
  | CustomEventListenerObject<E>;
