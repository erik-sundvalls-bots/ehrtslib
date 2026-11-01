/**
 * Map ADL2 id/ac-style codes toward ADL 1.4 at-codes for down-conversion.
 * @see https://github.com/ErikSundvall/ehrtslib/issues/116
 */

import { parseTermBinding } from "./term_binding.ts";

const ID_OR_AC = /^(id|ac|at)(\d+)((?:\.\d+)*)$/i;

/**
 * ADL2 → ADL 1.4 code, per the openEHR ADL2 specification: ADL2 codes are
 * 1-based and ADL 1.4 codes 0-based, so the top-level segment shifts by one
 * (`[at0000]` (`[id1]`), `[at0001]` (`[id2]`), `[at0000.1]` (`[id1.1]`); see
 * ADL2 spec sections 9.3 and 9.5). This matches Archie's ADL 1.4 converter.
 *
 * - `id1` → `at0000`, `id5.2` → `at0004.2`, `id0.3` → `at0.3`
 * - value codes `at7` → `at0006`
 * - already-1.4 codes (zero-padded, e.g. `at0001`) are returned unchanged
 * - `ac` codes are returned unchanged (expanded from value_sets separately)
 */
export function idToAtCode(code: string | undefined | null): string {
  if (!code) return code ?? "";
  const m = ID_OR_AC.exec(code);
  if (!m) return code;
  const leader = m[1].toLowerCase();
  if (leader === "ac") return code;
  if (leader === "at" && m[2].length >= 4 && m[2].startsWith("0")) return code;
  const first = m[2] === "0" ? "0" : String(+m[2] - 1).padStart(4, "0");
  return `at${first}${m[3] ?? ""}`;
}

/**
 * Node id as the at-code RM data carries in `archetype_node_id` and AQL
 * paths: id-codes map by {@link idToAtCode} (`id1` → `at0000`,
 * `id1.1` → `at0000.1`); at-codes and other ids are returned unchanged.
 */
export function nodeIdToAtCode(nodeId: string | undefined | null): string {
  if (!nodeId) return "";
  return /^id\d/i.test(nodeId) ? idToAtCode(nodeId) : nodeId;
}

/** True when two node ids name the same node in either ADL2 coding system. */
export function nodeIdsMatch(a: unknown, b: unknown): boolean {
  if (a == null || b == null || a === "" || b === "") return false;
  const sa = String(a).trim();
  const sb = String(b).trim();
  return sa === sb || nodeIdToAtCode(sa) === nodeIdToAtCode(sb);
}

/** Term table shape: language → code → term (text/description/…). */
export type Adl2TermTable = Record<string, Record<string, Record<string, unknown> | undefined> | undefined>;

export interface Adl14CodeMapOptions {
  /** Fold codes first (e.g. template overlay codes onto their base depth). */
  normalise?: (code: string) => string;
  /** ADL2 term_definitions, used to detect identical node/value terms and synthetic ids. */
  terms?: Adl2TermTable;
  /**
   * RM type of each node id (`id19` → `ELEMENT`). Node ids of types that are
   * not LOCATABLE (DV_*, CODE_PHRASE, …) are dropped: they had no node id in
   * ADL 1.4 and never reach data. A node id without a type counts as LOCATABLE.
   */
  nodeTypes?: ReadonlyMap<string, string>;
  /** Term bindings (`terminology → code → target`) of the archetype. */
  bindings?: Record<string, Record<string, string>>;
  /**
   * Write a colliding or converter-created value code that has an external
   * binding back as that code (`openehr::128`) (default true). When false,
   * such a code moves to `at9000+` like any other colliding value code.
   */
  externalCodes?: boolean;
  /** Called for every moved value code. */
  warn?: (message: string) => void;
}

/** Marker for a node id that is dropped in ADL 1.4 (no `[code]` emitted). */
export const DROPPED_NODE_ID = "";

/** Term text the ADL Workbench post-parse processor gives the codes it adds. */
const POST_PARSE_TERM = /added by post-parse processor/i;

