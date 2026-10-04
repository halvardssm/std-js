// _wasm/xml_xml/src/lib.rs
//
// @stdx/xml — wasm bindings for the `uppsala` crate, producing trees that
// are drop-in compatible with @std/xml (https://jsr.io/@std/xml).
//
// Values cross the wasm boundary as plain JS values (serde-wasm-bindgen):
// the JS wrapper (xml/mod.ts) passes options and document trees as objects
// and receives Standard Schema result objects — no JSON (de)serialization
// on the JS side.
//
//   parse(text, options?)  → { value: XmlDocument } | { issues } — never
//                            throws. XML text only: tree input is handled
//                            by the wrapper, which already holds the tree.
//   stringify(doc, opts?)  → XML text (@std/xml's StringifyOptions)
//   XmlSchema              → compiled XSD; `new` accepts XML text or a tree
//                            (throws on an invalid schema — a schema-
//                            authoring error); `validate` accepts either
//                            and never throws: problems are issues.
//
// Options parity (parse): ignoreWhitespace and ignoreComments filter during
// tree conversion; disallowDoctype is uppsala's `with_forbid_dtd` (default
// true, as in std — when false, uppsala parses the DTD internal subset,
// whereas @std/xml ignores it); maxDepth uses std semantics (root element =
// depth 0), checked during tree conversion, with uppsala's limit as a
// backstop; trackPosition is honored for the declaration's position
// (default true); maxAttributes and xmlVersion are accepted and ignored.
//
// Issue messages carry std's XmlSyntaxError style ("… at line L, column C")
// when uppsala reports a position.
//
// Namespaces 1.0 forbids binding a prefix to an empty URI; uppsala accepts
// it, so the crate rejects it on the parse and validate paths (std rejects
// it at parse time). The default xmlns="" undeclaration is legal and
// unaffected.
//
// NEVER use QName::to_string() for raw names — it emits Clark notation
// ({uri}local). Raw names are rebuilt from prefix + local name.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_wasm_bindgen::Serializer;
use uppsala::dom::{Document, NodeId, NodeKind, QName};
use uppsala::error::XmlError;
use uppsala::{Parser, XsdValidator};
use wasm_bindgen::prelude::*;

// Only types @std/xml does not provide are declared here; the wrapper
// imports every shared type from @std/xml.
#[wasm_bindgen(typescript_custom_section)]
const IXML_TYPES: &'static str = r#"
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { XmlDocument } from "@std/xml";

/**
 * A Standard Schema shaped issue: `message`, plus a best-effort `path` —
 * the chain of enclosing element names with 0-based indices for repeated
 * siblings.
 */
export type XmlIssue = {
  message: string;
  path?: (string | number)[];
};

/**
 * Result of `parse` — it never throws, every problem is an issue:
 *   - well-formed XML text → `{ value: XmlDocument }`
 *   - otherwise            → `{ issues: XmlIssue[] }`
 */
export type XmlParseResult = {
  value?: XmlDocument;
  issues?: XmlIssue[];
};

/**
 * Result of `XmlSchema.validate` — it never throws, every problem is an
 * issue:
 *   - XML text input, valid → `{ value: XmlDocument }`
 *   - tree input, valid     → `{}` — the caller already holds the tree
 *   - otherwise             → `{ issues: StandardSchemaV1.Issue[] }`
 */
export type XmlValidationResult = StandardSchemaV1.Result<XmlDocument>
"#;

#[wasm_bindgen]
extern "C" {
  #[wasm_bindgen(typescript_type = "XmlParseResult")]
  pub type XmlParseResult;
  #[wasm_bindgen(typescript_type = "XmlValidationResult")]
  pub type XmlValidationResult;
}

// ---------------------------------------------------------------------------
// @std/xml-compatible types
// ---------------------------------------------------------------------------

/// `XmlName`. Like @std/xml, `uri` is only set for prefixed names (the
/// default namespace is not applied to element names).
#[derive(Serialize, Deserialize)]
struct StdXmlName {
  raw: String,
  local: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  prefix: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  uri: Option<String>,
}

/// `XmlNode` — no PI variant, matching @std/xml.
#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum StdXmlNode {
  Element {
    name: StdXmlName,
    /// Keyed by raw attribute name (incl. xmlns declarations); IndexMap
    /// keeps document / input-object order.
    attributes: IndexMap<String, String>,
    children: Vec<StdXmlNode>,
  },
  Text {
    text: String,
  },
  Cdata {
    text: String,
  },
  Comment {
    text: String,
  },
}

