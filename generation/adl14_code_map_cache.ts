/**
 * One cached ADL2 → ADL 1.4 code map per archetype scope of an id-coded
 * operational template (#252). The OPT 1.4 export, Web Template value
 * codes, FLAT/STRUCTURED codes and RM data use the same rule
 * ({@link buildAdl14CodeMap}), so a value code that collides with a node id
 * gets the same ADL 1.4 code everywhere.
 */
import * as openehr_am from "../am/openehr_am.ts";
import { adl2CodingSystemOf } from "../parser/legacy/adl2_coding_system.ts";
import { TERM_ARCHETYPE_SCOPE_KEY, type TermScopeMeta } from "./term_scope.ts";
import {
  type Adl2TermTable,
  buildAdl14CodeMap,
  idToAtCode,
} from "./id_to_at_code.ts";

type Bindings = Record<string, Record<string, string>>;

interface ScopedOpt {
  archetype_id?: { value?: string };
  definition?: openehr_am.C_COMPLEX_OBJECT;
  ontology?: { term_definitions?: Adl2TermTable; term_bindings?: Bindings };
  archetype_term_definitions?: Record<string, Adl2TermTable>;
  archetype_term_bindings?: Record<string, Bindings>;
}

interface ScopeInput {
  codes: Set<string>;
  nodeTypes: Map<string, string>;
}

const cache = new WeakMap<object, Map<string, Map<string, string>>>();
const warnings = new WeakMap<object, string[]>();

function collect(opt: ScopedOpt): Map<string, ScopeInput> {
  const rootScope = opt.archetype_id?.value ?? "";
  const scopes = new Map<string, ScopeInput>();
  const input = (s: string) => {
    let x = scopes.get(s);
    if (!x) scopes.set(s, x = { codes: new Set(), nodeTypes: new Map() });
    return x;
  };
  const walk = (o: openehr_am.C_OBJECT, inherited: string) => {
    const ref = (o as openehr_am.C_ARCHETYPE_ROOT).archetype_ref;
    const scope = (o instanceof openehr_am.C_ARCHETYPE_ROOT && ref)
      ? ref
      : (o as TermScopeMeta)[TERM_ARCHETYPE_SCOPE_KEY] ?? inherited;
    const x = input(scope);
    const id = o.node_id;
    if (id && /^id\d/i.test(id)) {
      x.codes.add(id);
      if (o.rm_type_name && !x.nodeTypes.has(id)) {
        x.nodeTypes.set(id, o.rm_type_name);
      }
    }
    const t = o as unknown as { constraint?: string; code_list?: string[] };
    if (o instanceof openehr_am.C_TERMINOLOGY_CODE) {
      for (const c of [t.constraint, ...(t.code_list ?? [])]) {
        if (c && /^at\d/i.test(c)) x.codes.add(c);
      }
    }
    for (const a of (o as openehr_am.C_COMPLEX_OBJECT).attributes ?? []) {
      for (
        const c of (a as { children?: openehr_am.C_OBJECT[] }).children ?? []
      ) walk(c, scope);
    }
  };
  if (opt.definition) walk(opt.definition, rootScope);
  return scopes;
}

function termsFor(opt: ScopedOpt, scope: string): Adl2TermTable | undefined {
  return opt.archetype_term_definitions?.[scope] ??
    (scope === opt.archetype_id?.value
      ? opt.ontology?.term_definitions
      : undefined);
}

function bindingsFor(opt: ScopedOpt, scope: string): Bindings | undefined {
  return opt.archetype_term_bindings?.[scope] ??
    (scope === opt.archetype_id?.value
      ? opt.ontology?.term_bindings
      : undefined);
}

function mapsFor(opt: ScopedOpt): Map<string, Map<string, string>> {
  let maps = cache.get(opt);
  if (maps) return maps;
  maps = new Map();
  const warns: string[] = [];
  for (const [scope, x] of collect(opt)) {
    const terms = termsFor(opt, scope);
    for (const bag of Object.values(terms ?? {})) {
      for (const c of Object.keys(bag ?? {})) {
        if (/^(id|at)\d/i.test(c)) x.codes.add(c);
      }
    }
    maps.set(
      scope,
      buildAdl14CodeMap(x.codes, {
        terms,
        nodeTypes: x.nodeTypes,
        bindings: bindingsFor(opt, scope),
        warn: (m) => warns.push(`${scope}: ${m}`),
      }),
    );
  }
  cache.set(opt, maps);
  warnings.set(opt, warns);
  return maps;
}

/**
 * ADL 1.4 code for an ADL2 code of an id-coded operational template, in the
 * archetype scope `scope` (the root archetype when omitted). A value code may
 * map to `terminology::code` (written back to its external code). Codes of
 * at-coded templates and codes not in the map use {@link idToAtCode}.
 */
export function adl14CodeFor(
  opt: object | undefined,
  code: string,
  scope?: string,
): string {
  if (!opt || adl2CodingSystemOf(opt as ScopedOpt) !== "id-coded") return code;
  if (!/^(id|at)\d/i.test(code) || /^at0\d{3}/i.test(code)) return code;
  const o = opt as ScopedOpt;
  const m = mapsFor(o).get(scope ?? o.archetype_id?.value ?? "")?.get(code);
  return m !== undefined && m !== "" ? m : idToAtCode(code);
}

/** Warnings for value codes moved off a node id's ADL 1.4 code (id-coded templates only). */
export function adl14CodeMapWarnings(opt: object | undefined): string[] {
  if (!opt || adl2CodingSystemOf(opt as ScopedOpt) !== "id-coded") return [];
  mapsFor(opt as ScopedOpt);
  return [...(warnings.get(opt) ?? [])];
}

/** ADL2 → ADL 1.4 code map of one archetype scope (id-coded templates only). */
export function adl14CodeMapFor(
  opt: object | undefined,
  scope?: string,
): ReadonlyMap<string, string> | undefined {
  if (!opt || adl2CodingSystemOf(opt as ScopedOpt) !== "id-coded") {
    return undefined;
  }
  const o = opt as ScopedOpt;
  return mapsFor(o).get(scope ?? o.archetype_id?.value ?? "");
}
