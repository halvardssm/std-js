import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertThrows,
} from "@std/assert";
import * as std from "@std/xml";
import { XML, xml, XMLValidator } from "./mod.ts";
import type { ParseOptions, StringifyOptions, XmlDocument } from "@std/xml";
import { getDotPath, SchemaError } from "@standard-schema/utils";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { validate as v } from "@stdx/validation";

// ---------------------------------------------------------------------------
// Helpers (thin class-API adapters, so the fixtures below stay declarative)
// ---------------------------------------------------------------------------

/** Parse XML text into a plain std-shaped document tree. */
function parse(xmlText: string, options?: ParseOptions): XmlDocument {
  return XML.parse(xmlText, options).document;
}

/** Serialize a document tree (ours or @std/xml's) to XML text. */
function stringify(doc: XmlDocument, options?: StringifyOptions): string {
  return new XML(doc).stringify(options);
}

/** Validate a document against an XSD schema, compiling it once for the call. */
function validate(
  schema: string | XmlDocument,
  doc: string | XmlDocument,
): StandardSchemaV1.Result<XmlDocument> {
  using validator = new XMLValidator(schema);
  return validator.validate(doc);
}

// ---------------------------------------------------------------------------
// Fixture corpus
// ---------------------------------------------------------------------------

/** Documents that both implementations must treat identically. */
const COMPAT_CASES: string[] = [
  // minimal
  `<root/>`,
  `<root></root>`,
  `<root><child/></root>`,
  // text content, escaping round-trip
  `<root>hello</root>`,
  `<root>&lt;escaped &amp; text&gt;</root>`,
  // attributes (raw-name keys, incl. prefixed)
  `<root id="1" class="a b"/>`,
  `<a xmlns:ns="urn:x" ns:b="v"/>`,
  // namespaces: prefixed element with uri resolution
  `<a xmlns:ns="urn:x"><ns:b/></a>`,
  // nested namespace shadowing
  `<a xmlns:ns="urn:1"><b xmlns:ns="urn:2"><ns:c/></b></a>`,
  // default namespace does NOT apply uri to element names (std quirk)
  `<a xmlns="urn:default"><b/></a>`,
  // comments, cdata, mixed content
  `<root><!-- comment --><x/><![CDATA[raw < & text]]></root>`,
  `<root>before<x/>after</root>`,
  // whitespace-only text nodes are preserved by default
  `<root>\n  <x/>\n</root>`,
  // empty element with attributes
  `<root a="" b="&quot;quoted&quot;"/>`,
  // self-closing vs pair produce identical trees
  `<root><x/><x></x></root>`,
  // declaration handling
  `<?xml version="1.0"?><root/>`,
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><root/>`,
  // entities in attribute and text
  `<root title="A &amp; B">&#65;&#66;</root>`,
  // deep nesting
  `<a><b><c><d><e/></d></c></b></a>`,
  // multiple roots are NOT legal — single root with many children is
  `<root><x/><y/><z/></root>`,
];

/** Documents that must fail to parse in both implementations. */
const MALFORMED_CASES: string[] = [
  `<root>`,
  `</root>`,
  `<root><to>Alice</root>`,
  `<root/>extra`,
  // NOTE: `<a>&broken;</a>` deliberately excluded — @std/xml throws a plain
  // Error (not a SyntaxError subclass) for undefined entities, so it cannot
  // be asserted symmetrically here. uppsala also treats it as a well-formedness
  // error with a position. Documented divergence.
  `<a attr="unterminated/>`,
  // Namespaces 1.0 forbids binding a prefix to an empty URI. std rejects it
  // at parse time; uppsala accepts it, so the crate rejects it during tree
  // conversion (a default xmlns="" undeclaration is legal and unaffected).
  `<root xmlns:a="" a:b="v"/>`,
];

// ---------------------------------------------------------------------------
// 1. Differential compatibility — parse
// ---------------------------------------------------------------------------

Deno.test("compat > parse produces identical trees to @std/xml", () => {
  for (const xml of COMPAT_CASES) {
    const ours = parse(xml);
    const theirs = std.parse(xml);
    assertEquals(ours, theirs, `parse divergence for: ${xml}`);
  }
});