/** `terminology::code` map target for a value code written back as an external code. */
export function externalCodeOf(target: string | undefined): { terminology: string; code: string } | undefined {
  const m = target ? /^([^:]+)::(.+)$/.exec(target) : null;
  return m ? { terminology: m[1], code: m[2] } : undefined;
}

/** Types whose node ids appear in RM data (`archetype_node_id`) and paths. */
function isLocatableType(rmType: string | undefined): boolean {
  if (!rmType) return true;
  const base = rmType.replace(/<.*$/, "");
  return !(/^DV_|^C_DV_/.test(base) ||
    ["CODE_PHRASE", "TERMINOLOGY_CODE", "PARTY_PROXY", "PARTY_SELF", "PARTY_IDENTIFIED", "PARTY_RELATED",
      "PARTY_REF", "OBJECT_REF", "LOCATABLE_REF", "ISM_TRANSITION", "INSTRUCTION_DETAILS", "EVENT_CONTEXT",
      "PARTICIPATION", "AUDIT_DETAILS", "FEEDER_AUDIT", "FEEDER_AUDIT_DETAILS", "LINK", "STRING", "INTEGER",
      "REAL", "BOOLEAN", "DATE", "TIME", "DATE_TIME", "DURATION", "URI"].includes(base));
}

/**
 * Build a collision-free ADL2 → ADL 1.4 code map for one archetype
 * (#127, #252).
 *
 * ADL2 id-coded archetypes keep node ids (`idN`) and value codes (`atN`) in
 * separate spaces; ADL 1.4 and at-coded ADL2 have one at-code space. Node
 * ids are what RM data (`archetype_node_id`) and AQL paths carry, so they
 * never move:
 *
 * 1. A LOCATABLE node id always maps to {@link idToAtCode} (`id19` →
 *    `at0018`); the root is `at0000{.1}*`.
 * 2. A node id of a non-LOCATABLE type (DV_*, CODE_PHRASE, …) is dropped
 *    ({@link DROPPED_NODE_ID}): it had no node id in ADL 1.4. So is a
 *    synthetic node id (`id9000+` with no term). A node id with no term
 *    below 9000 is not synthetic (ITEM_TREE and HISTORY often have none).
 * 3. A value code maps to {@link idToAtCode} too. If that collides with a
 *    LOCATABLE node id:
 *    - same terms in every language: both share the code (one ADL 1.4 code);
 *    - an external binding: the external code is written back
 *      (`openehr::128`), as in the ADL 1.4 original. A value code the ADL
 *      Workbench post-parse processor added for an external code is
 *      written back even without a collision;
 *    - otherwise (natively authored content only) the value code moves to
 *      the next free `at9000+` at the same specialisation level and a
 *      warning is emitted.
 */
