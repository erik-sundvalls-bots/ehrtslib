/**
 * Minted (synthetic) node ids in ADL2 text (#252).
 *
 * ADL2 requires a node id on every object, so OPT 1.4 up-conversion mints
 * ids (at9000+ / id9000+) for objects that had none, and flags them with
 * {@link markSyntheticNodeId}. Data paths leave such ids out. The flag is
 * in-memory only, so the OPT2 serializer also writes one `annotations` entry
 * per minted node, keyed by that node's own path (which includes its minted
 * code), and the ADL2 parser turns those entries back into the flag:
 *
 * ```
 * annotations
 *     documentation = <
 *         ["en"] = <
 *             ["/content[at0000]/items[at9000]"] = <
 *                 ["synthetic_node_id"] = <"true">
 *             >
 *         >
 *     >
 * ```
 */
import type * as openehr_am from "../am/openehr_am.ts";
import type { OdinObject } from "./odin_parser.ts";
import {
  isSyntheticNodeId,
  markSyntheticNodeId,
} from "./legacy/adl2_coding_system.ts";

/** Annotation key that marks a minted node id. */
export const SYNTHETIC_NODE_ID_ANNOTATION = "synthetic_node_id";

type Node = openehr_am.C_OBJECT & { attributes?: openehr_am.C_ATTRIBUTE[] };

function walk(
  obj: Node,
  path: string,
  formatId: (id: string) => string,
  visit: (obj: Node, path: string) => void,
): void {
  for (const attr of obj.attributes ?? []) {
    for (const child of (attr as { children?: Node[] }).children ?? []) {
      const id = child.node_id ? formatId(child.node_id) : "";
      const childPath = `${path}/${attr.rm_attribute_name}${
        id ? `[${id}]` : ""
      }`;
      visit(child, childPath);
      walk(child, childPath, formatId, visit);
    }
  }
}

function languageCode(lang: unknown): string {
  if (typeof lang === "string" && lang) return lang;
  const code = (lang as { code_string?: string } | undefined)?.code_string;
  return code || "en";
}

/**
 * Annotation documentation with one {@link SYNTHETIC_NODE_ID_ANNOTATION}
 * entry per minted node, merged into `documentation` (not mutated).
 * `formatId` gives the node id as written in the text.
 */
export function withSyntheticNodeIdAnnotations(
  documentation: OdinObject | undefined,
  archetype: openehr_am.ARCHETYPE,
  formatId: (id: string) => string = (id) => id,
): OdinObject | undefined {
  if (!archetype.definition) return documentation;
  const paths: string[] = [];
  walk(archetype.definition as Node, "", formatId, (obj, path) => {
    if (obj.node_id && isSyntheticNodeId(obj)) paths.push(path);
  });
  if (paths.length === 0) return documentation;
  const lang = languageCode(archetype.original_language);
  const out: OdinObject = { ...(documentation ?? {}) };
  const byPath = { ...((out[lang] as OdinObject | undefined) ?? {}) };
  for (const path of paths) {
    byPath[path] = {
      ...((byPath[path] as OdinObject | undefined) ?? {}),
      [SYNTHETIC_NODE_ID_ANNOTATION]: "true",
    };
  }
  out[lang] = byPath;
  return out;
}

/**
 * Flag the nodes named by {@link SYNTHETIC_NODE_ID_ANNOTATION} entries as
 * minted and remove those entries (and any bag they leave empty).
 */
export function restoreSyntheticNodeIds(archetype: openehr_am.ARCHETYPE): void {
  const ann =
    (archetype as { annotations?: { documentation?: OdinObject } }).annotations;
  const doc = ann?.documentation;
  if (!doc || !archetype.definition) return;
  const marked = new Set<string>();
  for (const [lang, byPath] of Object.entries(doc)) {
    if (!byPath || typeof byPath !== "object") continue;
    const paths = byPath as OdinObject;
    for (const [path, items] of Object.entries(paths)) {
      const bag = items as OdinObject | undefined;
      if (
        !bag || typeof bag !== "object" ||
        !(SYNTHETIC_NODE_ID_ANNOTATION in bag)
      ) continue;
      if (String(bag[SYNTHETIC_NODE_ID_ANNOTATION]) === "true") {
        marked.add(path);
      }
      delete bag[SYNTHETIC_NODE_ID_ANNOTATION];
      if (Object.keys(bag).length === 0) delete paths[path];
    }
    if (Object.keys(paths).length === 0) delete doc[lang];
  }
  if (Object.keys(doc).length === 0) {
    delete (archetype as { annotations?: unknown }).annotations;
  }
  if (marked.size === 0) return;
  walk(archetype.definition as Node, "", (id) => id, (obj, path) => {
    if (marked.has(path)) markSyntheticNodeId(obj);
  });
}