Deno.test("compat > malformed input throws in both", () => {
  for (const xml of MALFORMED_CASES) {
    // std reference: must also reject
    assertThrows(
      () => std.parse(xml),
      SyntaxError,
      undefined,
      `std accepted: ${xml}`,
    );
    assertThrows(
      () => parse(xml),
      SyntaxError,
      undefined,
      `we accepted: ${xml}`,
    );
  }
});

Deno.test("compat > parse errors are std XmlSyntaxError instances", () => {
  // Use an error that carries a position in both implementations.
  // (`<root>` alone yields UnexpectedEof in uppsala — no position, line 0.)
  try {
    parse("<root><to>Alice</root>");
    throw new Error("unreachable");
  } catch (error) {
    // The wrapper throws @std/xml's actual class, so instanceof works
    // against code written for @std/xml.
    assertInstanceOf(error, std.XmlSyntaxError);
    // position extracted from the formatted message
    assertEquals((error as std.XmlSyntaxError).line, 1);
  }
});

Deno.test("compat > ignoreWhitespace filters whitespace-only text nodes", () => {
  const xml = `<root>\n  <x/>\n  <y>  </y>\n</root>`;
  assertEquals(
    parse(xml, { ignoreWhitespace: true }),
    std.parse(xml, { ignoreWhitespace: true }),
  );
});

Deno.test("compat > ignoreComments filters comment nodes", () => {
  const xml = `<root><!-- c --><x/></root>`;
  assertEquals(
    parse(xml, { ignoreComments: true }),
    std.parse(xml, { ignoreComments: true }),
  );
});

Deno.test("compat > disallowDoctype rejects DOCTYPE by default", () => {
  const xml = `<!DOCTYPE root [<!ENTITY x "y">]><root/>`;
  assertThrows(() => parse(xml), SyntaxError);
  assertThrows(() => std.parse(xml), SyntaxError);
});