export function buildAdl14CodeMap(
  codes: Iterable<string>,
  options: Adl14CodeMapOptions | ((code: string) => string) = {},
): Map<string, string> {
  const opts: Adl14CodeMapOptions = typeof options === "function"
    ? { normalise: options }
    : options;
  const normalise = opts.normalise ?? ((c: string) => c);
  const terms = opts.terms ?? {};
  const langs = Object.keys(terms);
  const termOf = (code: string) =>
    langs.map((l) => terms[l]?.[code] ?? terms[l]?.[normalise(code)]);
  const termKey = (code: string): string | undefined => {
    const parts = termOf(code);
    if (parts.every((p) => p === undefined)) return undefined;
    return JSON.stringify(parts.map((p) => p ? { text: p.text, description: p.description } : null));
  };
  const ids: string[] = [];
  const ats: string[] = [];
  for (const c of new Set(codes)) {
    if (/^id\d/i.test(c)) ids.push(c);
    else if (/^at\d/i.test(c)) ats.push(c);
  }
  const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  ids.sort(byNum);
  ats.sort(byNum);

  const map = new Map<string, string>();
  const used = new Set<string>();
  // Next unused code >= 9000 at the same specialisation level as `t`
  // (`at0003` → `at9000`; `at0.3` → `at0.9000`).
  const nextFree = (t: string) => {
    const segs = t.replace(/^at/i, "").split(".");
    const prefix = segs.length > 1 ? segs.slice(0, -1).join(".") + "." : "";
    for (let n = 9000;; n++) {
      const c = `at${prefix}${n}`;
      if (!used.has(c)) {
        used.add(c);
        return c;
      }
    }
  };
  const isSynthetic = (c: string) =>
    +(/^id(\d+)/i.exec(normalise(c))?.[1] ?? 0) >= 9000 && termKey(c) === undefined;
  const nodeTarget = new Map<string, string>(); // at-code → node id holding it
  for (const c of ids) {
    if (isSynthetic(c) || !isLocatableType(opts.nodeTypes?.get(c) ?? opts.nodeTypes?.get(normalise(c)))) {
      map.set(c, DROPPED_NODE_ID);
      continue;
    }
    const t = idToAtCode(normalise(c));
    map.set(c, t);
    used.add(t);
    if (!nodeTarget.has(t)) nodeTarget.set(t, c);
  }
  for (const c of ats) used.add(idToAtCode(normalise(c)));

  const bindingOf = (c: string): string | undefined => {
    for (const [terminology, bag] of Object.entries(opts.bindings ?? {})) {
      const raw = bag?.[c] ?? bag?.[normalise(c)];
      if (!raw) continue;
      const b = parseTermBinding(terminology, String(raw)).binding;
      if (b) return `${b.terminology}::${b.code}`;
    }
    return undefined;
  };
  const external = opts.externalCodes ?? true;
  const moved = new Map<string, string>();
  for (const c of ats) {
    const t = idToAtCode(normalise(c));
    const node = nodeTarget.get(t);
    const postParse = termOf(c).some((p) => POST_PARSE_TERM.test(String(p?.text ?? "")));
    const bound = external ? bindingOf(c) : undefined;
    if (bound && (postParse || node !== undefined)) {
      map.set(c, bound);
      if (!postParse) {
        opts.warn?.(`value code ${c} → ${t} would collide with node id ${node} → ${t}; written back as its bound code ${bound}`);
      }
      continue;
    }
    if (node === undefined) {
      map.set(c, t);
      continue;
    }
    const vk = termKey(c);
    if (vk !== undefined && vk === termKey(node)) {
      map.set(c, t); // one ADL 1.4 code, used as node and value
      continue;
    }
    const key = normalise(c);
    const r = moved.get(key) ?? nextFree(t);
    if (!moved.has(key)) {
      moved.set(key, r);
      opts.warn?.(
        `value code ${c} → ${t} would collide with node id ${node} → ${t}; value code renumbered to ${r}`,
      );
    }
    map.set(c, r);
  }
  return map;
}

