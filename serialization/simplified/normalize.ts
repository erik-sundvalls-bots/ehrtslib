/** Node id → at-code for paths, by the ADL2 spec rule (`id1` → `at0000`). */
export { nodeIdToAtCode } from "../../generation/id_to_at_code.ts";

/**
 * Web Template node id normalisation, following the "Node ID Generation
 * Rules" of the ITS-REST simplified formats specification:
 * 1. replace chars that are not Unicode-alphabetic, digit, `_`, `.` or `-`
 *    with `_`; 2. collapse repeated `_`; 3. lowercase; 4. trim `_`;
 * 5. empty → "id"; 6. leading digit → prepend "a".
 */
export function normalizeWebTemplateId(text: string): string {
  let id = text
    .trim()
    .replace(/[^\p{L}\p{N}_.\-]+/gu, "_")
    .replace(/_+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
  if (!id) id = "id";
  if (/^\d/.test(id)) id = `a${id}`;
  return id;
}

/**
 * Root path segment for FLAT/STRUCTURED keys: the normalised template id
 * (dots and dashes retained, e.g. "conformance-ehrbase.de.v0").
 */
export function templateRootId(templateId: string): string {
  return normalizeWebTemplateId(templateId);
}

/** Join AQL path segments without duplicate slashes. */
export function joinAqlPath(base: string, segment: string): string {
  const seg = segment.startsWith("/") ? segment.slice(1) : segment;
  if (!base || base === "/") return `/${seg}`;
  return `${base.replace(/\/$/, "")}/${seg}`;
}

/** One step of an AQL path: `attr`, `attr[nodeId]` or `attr[nodeId and name/value='…']`. */
export interface AqlPathSegment {
  attr: string;
  nodeId?: string;
  /** Value of a `name/value` predicate (Web Template paths of name-constrained siblings). */
  nameValue?: string;
  /** The segment as written, with its leading `/`. */
  raw: string;
}

const PREDICATE_RE =
  /^\s*([^\s,]+)\s*(?:(?:,|\band\s+name\/value\s*=)\s*(['"])((?:(?!\2).)*)\2)?\s*$/s;

/**
 * Split an AQL path into segments. A `/` inside a `[…]` predicate (as in
 * `items[at0003 and name/value='Identifierare']`) does not split.
 */
export function aqlPathSegments(path: string): AqlPathSegment[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let quote: string | null = null;
  for (const ch of path) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (depth > 0 && (ch === "'" || ch === '"')) quote = ch;
    else if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "/" && depth === 0) {
      if (buf) parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) parts.push(buf);
  const out: AqlPathSegment[] = [];
  for (const part of parts) {
    const m = /^([^[]+)(?:\[(.*)\])?$/s.exec(part);
    if (!m) continue;
    const seg: AqlPathSegment = { attr: m[1], raw: `/${part}` };
    if (m[2] !== undefined) {
      const p = PREDICATE_RE.exec(m[2]);
      if (p) {
        seg.nodeId = p[1];
        if (p[3] !== undefined) seg.nameValue = p[3];
      } else {
        seg.nodeId = m[2].trim();
      }
    }
    out.push(seg);
  }
  return out;
}
