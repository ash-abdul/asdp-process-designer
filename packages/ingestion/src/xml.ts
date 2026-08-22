/**
 * Minimal XML tokeniser.
 *
 * Enough of XML to read WordprocessingML and nothing more: elements with
 * namespace-prefixed names, attributes, text, and the constructs that appear in
 * `word/document.xml` (comments, processing instructions, CDATA). Adding an XML
 * parser dependency for this would be a runtime dependency for a bounded,
 * testable ~130 lines (**A4**).
 *
 * NOT a general XML parser, and it does not pretend to be:
 *   - no DTD processing and no external entity resolution — which also means no
 *     XXE surface, since a DOCX is untrusted input
 *   - only the five predefined entities plus numeric character references
 *   - no namespace URI resolution; the literal prefix is kept, because OOXML
 *     prefixes are fixed by the format in practice
 *
 * It DOES check element balance, because a truncated document part would
 * otherwise yield partial blocks that look complete.
 *
 * It REFUSES rather than recovers. A malformed part means a `parse_failed`
 * source with a reason, which `L0-ING-001` then reports — never a partial parse
 * that yields text with confident anchors over content we misread.
 */

export class XmlError extends Error {}

export type XmlToken =
  | { readonly kind: 'open'; readonly name: string; readonly attributes: ReadonlyMap<string, string>; readonly selfClosing: boolean }
  | { readonly kind: 'close'; readonly name: string }
  | { readonly kind: 'text'; readonly text: string };

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Decode entity references.
 *
 * Unknown named entities are an error rather than a passthrough: silently
 * leaving `&nbsp;` in the text would put a literal seven-character string into a
 * quote and its checksum, so the anchor would verify against text no human ever
 * wrote.
 */
export function decodeXmlEntities(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const cp = Number.parseInt(body.slice(2), 16);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) {
        throw new XmlError(`invalid character reference '${match}'`);
      }
      return String.fromCodePoint(cp);
    }
    if (body.startsWith('#')) {
      const cp = Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) {
        throw new XmlError(`invalid character reference '${match}'`);
      }
      return String.fromCodePoint(cp);
    }
    const named = NAMED_ENTITIES[body];
    if (named === undefined) {
      throw new XmlError(
        `unsupported entity reference '${match}'; only the five predefined XML entities and ` +
          'numeric character references are decoded',
      );
    }
    return named;
  });
}

const NAME = /[A-Za-z_:][A-Za-z0-9._:-]*/;

/** Parse the attributes of a start tag. */
function parseAttributes(source: string, tagName: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const re = new RegExp(`(${NAME.source})\\s*=\\s*("([^"]*)"|'([^']*)')`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[1] as string;
    const value = m[3] ?? m[4] ?? '';
    attributes.set(name, decodeXmlEntities(value));
  }
  // A bare attribute name with no value is not valid XML; catching it here keeps
  // a malformed part from silently losing an attribute.
  const stripped = source.replace(re, '').trim();
  if (stripped.length > 0 && !/^\/?$/.test(stripped)) {
    throw new XmlError(`malformed attributes on <${tagName}>: '${stripped}'`);
  }
  return attributes;
}

/**
 * Tokenise an XML document.
 *
 * A flat token stream rather than a tree, because the DOCX reader is a
 * single-pass state machine over it and never needs random access. A tree would
 * also mean holding the whole document twice.
 */
export function tokeniseXml(xml: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  /**
   * Open-element stack, so well-formedness is CHECKED and not merely assumed.
   *
   * Without this the tokeniser would accept `<w:body><w:p>` and the DOCX reader
   * would produce blocks from a truncated document — partial text with confident
   * anchors, which is the failure mode this module claims to prevent.
   */
  const open: string[] = [];
  let i = 0;
  const n = xml.length;

  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) {
      const tail = xml.slice(i);
      if (tail.length > 0) tokens.push({ kind: 'text', text: decodeXmlEntities(tail) });
      break;
    }
    if (lt > i) {
      tokens.push({ kind: 'text', text: decodeXmlEntities(xml.slice(i, lt)) });
    }

    // --- comment ---------------------------------------------------------
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) throw new XmlError('unterminated comment');
      i = end + 3;
      continue;
    }
    // --- CDATA -----------------------------------------------------------
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end === -1) throw new XmlError('unterminated CDATA section');
      // CDATA content is literal — no entity decoding, by definition.
      tokens.push({ kind: 'text', text: xml.slice(lt + 9, end) });
      i = end + 3;
      continue;
    }
    // --- processing instruction or DOCTYPE --------------------------------
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt);
      if (end === -1) throw new XmlError('unterminated declaration');
      i = end + 1;
      continue;
    }
    // --- end tag ---------------------------------------------------------
    if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt);
      if (end === -1) throw new XmlError('unterminated end tag');
      const name = xml.slice(lt + 2, end).trim();
      if (!new RegExp(`^${NAME.source}$`).test(name)) {
        throw new XmlError(`malformed end tag '</${name}>'`);
      }
      const expected = open.pop();
      if (expected === undefined) {
        throw new XmlError(`unexpected end tag '</${name}>' with no open element`);
      }
      if (expected !== name) {
        throw new XmlError(`mismatched end tag: expected '</${expected}>', found '</${name}>'`);
      }
      tokens.push({ kind: 'close', name });
      i = end + 1;
      continue;
    }

    // --- start tag -------------------------------------------------------
    // Scan for the closing '>' that is not inside an attribute value.
    let j = lt + 1;
    let quote: string | null = null;
    for (; j < n; j++) {
      const c = xml[j] as string;
      if (quote !== null) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
    }
    if (j >= n) throw new XmlError('unterminated start tag');

    const inner = xml.slice(lt + 1, j);
    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const nameMatch = new RegExp(`^(${NAME.source})`).exec(body.trimStart());
    if (nameMatch === null) throw new XmlError(`malformed start tag '<${body}>'`);
    const name = nameMatch[1] as string;
    const attributes = parseAttributes(body.trimStart().slice(name.length), name);

    tokens.push({ kind: 'open', name, attributes, selfClosing });
    if (!selfClosing) open.push(name);
    i = j + 1;
  }

  if (open.length > 0) {
    throw new XmlError(
      `unclosed element(s): ${open.map((name) => `<${name}>`).reverse().join(', ')}`,
    );
  }

  return tokens;
}

/** Local name with the namespace prefix removed. */
export function localName(name: string): string {
  const at = name.indexOf(':');
  return at === -1 ? name : name.slice(at + 1);
}
