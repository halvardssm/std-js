# @stdx/xml

[![JSR](https://jsr.io/badges/@stdx/xml)](https://jsr.io/@stdx/xml)
[![JSR Score](https://jsr.io/badges/@stdx/xml/score)](https://jsr.io/@stdx/xml)
[![Weekly downloads](https://jsr.io/badges/@stdx/xml/weekly-downloads)](https://jsr.io/@stdx/xml)
[![Total downloads](https://jsr.io/badges/@stdx/xml/total-downloads)](https://jsr.io/@stdx/xml)

Extends [@std/xml](https://jsr.io/@std/xml)

The xml package provides XML parsing, serialization, and XSD validation, backed
by a WebAssembly implementation. It is a drop-in for `@std/xml` — shared types
are imported from `@std/xml` and parse/stringify produce the same trees — with
three additions: a class-based `XML` document wrapper, reusable compiled XSD
validators (`XMLValidator`), and a
[Standard Schema v1](https://standardschema.dev) facade (`xml()`).

## Entrypoints

### Parsing and serializing

`XML.parse` parses XML text (or accepts a document tree) into an `XML` instance
and throws `@std/xml`'s `XmlSyntaxError` for malformed input. `XML.safeParse`
never throws — every problem is an issue.

```ts
import { XML } from "@stdx/xml";

const doc = XML.parse(`<root id="1"><child>hello</child></root>`);

doc.root.name.local; // "root"
doc.root.attributes["id"]; // "1"

// Serialize back to text
doc.stringify(); // `<root id="1"><child>hello</child></root>`
doc.stringify({ indent: "  " }); // pretty-print
doc.stringify({ declaration: false }); // omit an existing <?xml ...?>

// Non-throwing variant
const result = XML.safeParse("<root>");
if (result.issues) {
  console.error(result.issues[0].message);
} else {
  console.log(result.value.root.name);
}
```

Parser options are `@std/xml`'s `ParseOptions` (`ignoreWhitespace`,
`ignoreComments`, `ignoreDeclaration`):

```ts
import { XML } from "@stdx/xml";

const doc = XML.parse(`<root><!-- c -->\n  <x/>\n</root>`, {
  ignoreComments: true,
  ignoreWhitespace: true,
});
```

### Building a document

The `XML` constructor accepts an existing document tree, so documents can be
built programmatically instead of parsed. The node types (`XmlElement`,
`XmlTextNode`, `XmlCommentNode`, `XmlCDataNode`) are `@std/xml`'s:

```ts
import { XML } from "@stdx/xml";
import type { XmlElement, XmlTextNode } from "@stdx/xml";

const child: XmlElement = {
  type: "element",
  name: { raw: "child", local: "child" },
  attributes: {},
  children: [{ type: "text", text: "hello" } satisfies XmlTextNode],
};

const doc = new XML({
  root: {
    type: "element",
    name: { raw: "root", local: "root" },
    attributes: { id: "1" },
    children: [child],
  },
});

doc.stringify(); // `<root id="1"><child>hello</child></root>`
```

A tree handed to the constructor is not validated; `XML.safeParse(doc)`
round-trips it through the serializer to check it is well-formed, and
`XML.parse(doc)` throws `XmlSyntaxError` if it is not.

### XSD validation

`XMLValidator` compiles an XSD schema once into wasm memory and reuses it across
many documents. Release it deterministically with `using`, or let garbage
collection do it.

```ts
import { XMLValidator } from "@stdx/xml";

using validator = new XMLValidator(`<xs:schema
  xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="age" type="xs:positiveInteger"/>
</xs:schema>`);

// Non-throwing: result is { value } or { issues }
validator.validate("<age>25</age>"); // { value: ... }
validator.validate("<age>-5</age>"); // { issues: [...] }

// Throwing: SchemaError for schema violations, XmlSyntaxError otherwise
const tree = validator.parse("<age>25</age>");

// Documents accept a validator directly
import { XML } from "@stdx/xml";
XML.parse("<age>25</age>").validate(validator); // { value: ... }
```

### Standard Schema

`xml()` returns a [Standard Schema v1](https://standardschema.dev) entity,
usable with any Standard Schema-aware tool. Validation never throws for bad
input; issues carry `path` (element names + sibling indices) and std-style
`line`/`column` when a position is known.

```ts
import { xml } from "@stdx/xml";

const schema = xml(`<xs:schema
  xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="age" type="xs:positiveInteger"/>
</xs:schema>`);

const result = await schema["~standard"].validate("<age>25</age>");
if (result.issues) {
  console.error(result.issues[0].message);
} else {
  console.log(result.value); // the document tree
}

// Without a schema, only well-formedness is checked
xml()["~standard"].validate("<root>"); // { issues: [...] }
```

## Types

Document and option types (`XmlDocument`, `XmlElement`, `ParseOptions`,
`StringifyOptions`, ...) are re-exported as-is from `@std/xml`, so existing
`@std/xml` consumers need no changes. Validation results (`XmlValidationResult`)
follow [Standard Schema v1](https://standardschema.dev).