/// `XmlDeclaration` — carries `type: "declaration"` and std's position
/// fields (0/0/0 is std's "position unavailable" sentinel).
#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename = "declaration")]
struct StdXmlDeclaration {
  version: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  encoding: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  standalone: Option<String>,
  #[serde(default)]
  line: usize,
  #[serde(default)]
  column: usize,
  #[serde(default)]
  offset: usize,
}

#[derive(Serialize, Deserialize)]
struct StdXmlDocument {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  declaration: Option<StdXmlDeclaration>,
  root: StdXmlNode,
}

/// Standard Schema shaped issue; `path` is derived best-effort from the
/// validator's (line, column) position.
#[derive(Serialize)]
struct ValidateIssue {
  message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  path: Option<Vec<PathSegment>>,
}

/// Standard Schema path segment: element name or sibling index.
#[derive(Serialize)]
#[serde(untagged)]
enum PathSegment {
  Name(String),
  Index(usize),
}

/// The result of `parse` and `XmlSchema.validate`: on the JS side either
/// `{ value }` or `{ issues }`.
#[derive(Serialize)]
struct Outcome {
  #[serde(skip_serializing_if = "Option::is_none")]
  value: Option<StdXmlDocument>,
  #[serde(skip_serializing_if = "Option::is_none")]
  issues: Option<Vec<ValidateIssue>>,
}

fn ok_outcome(value: Option<StdXmlDocument>) -> Outcome {
  Outcome {
    value,
    issues: None,
  }
}

