/**
 * JSON Schema types for draft 2020-12.
 *
 * Re-exports the `2020-12` module's types as a namespace, both as
 * `JSONSchema_2020_12` and under its alias `JSONSchema`. For the schema
 * interface itself, import from the subpath:
 *
 * ```ts
 * import type { JSONSchema } from "@stdx/json/json-schema/2020-12";
 *
 * const schema: JSONSchema = {
 *   $schema: "https://json-schema.org/draft/2020-12/schema",
 *   type: "object",
 *   properties: { name: { type: "string" } },
 *   required: ["name"],
 * };
 * ```
 *
 * @module
 */

import type * as JSONSchema_2020_12 from "./json_schema/2020_12.ts";

export type { JSONSchema_2020_12, JSONSchema_2020_12 as JSONSchema };