Deno.test("compat > maxDepth follows std's counting (root element = depth 0)", () => {
  // std throws iff maxDepth < levels - 1. The differential check pins the
  // exact threshold in both implementations — this used to be off by one
  // here (the root was counted as depth 1).
  const docs: [string, number][] = [
    [`<a/>`, 1],
    [`<a><b/></a>`, 2],
    [`<a><b><c/></b></a>`, 3],
    [`<a><b><c><d/></c></b></a>`, 4],
  ];
  const throws = (fn: () => unknown): boolean => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  for (const [doc, levels] of docs) {
    for (let maxDepth = 0; maxDepth <= levels; maxDepth++) {
      assertEquals(
        throws(() => parse(doc, { maxDepth })),
        throws(() => std.parse(doc, { maxDepth })),
        `maxDepth ${maxDepth} divergence for: ${doc}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Differential compatibility — stringify (cross-serialization)
// ---------------------------------------------------------------------------

// Fixtures whose raw attribute ORDER cannot be reconstructed byte-exactly by
// stringify: uppsala separates xmlns declarations from other attributes, so a
// document that interleaves them (`ns:b` before... actually here xmlns comes
// first, but any interleaving is lost — xmlns attrs are always appended last).
// parse-equality still covers these (object key order is irrelevant there);
// stringify byte-equality does not.
const ORDER_SENSITIVE_EXCLUDE = new Set([
  `<a xmlns:ns="urn:x" ns:b="v"/>`,
  `<a xmlns:ns="urn:x"><ns:b/></a>`,
  `<a xmlns:ns="urn:1"><b xmlns:ns="urn:2"><ns:c/></b></a>`,
  `<a xmlns="urn:default"><b/></a>`,
]);

Deno.test("compat > stringify matches @std/xml for all fixtures", () => {
  for (const xml of COMPAT_CASES) {
    if (ORDER_SENSITIVE_EXCLUDE.has(xml)) continue;
    const ourDoc = parse(xml);
    const stdDoc = std.parse(xml);
    // same input string → identical serialization
    assertEquals(
      stringify(ourDoc),
      std.stringify(stdDoc),
      `stringify divergence for: ${xml}`,
    );
  }
});

Deno.test("compat > cross-serialization both directions (structural identity)", () => {
  for (const xml of COMPAT_CASES) {
    if (ORDER_SENSITIVE_EXCLUDE.has(xml)) continue; // byte equality: attr order
    const ourDoc = parse(xml);
    const stdDoc = std.parse(xml);
    // our tree → std stringify: proves our tree is consumable by std code
    assertEquals(
      std.stringify(ourDoc),
      std.stringify(stdDoc),
      `our tree rejected by std stringify: ${xml}`,
    );
    // std tree → our stringify: proves we accept genuine std trees
    assertEquals(
      stringify(stdDoc),
      stringify(ourDoc),
      `std tree rejected by our stringify: ${xml}`,
    );
  }
});

Deno.test("compat > stringify indent option matches", () => {
  for (const xml of [`<root><x/><y>text</y></root>`, `<a><b><c/></b></a>`]) {
    const doc = parse(xml);
    assertEquals(
      stringify(doc, { indent: "  " }),
      std.stringify(std.parse(xml), { indent: "  " }),
    );
  }
});

Deno.test("compat > stringify declaration option", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><root/>`;
  const doc = parse(xml);
  // default keeps the declaration (std default: true)
  assertEquals(stringify(doc), std.stringify(std.parse(xml)));
  // explicitly off: both drop it
  assertEquals(
    stringify(doc, { declaration: false }),
    std.stringify(std.parse(xml), { declaration: false }),
  );
});

// ---------------------------------------------------------------------------
// 3. Unit tests — validate (no @std/xml equivalent)
// ---------------------------------------------------------------------------

const AGE_XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="age" type="xs:positiveInteger"/>
</xs:schema>`;

const NOTE_XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="note">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="to" type="xs:string" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

Deno.test("validate > conforming document returns { value } with falsy issues", () => {
  const result = validate(AGE_XSD, "<age>25</age>");
  // spec: success is indicated by a FALSY `issues` — undefined, never []
  if (result.issues !== undefined) throw new Error("expected success");
  assertEquals(result.value.root.name.local, "age");
  // result.value is a plain std-compatible tree
  assertEquals(result.value, parse("<age>25</age>"));
});

Deno.test("validate > non-conforming document returns { issues } without value", () => {
  const result = validate(AGE_XSD, "<age>-5</age>");
  if (result.issues === undefined) throw new Error("expected issues");
  assert(result.issues.length > 0);
  assert(result.issues.every((issue) => typeof issue.message === "string"));
  // spec: a failure result carries no `value`
  assertEquals("value" in result, false);
});

Deno.test("validate > issues carry path, line and column (Standard Schema shape)", () => {
  const result = validate(AGE_XSD, "<age>-5</age>");
  if (result.issues === undefined) throw new Error("expected issues");
  assert(result.issues.length > 0);
  const issue = result.issues[0];
  // path is present when uppsala reports a position, and starts at the root
  if (issue.path !== undefined) {
    assert(Array.isArray(issue.path));
    assertEquals(issue.path[0], "age");
    // every segment is a string (name) or number (sibling index)
    assert(
      issue.path.every((seg) =>
        typeof seg === "string" || typeof seg === "number"
      ),
    );
  }
});

Deno.test("validate > path disambiguates repeated siblings with indices", () => {
  // two <item> siblings; the second is invalid — the path must identify it
  const LIST_XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="list">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="item" type="xs:positiveInteger" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
  const result = validate(
    LIST_XSD,
    "<list><item>1</item><item>-2</item></list>",
  );
  if (result.issues === undefined) throw new Error("expected issues");
  assert(result.issues.length > 0);
  const issue = result.issues[0];
  // best-effort: when a position is reported, the path points at the second
  // item — ["list", "item", 1] (0-based index among same-named siblings)
  if (issue.path !== undefined) {
    assertEquals(issue.path, ["list", "item", 1]);
  }
});

Deno.test("validate > path uses plain names when siblings are unique", () => {
  const result = validate(NOTE_XSD, "<note><body>hi</body></note>");
  if (result.issues === undefined) throw new Error("expected issues");
  assert(result.issues.length > 0);
  const issue = result.issues[0];
  // when a path is derived, every segment is a name string — no indices,
  // because no element repeats within its parent
  if (issue.path !== undefined) {
    assert(issue.path.every((seg) => typeof seg === "string"));
    assertEquals(issue.path[0], "note");
  }
});

Deno.test("validate > path has no index for a non-repeated child", () => {
  const result = validate(NOTE_XSD, "<note><body>hi</body></note>");
  if (result.issues === undefined) throw new Error("expected issues");
  const paths = result.issues.map((issue) => issue.path);
  assert(
    paths.some((path) => JSON.stringify(path) === '["note","body"]'),
    `unexpected paths: ${JSON.stringify(paths)}`,
  );
});

Deno.test("validate > structural mismatch reports issues", () => {
  const result = validate(NOTE_XSD, "<note><body>hi</body></note>");
  assert(result.issues !== undefined && result.issues.length > 0);
});

Deno.test("validate > accepts document objects as well as strings", () => {
  const doc = parse("<note><to>Alice</to></note>");
  const fromString = validate(NOTE_XSD, "<note><to>Alice</to></note>");
  const fromObject = validate(NOTE_XSD, doc);
  if (fromString.issues !== undefined || fromObject.issues !== undefined) {
    throw new Error("expected success");
  }

  assertEquals(fromObject.value, fromString.value);
});

Deno.test("validate > schema as object input also works", () => {
  // schema round-trips through parse/stringify just like a document
  const schemaDoc = parse(AGE_XSD);
  const result = validate(schemaDoc, "<age>25</age>");
  assert(result.issues === undefined);
});

Deno.test("validate > malformed document is an issue, not a throw", () => {
  // validate never throws: a document that is not well-formed XML is an issue
  const result = validate(AGE_XSD, "<age>");
  assert(result.issues !== undefined && result.issues.length > 0);
});

Deno.test("validate > broken schema is a schema-authoring error", () => {
  // references an undefined type. uppsala compiles schemas leniently, so an
  // unknown type may surface as a validation issue instead of a compile-time
  // throw. Both outcomes are acceptable: what must NOT happen is a silent
  // success.
  const brokenXsd = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
    <xs:element name="note" type="xs:doesNotExist"/>
  </xs:schema>`;
  let threw = false;
  let issues: readonly { message: string }[] | undefined;
  try {
    issues = validate(brokenXsd, "<note/>").issues;
  } catch {
    threw = true;
  }
  assert(
    threw || (issues !== undefined && issues.length > 0),
    "broken schema neither threw nor reported issues",
  );
});

Deno.test("validate > empty prefix binding is an issue, for text and trees", () => {
  // Namespaces 1.0 forbids binding a prefix to an empty URI; uppsala accepts
  // it, so the crate reports it before XSD validation — the message is
  // deterministic even when the document would also fail the schema.
  const expected = /Cannot unbind namespace prefix/;
  const fromText = validate(AGE_XSD, `<age xmlns:a="">25</age>`);
  assert(fromText.issues?.some((issue) => expected.test(issue.message)));

  // tree input: the check runs on the re-parsed serialization
  const tree = {
    declaration: undefined,
    root: {
      type: "element",
      name: { raw: "age", local: "age" },
      attributes: { "xmlns:a": "" },
      children: [{ type: "text", text: "25" }],
    },
  } as unknown as XmlDocument;
  const fromTree = validate(AGE_XSD, tree);
  assert(fromTree.issues?.some((issue) => expected.test(issue.message)));
});

Deno.test("validate > malformed schema throws", () => {
  assertThrows(
    () => validate("<xs:schema>", "<age>25</age>"),
    std.XmlSyntaxError,
  );
});

// ---------------------------------------------------------------------------
// 3a. XMLValidator (compiled schema)
// ---------------------------------------------------------------------------

Deno.test("validator > reuses one compiled schema across documents", () => {
  using validator = new XMLValidator(AGE_XSD);
  assert(validator.validate("<age>25</age>").issues === undefined);
  assert(validator.validate("<age>-5</age>").issues !== undefined);
  assert(validator.validate("<age>7</age>").issues === undefined);
});

Deno.test("validator > tree input is returned as-is on success", () => {
  using validator = new XMLValidator(parse(AGE_XSD));
  const doc = parse("<age>25</age>");
  const result = validator.validate(doc);
  assert(result.issues === undefined);
  assert(result.value === doc);
});

Deno.test("validator > tree input reports issues with paths", () => {
  using validator = new XMLValidator(NOTE_XSD);
  const result = validator.validate(parse("<note><body>hi</body></note>"));
  if (result.issues === undefined) throw new Error("expected issues");
  assert(
    result.issues.some((issue) =>
      JSON.stringify(issue.path) === '["note","body"]'
    ),
  );
});

Deno.test("validator > parse returns the tree or throws SchemaError", () => {
  using validator = new XMLValidator(AGE_XSD);
  assertEquals(validator.parse("<age>25</age>"), parse("<age>25</age>"));
  assertThrows(() => validator.parse("<age>-5</age>"), SchemaError);
  assertThrows(() => validator.parse("<age>"), std.XmlSyntaxError);
});

Deno.test("validator > schema getter returns the schema tree", () => {
  using validator = new XMLValidator(AGE_XSD);
  assertEquals(validator.schema, parse(AGE_XSD));
});

Deno.test("validator > invalid schema throws on construction", () => {
  assertThrows(() => new XMLValidator("<xs:schema>"), std.XmlSyntaxError);
  assertThrows(() => new XMLValidator(""), std.XmlSyntaxError);
});

// ---------------------------------------------------------------------------
// 3b. Standard Schema facade (xml)
// ---------------------------------------------------------------------------

Deno.test("standard > xml() returns a v1 entity", () => {
  const schema = xml(AGE_XSD);
  assertEquals(schema["~standard"].version, 1);
  assertEquals(schema["~standard"].vendor, "@stdx/xml");
  assert(typeof schema["~standard"].validate === "function");
});

Deno.test("standard > validate success returns { value } with falsy issues", () => {
  const schema = xml(AGE_XSD);
  const result = v(schema, "<age>25</age>");
  // spec: success is indicated by a FALSY `issues` — undefined, never []
  if (result.issues !== undefined) {
    throw new Error(
      `expected success, got issues: ${JSON.stringify(result.issues)}`,
    );
  }
  // value is the parsed tree
  assertEquals(result.value.root.name.local, "age");
});

Deno.test("standard > validate failure returns { issues } without value", () => {
  const schema = xml(AGE_XSD);
  const result = v(schema, "<age>-5</age>");

  assert(result.issues?.length);
  assert(result.issues.length > 0);
  assert(result.issues.every((i) => typeof i.message === "string"));
  // issues may carry a Standard Schema path (element names + indices)
  for (const issue of result.issues) {
    if (issue.path !== undefined) {
      assert(Array.isArray(issue.path));
    }
  }
});

Deno.test("standard > non-XML input is reported as an issue, not a throw", () => {
  const schema = xml(AGE_XSD);
  const result = v(schema, 42);
  assert(result.issues?.length);
  assert(result.issues.length > 0);
});

Deno.test("standard > works with any Standard Schema consumer (structural check)", () => {
  // The whole point of the facade: a generic consumer needs nothing but the
  // spec surface. This test plays that consumer.
  function assertStandardResult(
    entity: StandardSchemaV1,
    input: unknown,
    expectValid: boolean,
  ): void {
    const result = v(entity, input);
    assertEquals(
      !("issues" in result) || result.issues === undefined,
      expectValid,
    );
  }
  const schema = xml(AGE_XSD);
  assertStandardResult(schema, "<age>7</age>", true);
  assertStandardResult(schema, "<age>-7</age>", false);
  assertStandardResult(schema, {}, false);
});

Deno.test("standard > issues interop with @standard-schema/utils", () => {
  // getDotPath flattens a path into a dot-separated string; our path
  // (element names + sibling indices) is exactly the segment shape it
  // expects.
  const LIST_XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="list">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="item" type="xs:positiveInteger" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
  const result = validate(
    LIST_XSD,
    "<list><item>1</item><item>-2</item></list>",
  );
  if (result.issues === undefined) throw new Error("expected issues");
  const dotPath = getDotPath(result.issues[0]);
  // "list.item.1" when a path is derived; undefined when uppsala reported
  // no position for the issue (getDotPath returns undefined for pathless
  // issues — both outcomes are spec-conformant)
  if (dotPath !== undefined) {
    assertEquals(dotPath, "list.item.1");
  }
  // SchemaError renders all issue messages for spec-shaped results
  const err = new SchemaError(result.issues);
  assertInstanceOf(err, Error);
  assert(err.message.length > 0);
});

Deno.test("standard > malformed XML is an issue with a position, not a throw", () => {
  for (const schema of [xml(), xml(AGE_XSD)]) {
    const result = v(schema, "<age><x></age>");
    assert(result.issues?.length === 1);
    assert(result.issues[0].message.length > 0);
    assertEquals((result.issues[0] as { line?: number }).line, 1);
  }
});

Deno.test("standard > without a schema, only well-formedness is checked", () => {
  const schema = xml();
  const ok = v(schema, "<anything><goes/></anything>");
  assert(ok.issues === undefined);
  assertEquals(ok.value, parse("<anything><goes/></anything>"));

  const tree = parse("<a/>");
  const fromTree = v(schema, tree);
  assert(fromTree.issues === undefined && fromTree.value === tree);

  for (const bad of [42, null, {}, { root: "x" }, [], undefined]) {
    assert(v(schema, bad).issues?.length, `accepted ${JSON.stringify(bad)}`);
  }
});

Deno.test("standard > invalid document trees are issues, not throws", () => {
  const badTree = { root: { type: "element" } } as unknown as XmlDocument;
  assert(v(xml(), badTree).issues?.length);
  assert(v(xml(AGE_XSD), badTree).issues?.length);
});

Deno.test("standard > an empty-string schema is compiled, not ignored", () => {
  assertThrows(() => xml(""), std.XmlSyntaxError);
});

// ---------------------------------------------------------------------------
// 3c. XML class surface
// ---------------------------------------------------------------------------

Deno.test("class > XML wraps the tree and exposes std getters", () => {
  const doc = XML.parse(`<root id="1">text</root>`);
  assert(doc instanceof XML);
  assert(doc.document.root === doc.root);
  assertEquals(doc.root.name.local, "root");
  assertEquals(doc.root.attributes, { id: "1" });
  assertEquals(doc.declaration, undefined);
});

Deno.test("class > declaration getter exposes the declaration", () => {
  const doc = XML.parse(`<?xml version="1.0" encoding="UTF-8"?><root/>`);
  assertEquals(doc.declaration?.version, "1.0");
  assertEquals(doc.declaration?.encoding, "UTF-8");
});

Deno.test("class > safeParse success value is an XML, issues on failure", () => {
  const ok = XML.safeParse("<a/>");
  if (ok.issues !== undefined) throw new Error("expected success");
  assert(ok.value instanceof XML);
  const bad = XML.safeParse("<a>");
  assert(bad.issues !== undefined && bad.issues.length > 0);
});

Deno.test("class > tree input round-trips and is returned as-is", () => {
  const tree = parse(`<a x="1"/>`);
  const ok = XML.safeParse(tree);
  if (ok.issues !== undefined) throw new Error("expected success");
  assert(ok.value.document === tree);
  // an illegal element name passes a shape check but fails the round-trip
  const bad = XML.safeParse({
    root: {
      type: "element",
      name: { raw: "1<bad", local: "1<bad" },
      attributes: {},
      children: [],
    },
  } as unknown as XmlDocument);
  assert(bad.issues !== undefined && bad.issues.length > 0);
});

Deno.test("class > instance stringify honors options", () => {
  const doc = XML.parse(`<root><x/></root>`);
  assertEquals(doc.stringify(), `<root><x/></root>`);
  assertEquals(doc.stringify({ indent: "  " }), `<root>\n  <x/>\n</root>`);
});

Deno.test("class > instance validate with a compiled validator and on the fly", () => {
  using validator = new XMLValidator(AGE_XSD);
  const doc = XML.parse("<age>25</age>");
  assert(doc.validate(validator).issues === undefined);
  assert(XML.parse("<age>-5</age>").validate(validator).issues !== undefined);
  // compiling the schema on the fly
  assert(doc.validate(AGE_XSD).issues === undefined);
});

// ---------------------------------------------------------------------------
// 3d. XMLValidator extras
// ---------------------------------------------------------------------------

Deno.test("validator > schema getter is lazy and reflects the input", () => {
  using validator = new XMLValidator(AGE_XSD);
  assertEquals(validator.schema, parse(AGE_XSD));
  // a tree input is reflected as that very tree
  const tree = parse(AGE_XSD);
  using fromTree = new XMLValidator(tree);
  assert(fromTree.schema === tree);
});

Deno.test("validator > parse accepts an XML instance", () => {
  using validator = new XMLValidator(AGE_XSD);
  const doc = XML.parse("<age>25</age>");
  assertEquals(validator.parse(doc), doc.document);
  assertThrows(() => validator.parse(XML.parse("<age>-5</age>")), SchemaError);
});

Deno.test("validator > use after dispose throws, dispose is idempotent", () => {
  const validator = new XMLValidator(AGE_XSD);
  validator[Symbol.dispose]();
  validator[Symbol.dispose]();
  assertThrows(() => validator.validate("<age>25</age>"), Error, "disposed");
  assertThrows(() => validator.parse("<age>25</age>"), Error, "disposed");
});

// ---------------------------------------------------------------------------
// 3e. Issue positions (Standard Schema extras)
// ---------------------------------------------------------------------------

Deno.test("validate > issues carry line/column for XSD validation errors", () => {
  const result = validate(AGE_XSD, "<age>-5</age>");
  if (result.issues === undefined) throw new Error("expected issues");
  assertEquals((result.issues[0] as { line?: number }).line, 1);
  assert(typeof (result.issues[0] as { column?: number }).column === "number");
});

Deno.test("standard > illegal tree names are issues even without a schema", () => {
  const bad = {
    root: {
      type: "element",
      name: { raw: "1<bad", local: "1<bad" },
      attributes: {},
      children: [],
    },
  } as unknown as XmlDocument;
  assert(v(xml(), bad).issues?.length);
});

// ---------------------------------------------------------------------------
// 4. Documented divergences from @std/xml
// ---------------------------------------------------------------------------

Deno.test("divergence > literal whitespace in attribute values is not normalized", () => {
  // XML 1.0 §3.3.3: literal #x9/#xA/#xD in attribute values normalize to a
  // single space. @std/xml normalizes; uppsala preserves them, so we do too.
  // NOT fixable in the crate: uppsala expands character references at parse
  // time, so a literal tab and &#9; are indistinguishable by the time the
  // crate sees the value — normalizing there would clobber references, a
  // worse divergence. Needs an upstream fix; remove this test when uppsala
  // normalizes and we bump.
  const xml = `<root a="a\tb"/>`;
  assertEquals(parse(xml).root.attributes.a, "a\tb");
  assertEquals(std.parse(xml).root.attributes.a, "a b");
  // character references are correctly kept unnormalized by both
  const ref = `<root a="&#9;b"/>`;
  assertEquals(parse(ref).root.attributes.a, "\tb");
  assertEquals(std.parse(ref).root.attributes.a, "\tb");
});

Deno.test("divergence > DOCTYPE with disallowDoctype: false (uppsala parses the subset)", () => {
  const xml = `<!DOCTYPE root [<!ELEMENT root EMPTY>]><root/>`;
  // Both accept with disallowDoctype: false...
  const ours = parse(xml, { disallowDoctype: false });
  const theirs = std.parse(xml, { disallowDoctype: false });
  // ...and the resulting trees are identical (DTD content never reaches the
  // DOM tree in either implementation).
  assertEquals(ours, theirs);
  // The divergence is behavioral (entity expansion caps, subset parsing),
  // not observable in the tree. If this test starts failing because uppsala
  // gained divergent DTD handling, document it here rather than hiding it.
});

Deno.test("divergence > ignored options are accepted without error", () => {
  // Accepted and ignored by design (see the wasm crate header): must not
  // throw, must not change results. (trackPosition is NOT ignored — it is
  // honored for the declaration's position — but this fixture has no
  // declaration, so it makes no difference here.)
  const xml = `<root><x/></root>`;
  assertEquals(
    parse(xml, { trackPosition: false, maxAttributes: 5, xmlVersion: "1.1" }),
    parse(xml),
  );
});

// ---------------------------------------------------------------------------
// 5. Property-style checks (implementation-independent invariants)
// ---------------------------------------------------------------------------

Deno.test("round-trip > stringify(parse(x)) is stable across repeated cycles", () => {
  const start = `<root id="1"><x>text</x><!--c--><y a="b"/></root>`;
  let current = start;
  for (let i = 0; i < 3; i++) {
    current = stringify(parse(current));
  }
  assertEquals(current, stringify(parse(start)));
  assertEquals(parse(current), parse(start));
});
