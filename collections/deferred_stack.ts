/**
 * A stack of reusable elements that hands them out through promises, useful for
 * pools of resources such as connections.
 *
 * @module
 */

/**
 * DeferredStackOptions
 *
 * Options for DeferredStack
 */
export type DeferredStackOptions<T> = {
  /**
   * The maximum stack size to be allowed.
   */
  maxSize?: number;
  /**
   * Called with the value of an element after it is released back to the
   * stack
   */
  releaseFn?: (value: T) => Promise<void> | void;
  /**
   * Called with the value of an element after it is removed from the stack,
   * for example to close a connection
   */
  removeFn?: (value: T) => Promise<void> | void;
};

/**
 * DeferredStackPopOptions
 *
 * Options for {@linkcode DeferredStack.pop}
 */
export type DeferredStackPopOptions = {
  /**
   * Aborts waiting for an element. The pop rejects with the abort reason.
   */
  signal?: AbortSignal;
};

/**
 * DeferredStack
 *
 * When you have a stack that you want to defer the acquire of an element until it is available.
 *
 * @example
 * ```ts
 * import { DeferredStack } from "@stdx/collections";
 *
 * const deferred = new DeferredStack<number>({ maxSize: 1 });
 * deferred.add(1);
 * const e1 = await deferred.pop();
 * setTimeout(() => e1.release(), 100);
 * const e2 = await deferred.pop(); // will be queued until e1 is released
 * await e2.release();
 * ```
 */
export class DeferredStack<T> {
  /**
   * The maximum stack size to be allowed, if the stack is full, the acquire will be queued.
   *
   * @default 10
   */
  readonly maxSize: number = 10;
  #releaseFn?: DeferredStackOptions<T>["releaseFn"];
  #removeFn?: DeferredStackOptions<T>["removeFn"];

  /**
   * The list of all elements
   *
   * Cannot be larger than maxSize
   */
  #elements: Array<DeferredStackElement<T>> = [];

  /**
   * The stack of available elements
   */
  #stack: Array<DeferredStackElement<T>> = [];

  /**
   * The queue of requested connections
   */
  readonly queue: Array<PromiseWithResolvers<DeferredStackElement<T>>> = [];

  /**
   * The list of all elements
   */
  get elements(): Array<DeferredStackElement<T>> {
    return this.#elements;
  }

  /**
   * The stack of available elements
   */
  get stack(): Array<DeferredStackElement<T>> {
    return this.#stack;
  }

  /**
   * The values of all elements, both available and in use
   */
  get values(): Array<T> {
    return this.#elements.map((element) => element._value);
  }

  /**
   * The number of elements in the stack
   */
  get totalCount(): number {
    return this.#elements.length;
  }

  /**
   * The number of elements in the stack
   */
  get inUseCount(): number {
    return this.#elements.length - this.availableCount;
  }

  /**
   * The number of available elements in the stack
   */
  get availableCount(): number {
    return this.#stack.length;
  }

  /**
   * The number of queued acquires
   */
  get queuedCount(): number {
    return this.queue.length;
  }

  constructor(options?: DeferredStackOptions<T>) {
    this.maxSize = options?.maxSize ?? 10;
    this.#releaseFn = options?.releaseFn;
    this.#removeFn = options?.removeFn;
  }

  /**
   * Add an element to the stack
   *
   * If there are any queued acquires, the first one will be resolved with the pushed element.
   * If the stack is full, an error will be thrown.
   *
   * @throws Error("Max size reached")
   */
  add(element: T): void {
    if (this.#elements.length >= this.maxSize) {
      throw new Error("Max size reached");
    }
    this.#add(element);
  }

