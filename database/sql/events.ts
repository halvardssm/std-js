import type { Client } from "./core.ts";
import { CustomEvent, CustomEventTarget } from "@stdx/event";
import type { DatabaseError } from "./errors.ts";

/**
 * Client event types
 *
 * - `connect`: a connection of the pool is established
 * - `close`: a connection of the pool is about to be closed
 * - `error`: an error is thrown by an operation
 * - `acquire`: a connection is acquired from the pool
 * - `release`: a connection is released back to the pool
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import type { ClientEvent, ClientEventType } from "@stdx/database/sql";
 *
 * await using client = new SqliteClient(":memory:");
 * client.eventTarget.addEventListener(
 *   // The event types are restricted to the client event types.
 *   "acquire" satisfies ClientEventType,
 *   (event) => {
 *     const { type } = event as ClientEvent<ClientEventType>;
 *     console.log(type); // "acquire"
 *   },
 * );
 * await client.acquire();
 * ```
 */
export type ClientEventType =
  | "connect"
  | "close"
  | "error"
  | "acquire"
  | "release";

/**
 * EventDetail
 *
 * The detail of an event, with the client that dispatched it.
 *
 * @template IClient the dispatching client
 *
 * @example
 * ```ts
 * import type { EventDetail } from "@stdx/database/sql";
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * await using client = new SqliteClient(":memory:");
 * // Every event carries the client that dispatched it.
 * const detail: EventDetail = { client };
 * console.log(detail.client === client); // true
 * ```
 */
export interface EventDetail<IClient = Client> {
  /**
   * The client that dispatched the event
   */
  client: IClient;
}

/**
 * ErrorEventDetail
 *
 * The detail of an `error` event, which additionally carries the error that
 * triggered it.
 *
 * @template IClient the dispatching client
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { QueryError } from "@stdx/database/sql";
 * import type { ClientEvent, ErrorEventDetail } from "@stdx/database/sql";
 *
 * await using client = new SqliteClient(":memory:");
 * client.eventTarget.addEventListener("error", (event) => {
 *   const { error } = (event as ClientEvent<"error">).detail;
 *   console.log(error instanceof QueryError); // true
 * });
 * await client.execute("THIS IS NOT VALID SQL").catch(() => {}); // dispatches the error
 * ```
 */
export interface ErrorEventDetail<IClient = Client>
  extends EventDetail<IClient> {
  /**
   * The error that triggered the event
   */
  error: DatabaseError;
}

/**
 * An event dispatched by a client. Every event carries a detail with the
 * dispatching client; `error` events additionally carry the error.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 * import { ClientEvent } from "@stdx/database/sql";
 *
 * const events: ClientEvent[] = [];
 * await using client = new SqliteClient(":memory:");
 * client.eventTarget.addEventListener("connect", (event) => {
 *   events.push(event as ClientEvent);
 * });
 * await client.connect();
 * console.log(events[0].type); // "connect"
 * console.log(events[0].detail.client === client); // true
 * ```
 */
export class ClientEvent<
  T extends ClientEventType = ClientEventType,
  D extends EventDetail = T extends "error" ? ErrorEventDetail : EventDetail,
> extends CustomEvent<T, D> {}

/**
 * The event target of a client, subscribed to with `addEventListener`.
 *
 * @example
 * ```ts
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * await using client = new SqliteClient(":memory:");
 * let connects = 0;
 * client.eventTarget.addEventListener("connect", () => connects++);
 * await client.connect();
 * console.log(connects); // 1
 * ```
 */
export class ClientEventTarget<
  T extends ClientEventType = ClientEventType,
  E extends ClientEvent<T> = ClientEvent<T>,
> extends CustomEventTarget<T, E> {}

/**
 * Eventable
 *
 * Represents an object that dispatches events. Only the client level
 * dispatches events; driver connections do not.
 *
 * @example
 * ```ts
 * import type { Eventable } from "@stdx/database/sql";
 * import { SqliteClient } from "@stdx/database/drivers/sqlite";
 *
 * // Tools can depend on the events without depending on a client class.
 * function logEvents(db: Eventable): void {
 *   db.eventTarget.addEventListener("error", () =>
 *     console.log("an operation failed")
 *   );
 * }
 * await using client = new SqliteClient(":memory:");
 * logEvents(client);
 * ```
 */
export interface Eventable<
  IEventTarget extends ClientEventTarget = ClientEventTarget,
> {
  /**
   * The target the events are dispatched on
   */
  eventTarget: IEventTarget;
}