fn issue_outcome(message: String) -> Outcome {
  Outcome {
    value: None,
    issues: Some(vec![ValidateIssue {
      message,
      path: None,
    }]),
  }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParseOptions {
  ignore_whitespace: bool,
  ignore_comments: bool,
  disallow_doctype: Option<bool>,
  max_depth: Option<u32>,
  track_position: Option<bool>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct StringifyOptions {
  indent: Option<String>,
  declaration: Option<bool>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn js_err(message: impl std::fmt::Display) -> JsError {
  JsError::new(&message.to_string())
}

/// Serialize a value into a JS value: plain objects for maps, `undefined`
/// for missing fields — the same shapes `JSON.parse` would produce.
fn to_js_value(value: &impl Serialize) -> Result<JsValue, JsError> {
  value
    .serialize(&Serializer::new().serialize_maps_as_objects(true))
    .map_err(js_err)
}

/// Lenient options decoding: invalid options fall back to the defaults.
fn from_js_value_or_default<T: DeserializeOwned + Default>(
  value: JsValue,
) -> T {
  serde_wasm_bindgen::from_value(value).unwrap_or_default()
}

/// Decode a JS value as an @std/xml `XmlDocument` tree.
fn tree_from_js_value(doc: JsValue) -> Result<StdXmlDocument, String> {
  serde_wasm_bindgen::from_value(doc)
    .map_err(|e| format!("invalid XmlDocument object: {e}"))
}

/// Format an uppsala error in @std/xml's XmlSyntaxError message style.
///
/// The "… at line L, column C" suffix is a contract with the JS wrapper
/// (POSITION_RE in xml/mod.ts derives XmlSyntaxError positions and issue
/// `line`/`column` fields from it) — do not change the format without
/// updating the wrapper.
fn error_message(e: &XmlError) -> String {
  match e {
    XmlError::Parse(p) => {
      format!("{} at line {}, column {}", p.message, p.line, p.column)
    }
    XmlError::WellFormedness(w) => {
      format!("{} at line {}, column {}", w.message, w.line, w.column)
    }
    _ => e.to_string(),
  }
}

fn qname_raw(name: &QName<'_>) -> String {
  match &name.prefix {
    Some(p) => format!("{p}:{}", name.local_name),
    None => name.local_name.to_string(),
  }
}

/// The first prefix bound to an empty URI in the document, if any.
/// Namespaces 1.0 forbids undeclaring a prefix this way; uppsala allows it,
/// @std/xml rejects it, so the crate rejects it too. Undeclaring the default
/// namespace (xmlns="") is legal and unaffected.
fn unbind_error(doc: &Document<'_>) -> Option<String> {
  fn check(doc: &Document<'_>, id: NodeId) -> Option<String> {
    if let Some(NodeKind::Element(el)) = doc.node_kind(id)
      && el
        .namespace_declarations
        .iter()
        .any(|(prefix, uri)| !prefix.is_empty() && uri.is_empty())
    {
      return Some(
        "Cannot unbind namespace prefix (empty URI) in Namespaces 1.0"
          .to_string(),
      );
    }
    doc.children_iter(id).find_map(|child| check(doc, child))
  }
  doc.document_element().and_then(|root| check(doc, root))
}

// ---------------------------------------------------------------------------
// uppsala DOM → std tree
// ---------------------------------------------------------------------------

/// The declaration's position in @std/xml's terms. uppsala does not expose
/// it, but the declaration must come first, so it sits at the first '<'
/// that is not a comment (lenient input may put comments before it). Line
/// is 1-based, column is 1-based within the line, offset is in UTF-16
/// code units.
fn declaration_position(input: &str) -> (usize, usize, usize) {
  let lt = {
    let mut from = 0;
    loop {
      match input[from..].find('<') {
        None => return (0, 0, 0),
        Some(i) => {
          let at = from + i;
          if input[at..].starts_with("<?xml") {
            break at;
          }
          if input[at..].starts_with("<!--") {
            // Skip the comment and keep looking.
            match input[at..].find("-->") {
              Some(end) => from = at + end + 3,
              None => return (0, 0, 0),
            }
          } else {
            // Some other construct precedes the declaration.
            return (0, 0, 0);
          }
        }
      }
    }
  };
  let (mut line, mut line_start, mut offset) = (1, 0, 0);
  for ch in input[..lt].chars() {
    offset += ch.len_utf16();
    if ch == '\n' {
      line += 1;
      line_start = offset;
    }
  }
  (line, offset - line_start + 1, offset)
}

/// Convert a node and its subtree. Returns `Ok(None)` for nodes std's tree
/// has no equivalent for (PIs) or that the options filter out. `depth` is
/// the element depth in std's terms (root = 0).
fn node_to_std(
  doc: &Document<'_>,
  id: NodeId,
  opts: &ParseOptions,
  depth: u32,
) -> Result<Option<StdXmlNode>, String> {
  let node = match doc.node_kind(id) {
    Some(NodeKind::Element(el)) => {
      if let Some(max) = opts.max_depth.filter(|&max| depth > max) {
        return Err(format!(
          "maximum element nesting depth ({max}) exceeded at depth {depth}"
        ));
      }
      // std keeps namespace declarations as plain attributes; uppsala
      // stores them separately.
      let attributes = el
        .attributes
        .iter()
        .map(|a| (qname_raw(&a.name), a.value.to_string()))
        .chain(el.namespace_declarations.iter().map(|(prefix, uri)| {
          let key = if prefix.is_empty() {
            "xmlns".to_string()
          } else {
            format!("xmlns:{prefix}")
          };
          (key, uri.to_string())
        }))
        .collect();
      let mut children = Vec::new();
      for child in doc.children_iter(id) {
        if let Some(node) = node_to_std(doc, child, opts, depth + 1)? {
          children.push(node);
        }
      }
      StdXmlNode::Element {
        name: StdXmlName {
          raw: qname_raw(&el.name),
          local: el.name.local_name.to_string(),
          prefix: el.name.prefix.as_ref().map(|p| p.to_string()),
          uri: el
            .name
            .prefix
            .as_ref()
            .and(el.name.namespace_uri.as_ref())
            .map(|u| u.to_string()),
        },
        attributes,
        children,
      }
    }
    Some(NodeKind::Text(t))
      if !(opts.ignore_whitespace && t.trim().is_empty()) =>
    {
      StdXmlNode::Text {
        text: t.to_string(),
      }
    }
    Some(NodeKind::CData(t)) => StdXmlNode::Cdata {
      text: t.to_string(),
    },
    Some(NodeKind::Comment(t)) if !opts.ignore_comments => {
      StdXmlNode::Comment {
        text: t.to_string(),
      }
    }
    _ => return Ok(None),
  };
  Ok(Some(node))
}

fn document_to_std(
  doc: &Document<'_>,
  input: &str,
  opts: &ParseOptions,
) -> Result<StdXmlDocument, String> {
  if let Some(e) = unbind_error(doc) {
    return Err(e);
  }
  let root_id = doc
    .document_element()
    .ok_or_else(|| "document has no root element".to_string())?;
  let declaration = doc.xml_declaration.as_ref().map(|d| {
    let (line, column, offset) = if opts.track_position.unwrap_or(true) {
      declaration_position(input)
    } else {
      (0, 0, 0)
    };
    StdXmlDeclaration {
      version: d.version.to_string(),
      encoding: d.encoding.as_ref().map(|e| e.to_string()),
      standalone: d.standalone.map(|b| (if b { "yes" } else { "no" }).into()),
      line,
      column,
      offset,
    }
  });
  let root = node_to_std(doc, root_id, opts, 0)?
    .ok_or_else(|| "document element is not an element".to_string())?;
  Ok(StdXmlDocument { declaration, root })
}

// ---------------------------------------------------------------------------
// std tree → XML text
// ---------------------------------------------------------------------------

/// Escape `&`, `<`, `>` (and `"` for attribute values) in a single pass.
fn push_escaped(out: &mut String, s: &str, attr: bool) {
  let mut last = 0;
  for (i, b) in s.bytes().enumerate() {
    let entity = match b {
      b'&' => "&amp;",
      b'<' => "&lt;",
      b'>' => "&gt;",
      b'"' if attr => "&quot;",
      _ => continue,
    };
    out.push_str(&s[last..i]);
    out.push_str(entity);
    last = i + 1;
  }
  out.push_str(&s[last..]);
}

/// Mirror of @std/xml's serializer:
///   - the indent prefix applies to elements and comments only
///   - an element whose children are all text/cdata is written inline
///   - otherwise each child goes on its own line (when indenting), and the
///     closing tag gets the element's own prefix
fn write_node(
  node: &StdXmlNode,
  out: &mut String,
  indent: Option<&str>,
  depth: usize,
) -> Result<(), String> {
  let push_prefix = |out: &mut String| {
    if let Some(indent) = indent {
      for _ in 0..depth {
        out.push_str(indent);
      }
    }
  };
  match node {
    StdXmlNode::Element {
      name,
      attributes,
      children,
    } => {
      push_prefix(out);
      out.push('<');
      out.push_str(&name.raw);
      for (k, v) in attributes {
        out.push(' ');
        out.push_str(k);
        out.push_str("=\"");
        push_escaped(out, v, true);
        out.push('"');
      }
      if children.is_empty() {
        out.push_str("/>");
        return Ok(());
      }
      out.push('>');
      let inline = children.iter().all(|c| {
        matches!(c, StdXmlNode::Text { .. } | StdXmlNode::Cdata { .. })
      });
      if inline {
        for child in children {
          write_node(child, out, indent, depth + 1)?;
        }
      } else {
        for child in children {
          if indent.is_some() {
            out.push('\n');
          }
          write_node(child, out, indent, depth + 1)?;
        }
        if indent.is_some() {
          out.push('\n');
        }
        push_prefix(out);
      }
      out.push_str("</");
      out.push_str(&name.raw);
      out.push('>');
    }
    StdXmlNode::Text { text } => push_escaped(out, text, false),
    // Split "]]>" across two CDATA sections, as @std/xml does.
    StdXmlNode::Cdata { text } => {
      out.push_str("<![CDATA[");
      out.push_str(&text.replace("]]>", "]]]]><![CDATA[>"));
      out.push_str("]]>");
    }
    // @std/xml rejects comments that cannot be serialized (XML 1.0 §2.5).
    StdXmlNode::Comment { text } => {
      if text.contains("--") {
        return Err(
          "Cannot serialize comment: XML forbids \"--\" within comments"
            .to_string(),
        );
      }
      if text.ends_with('-') {
        return Err(
          "Cannot serialize comment: trailing \"-\" would produce invalid \"--->\"".to_string(),
        );
      }
      push_prefix(out);
      out.push_str("<!--");
      out.push_str(text);
      out.push_str("-->");
    }
  }
  Ok(())
}

fn std_document_to_xml(
  doc: &StdXmlDocument,
  opts: &StringifyOptions,
) -> Result<String, String> {
  let mut out = String::new();
  if let Some(decl) = doc
    .declaration
    .as_ref()
    .filter(|_| opts.declaration.unwrap_or(true))
  {
    out.push_str("<?xml version=\"");
    out.push_str(&decl.version);
    out.push('"');
    if let Some(enc) = &decl.encoding {
      out.push_str(" encoding=\"");
      out.push_str(enc);
      out.push('"');
    }
    if let Some(sa) = &decl.standalone {
      out.push_str(" standalone=\"");
      out.push_str(sa);
      out.push('"');
    }
    out.push_str("?>");
    if opts.indent.is_some() {
      out.push('\n');
    }
  }
  write_node(&doc.root, &mut out, opts.indent.as_deref(), 0)?;
  Ok(out)
}

// ---------------------------------------------------------------------------
// Issue position → Standard Schema path
// ---------------------------------------------------------------------------

/// Byte offset of each line start, for mapping uppsala's (line, column)
/// positions — the column is a 1-based byte column — back to byte offsets.
fn line_starts(input: &str) -> Vec<usize> {
  std::iter::once(0)
    .chain(
      input
        .bytes()
        .enumerate()
        .filter(|&(_, b)| b == b'\n')
        .map(|(i, _)| i + 1),
    )
    .collect()
}

/// The chain of element names from the root down to the deepest element
/// containing `offset`, with a 0-based index after a name only when its
/// parent has more than one child element of that name.
fn path_at(doc: &Document<'_>, offset: usize) -> Option<Vec<PathSegment>> {
  let contains =
    |id: NodeId| doc.node_range(id).is_some_and(|r| r.contains(&offset));
  let mut current = doc.document_element().filter(|&id| contains(id))?;
  let mut path =
    vec![PathSegment::Name(qname_raw(&doc.element(current)?.name))];
  while let Some(child) = doc
    .children_iter(current)
    .find(|&c| doc.element(c).is_some() && contains(c))
  {
    let name = &doc.element(child)?.name;
    let same_name = |&id: &NodeId| {
      doc.element(id).is_some_and(|e| {
        e.name.local_name == name.local_name && e.name.prefix == name.prefix
      })
    };
    let index = doc
      .children_iter(current)
      .take_while(|&id| id != child)
      .filter(same_name)
      .count();
    let repeated = index > 0
      || doc
        .children_iter(current)
        .filter(same_name)
        .nth(1)
        .is_some();
    path.push(PathSegment::Name(qname_raw(name)));
    if repeated {
      path.push(PathSegment::Index(index));
    }
    current = child;
  }
  Some(path)
}

// ---------------------------------------------------------------------------
// Public wasm API
// ---------------------------------------------------------------------------

/// Parse XML text with std's `ParseOptions` semantics into a Standard
/// Schema result. Never throws: every problem is an issue.
fn parse_text(text: &str, opts: &ParseOptions) -> Outcome {
  let mut parser = Parser::new();
  if let Some(max_depth) = opts.max_depth {
    // std counts the root element as depth 0, uppsala as 1 — pass one more
    // so the backstop only fires beyond std's limit (checked again, with
    // std's counting, during tree conversion).
    parser = parser.with_max_depth(max_depth.saturating_add(1));
  }
  if opts.disallow_doctype.unwrap_or(true) {
    parser = parser.with_forbid_dtd(true);
  }
  let doc = match parser.parse(text) {
    Ok(doc) => doc,
    Err(e) => return issue_outcome(error_message(&e)),
  };
  match document_to_std(&doc, text, opts) {
    Ok(tree) => ok_outcome(Some(tree)),
    Err(e) => issue_outcome(e),
  }
}

/// Parse XML text into a Standard Schema result. Never throws: every
/// problem is an issue. Tree input is not accepted — the wrapper already
/// holds any tree it could pass.
///
/// Returns `{ value }` (the parsed tree) on success, `{ issues }` otherwise.
#[wasm_bindgen]
pub fn parse(
  input: JsValue,
  options: JsValue,
) -> Result<XmlParseResult, JsError> {
  let outcome = match input.as_string() {
    Some(text) => parse_text(&text, &from_js_value_or_default(options)),
    None => issue_outcome("expected an XML string".to_string()),
  };
  Ok(XmlParseResult::from(to_js_value(&outcome)?))
}

/// Serialize an @std/xml `XmlDocument` tree to XML text.
///
/// `options` is @std/xml's `StringifyOptions`.
///
/// @throws {Error} if the input is not a valid XmlDocument, or contains a
/// comment that cannot be serialized.
#[wasm_bindgen]
pub fn stringify(doc: JsValue, options: JsValue) -> Result<String, JsError> {
  let tree = tree_from_js_value(doc).map_err(js_err)?;
  std_document_to_xml(&tree, &from_js_value_or_default(options)).map_err(js_err)
}

/// A compiled XSD schema. Compile once, then validate any number of
/// documents given as XML text or as `XmlDocument` trees.
#[wasm_bindgen]
pub struct XmlSchema {
  validator: XsdValidator,
}

#[wasm_bindgen]
impl XmlSchema {
  /// Compile a schema from XML text or an `XmlDocument` tree.
  ///
  /// @throws {Error} if the schema is not well-formed or not a valid XSD.
  #[wasm_bindgen(constructor)]
  pub fn new(schema: JsValue) -> Result<XmlSchema, JsError> {
    let text = match schema.as_string() {
      Some(text) => text,
      None => {
        let tree = tree_from_js_value(schema).map_err(js_err)?;
        std_document_to_xml(&tree, &StringifyOptions::default())
          .map_err(js_err)?
      }
    };
    let schema_doc =
      uppsala::parse(&text).map_err(|e| js_err(error_message(&e)))?;
    let validator = XsdValidator::from_schema(&schema_doc)
      .map_err(|e| js_err(format_args!("invalid schema: {e}")))?;
    Ok(XmlSchema { validator })
  }

  /// Validate a document — XML text or an `XmlDocument` tree — against the
  /// schema. Never throws: every problem is an issue.
  ///
  /// Returns `{ value }` for valid XML text (the parsed tree), `{}` for a
  /// valid tree (the caller already holds it), `{ issues }` otherwise.
  pub fn validate(
    &self,
    document: JsValue,
  ) -> Result<XmlValidationResult, JsError> {
    let outcome = match document.as_string() {
      Some(text) => self.validate_text(&text),
      None => self.validate_tree(document),
    };
    Ok(XmlValidationResult::from(to_js_value(&outcome)?))
  }
}

impl XmlSchema {
  /// Validate XML text: the parsed tree is returned on success.
  fn validate_text(&self, text: &str) -> Outcome {
    match uppsala::parse(text) {
      Ok(doc) => self.validate_doc(&doc, text, true),
      Err(e) => issue_outcome(error_message(&e)),
    }
  }

  /// Validate a tree: it is serialized and re-parsed for validation, and
  /// never sent back on success.
  fn validate_tree(&self, document: JsValue) -> Outcome {
    let tree = match tree_from_js_value(document) {
      Ok(tree) => tree,
      Err(e) => return issue_outcome(e),
    };
    let text = match std_document_to_xml(&tree, &StringifyOptions::default()) {
      Ok(text) => text,
      Err(e) => return issue_outcome(e),
    };
    match uppsala::parse(&text) {
      Ok(doc) => self.validate_doc(&doc, &text, false),
      Err(e) => issue_outcome(error_message(&e)),
    }
  }

  /// Validation outcome for a parsed document. `send_tree` decides whether
  /// the std tree is built and returned (text input) or the result stays
  /// empty (tree input — the caller already holds it). Validation sees the
  /// full document: no whitespace/comment filtering.
  fn validate_doc(
    &self,
    doc: &Document<'_>,
    input: &str,
    send_tree: bool,
  ) -> Outcome {
    if let Some(e) = unbind_error(doc) {
      return issue_outcome(e);
    }
    if let Some(issues) = self.issues(doc, input) {
      return Outcome {
        value: None,
        issues: Some(issues),
      };
    }
    match if send_tree {
      document_to_std(doc, input, &ParseOptions::default()).map(Some)
    } else {
      Ok(None)
    } {
      Ok(tree) => ok_outcome(tree),
      Err(e) => issue_outcome(e),
    }
  }

  /// Validation issues for a parsed document, or `None` when it is valid.
  fn issues(
    &self,
    doc: &Document<'_>,
    input: &str,
  ) -> Option<Vec<ValidateIssue>> {
    let errors = self.validator.validate(doc);
    if errors.is_empty() {
      return None;
    }
    let starts = line_starts(input);
    let issues = errors
      .into_iter()
      .map(|e| {
        let path = e
          .line
          .zip(e.column)
          .filter(|&(line, column)| line > 0 && column > 0)
          .and_then(|(line, column)| {
            starts.get(line - 1).map(|s| s + column - 1)
          })
          .and_then(|offset| path_at(doc, offset));
        ValidateIssue {
          message: e.to_string(),
          path,
        }
      })
      .collect();
    Some(issues)
  }
}