  #add(value: T): void {
    const element = new DeferredStackElement<T>({
      value,
      releaseFn: (element) => this.#release(element),
      removeFn: (element) => this.#remove(element),
    });
    this.#elements.push(element);
    this.#push(element);
  }

  /**
   * Pop an element from the stack
   *
   * If there are no elements in the stack, the acquire will be queued and resolved when an element is pushed.
   */
  pop(options?: DeferredStackPopOptions): Promise<DeferredStackElement<T>> {
    const signal = options?.signal;
    if (signal?.aborted) return Promise.reject(signal.reason);

    const element = this.#stack.pop();

    if (element) {
      element._activate();
      return Promise.resolve(element);
    }

    const p = Promise.withResolvers<DeferredStackElement<T>>();

    this.queue.push(p);

    if (signal) {
      const onAbort = () => {
        const index = this.queue.indexOf(p);
        if (index !== -1) this.queue.splice(index, 1);
        p.reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      p.promise.then(
        () => signal.removeEventListener("abort", onAbort),
        () => signal.removeEventListener("abort", onAbort),
      );
    }

    return p.promise;
  }

  /**
   * Remove all elements and reject all queued acquires
   *
   * The `removeFn` is called for every element. Elements that are in use
   * are disposed, so releasing or removing them afterwards is a no-op.
   *
   * @param reason the reason to reject the queued acquires with
   * @throws AggregateError if any `removeFn` call fails, after all elements
   * are removed
   */
  async clear(
    reason: unknown = new Error("Deferred stack is cleared"),
  ): Promise<void> {
    for (const p of this.queue.splice(0)) p.reject(reason);
    const elements = this.#elements;
    this.#elements = [];
    this.#stack = [];
    for (const element of elements) element._dispose();
    const results = await Promise.allSettled(
      elements.map(async (element) => await this.#removeFn?.(element._value)),
    );
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (errors.length) {
      throw new AggregateError(errors, "Failed to remove elements");
    }
  }

  /**
   * Push an element to the stack or resolve the first queued acquire
   */
  #push(element: DeferredStackElement<T>): void {
    if (this.queue.length) {
      const p = this.queue.shift()!;
      element._activate();
      p.resolve(element);
    } else {
      this.#stack.push(element);
    }
  }

  /**
   * Release element back to the deferred stack
   *
   * To avoid that previous users of the element can still access it,
   * the element is replaced by a new element with the same value.
   */
  async #release(element: DeferredStackElement<T>): Promise<void> {
    if (!this.#delete(element)) return;
    this.#add(element._value);
    await this.#releaseFn?.(element._value);
  }

  /**
   * Removes element from the deferred stack
   */
  async #remove(element: DeferredStackElement<T>): Promise<void> {
    if (!this.#delete(element)) return;
    await this.#removeFn?.(element._value);
  }

  #delete(element: DeferredStackElement<T>): boolean {
    const count = this.#elements.length;
    this.#elements = this.#elements.filter((el) => el._id !== element._id);
    this.#stack = this.#stack.filter((el) => el._id !== element._id);
    return this.#elements.length !== count;
  }
}

/**
 * DeferredStackElementOptions
 */
export type DeferredStackElementOptions<T> = {
  /**
   * The value of the element
   */
  value: T;
  /**
   * The release function to be called when the element is released
   */
  releaseFn: (element: DeferredStackElement<T>) => Promise<void>;
  /**
   * The remove function to be called when the element is removed
   */
  removeFn: (element: DeferredStackElement<T>) => Promise<void>;
};

/**
 * DeferredStackElement
 *
 * Represents an element in the DeferredStack with helpful methods to manage it.
 *
 * To access the value of the element, use the `value` property.
 */
export class DeferredStackElement<T> {
  /**
   * The unique identifier of the element
   */
  _id: string = crypto.randomUUID();

  /**
   * Whether the element is in use
   */
  #active = false;

  /**
   * Whether the element is disposed and should not be available anymore
   */
  #disposed = false;

  /**
   * The value of the element
   */
  _value: T;

  /**
   * The release function to be called when the element is released
   */
  #releaseFn: DeferredStackElementOptions<T>["releaseFn"];

  /**
   * The remove function to be called when the element is removed
   */
  #removeFn: DeferredStackElementOptions<T>["removeFn"];

  /**
   * Whether the element is in use
   */
  get active(): boolean {
    return this.#active;
  }

  /**
   * Whether the element is disposed and should not be available anymore
   */
  get disposed(): boolean {
    return this.#disposed;
  }

  /**
   * The value of the element
   *
   * @throws Error("Element is not active")
   * @throws Error("Element is disposed")
   */
  get value(): T {
    if (!this.active) throw new Error("Element is not active");
    if (this.#disposed) throw new Error("Element is disposed");
    return this._value;
  }

  constructor(
    options: DeferredStackElementOptions<T>,
  ) {
    this._value = options.value;
    this.#releaseFn = options.releaseFn;
    this.#removeFn = options.removeFn;
  }

  /**
   * Activates the element
   *
   * Only the DeferredStack should call this method.
   */
  _activate(): void {
    this.#active = true;
  }

  /**
   * Disposes the element
   *
   * Only the DeferredStack should call this method.
   */
  _dispose(): void {
    this.#active = false;
    this.#disposed = true;
  }

  /**
   * Releases the element back to the DeferredStack. Releasing a disposed
   * element is a no-op.
   */
  async release(): Promise<void> {
    if (this.#disposed) return;
    this._dispose();
    await this.#releaseFn(this);
  }

  /**
   * Removes the element from the DeferredStack. Removing a disposed element
   * is a no-op.
   */
  async remove(): Promise<void> {
    if (this.#disposed) return;
    this._dispose();
    await this.#removeFn(this);
  }
}