/** Code tokens in ADL text: `[id2]`, `["at3"]`, `local::at1`, `<"at1", "at2">`. */
const ADL_CODE_TOKEN = /(?<=[\["':,]\s*)(id|at)(\d+(?:\.\d+)*)(?=\s*[\]"',>])/gi;

/** Rewrite every ADL2 id/at code token in ADL text using one collision-free map. */
export function rewriteAdl2CodesInText(adl: string, options: Adl14CodeMapOptions = {}): string {
  return rewriteAdl2CodesInTextWithMap(adl, options).adl;
}

/** As {@link rewriteAdl2CodesInText}, also returning the code map used. */
export function rewriteAdl2CodesInTextWithMap(
  adl: string,
  options: Adl14CodeMapOptions = {},
): { adl: string; map: Map<string, string> } {
  const codes = new Set<string>();
  for (const m of adl.matchAll(ADL_CODE_TOKEN)) {
    const c = m[0];
    if (/^at0\d{3}/i.test(c)) continue; // already ADL 1.4
    codes.add(c);
  }
  const nodeTypes = new Map<string, string>(options.nodeTypes ?? []);
  for (const m of adl.matchAll(/\b([A-Z][A-Z0-9_]*(?:<[A-Z0-9_,<> ]+>)?)\[(id\d+(?:\.\d+)*)[\],]/g)) {
    if (!nodeTypes.has(m[2])) nodeTypes.set(m[2], m[1]);
  }
  const map = buildAdl14CodeMap(codes, { ...options, nodeTypes });
  let out = adl;
  for (const [code, target] of map) {
    const ext = externalCodeOf(target);
    if (!ext) continue;
    // A value code written back to its external code: the constraint names
    // the external code, and the code has no local term (#252).
    const c = code.replace(/\./g, "\\.");
    out = out.replace(new RegExp(`\\[(?:local::)?${c}\\]`, "g"), `[${ext.terminology}::${ext.code}]`);
    out = out.replace(new RegExp(`^([ \\t]*)\\["${c}"\\]\\s*=\\s*<[^\\n]*>[ \\t]*\\n`, "gm"), "");
    out = out.replace(new RegExp(`^([ \\t]*)\\["${c}"\\]\\s*=\\s*<[ \\t]*\\n[\\s\\S]*?^\\1>[ \\t]*\\n`, "gm"), "");
  }
  // Anything else that names such a code keeps the plain shift.
  out = out.replace(ADL_CODE_TOKEN, (c) => {
    const m = map.get(c);
    return m === undefined ? c : externalCodeOf(m) ? idToAtCode(c) : m;
  });
  // Dropped node ids: `DV_TEXT[]` → `DV_TEXT`, `/value[]` → `/value`.
  out = out.replace(/(?<=[\w>])\[\]/g, "");
  return { adl: out, map };
}

/** Rewrite [idN] / bare id codes inside free-form text. */
export function rewriteEmbeddedIds(text: string): string {
  return text.replace(/\bid(\d+(?:\.\d+)*)\b/gi, (_m, n: string) => idToAtCode("id" + n));
}

export type ValueSetBag = Record<
  string,
  { id?: string; members?: string | string[] }
>;

/** Expand ac-code uses in ADL text to [local::at…, …] using value_sets. */
export function expandAcConstraintsInAdl(
  adl: string,
  valueSets: ValueSetBag | undefined,
  mapCode: (code: string) => string = idToAtCode,
): { adl: string; expanded: string[]; missing: string[] } {
  const expanded: string[] = [];
  const missing: string[] = [];
  if (!valueSets || Object.keys(valueSets).length === 0) {
    return { adl, expanded, missing };
  }

  const out = adl.replace(/\[(ac[0-9]+(?:\.[0-9]+)*)\]/gi, (full, ac: string) => {
    const vs = valueSets[ac] ?? valueSets[ac.toLowerCase()];
    if (!vs) {
      missing.push(ac);
      return full;
    }
    let members = vs.members;
    if (typeof members === "string") {
      members = members.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    }
    if (!Array.isArray(members) || members.length === 0) {
      missing.push(ac);
      return full;
    }
    const mapped = members.map((m) => mapCode(String(m).replace(/^["']|["']$/g, "")));
    expanded.push(ac);
    return `[local::${mapped.join(", ")}]`;
  });

  return { adl: out, expanded, missing };
}

/** Drop value_sets = <…> blocks from ADL text (ADL 1.4 has no equivalent). */
export function stripValueSetsBlock(adl: string): string {
  return adl.replace(
    /^([ \t]*)value_sets\s*=\s*<[\s\S]*?\n\1>/gm,
    "",
  );
}

/** Rewrite ontology/term_definitions keys idN → atNNNN. */
export function rewriteOntologyTermKeys(adl: string): string {
  return adl.replace(
    /(\[["'])(id)(\d+(?:\.\d+)*)(["']\])/gi,
    (_m, pre: string, _id: string, nums: string, post: string) =>
      `${pre}${idToAtCode("id" + nums).replace(/^at/, "at")}${post}`.replace(
        /(\[["'])at/,
        "$1at",
      ),
  ).replace(
    /\[["']id(\d+(?:\.\d+)*)["']\]/gi,
    (_m, nums: string) => `["${idToAtCode("id" + nums)}"]`,
  );
}
