/**
 * ADL2 coding systems (ADL 2.4 / AM 2.4, SPECAM-90). Both are supported in
 * one build; the coding system is a property of each artefact (ADR 0015).
 *
 * - **at-coded**: ADL 1.4 identical node ids (root `at0000`). Mandatory for
 *   openEHR RM from ADL 2.4 and the default here. Experimental until AM
 *   2.4.0 is released.
 * - **id-coded**: ADL 2.0–2.3 node ids (root `id1`), as Archie and other
 *   AM 2.3 tools read and write.
 */

/** Node and terminology coding of an ADL2 archetype or template. */
export type Adl2CodingSystem = "at-coded" | "id-coded";

/** Default per issue #181 / SPECAM-90: at-coded ADL2 for openEHR RM conformance. */
export const DEFAULT_ADL2_CODING_SYSTEM: Adl2CodingSystem = "at-coded";

/** `adl_version` written on at-coded ADL2 output (ADL 2.4). */
export const AT_CODED_ADL_VERSION = "2.4.0";

export interface Adl2CodingOptions {
  /**
   * Which ADL2 coding system to emit when converting from ADL 1.4 / OPT 1.4.
   * Parsing accepts both id- and at-coded ADL2 text regardless of this option.
   */
  adl2CodingSystem?: Adl2CodingSystem;
}

export function resolveAdl2CodingSystem(
  options?: Adl2CodingOptions,
): Adl2CodingSystem {
  return options?.adl2CodingSystem ?? DEFAULT_ADL2_CODING_SYSTEM;
}

/** Version token recorded in template-binding serialisation (`opt14-codes=…`). */
export function opt14CodeMappingVersion(
  coding: Adl2CodingSystem = DEFAULT_ADL2_CODING_SYSTEM,
): string {
  return coding === "id-coded" ? "am2-archie-id" : "am24-at";
}

/** Anything with a definition root: archetype, template or operational template. */
export interface CodedArtefact {
  definition?: { node_id?: string } | null;
  adl_version?: string;
}

/**
 * Coding system of an artefact, read from its root node id (`at0000…` →
 * at-coded, `id1…` → id-coded). `undefined` when there is no root node id.
 * An ADL 1.4 artefact reads as at-coded; see {@link isAdl14Artefact}.
 */
export function adl2CodingSystemOf(
  artefact: CodedArtefact | undefined | null,
): Adl2CodingSystem | undefined {
  const rootId = artefact?.definition?.node_id?.trim();
  if (!rootId) return undefined;
  if (/^id\d/i.test(rootId)) return "id-coded";
  if (/^at\d/i.test(rootId)) return "at-coded";
  return undefined;
}

/**
 * True for an ADL 1.4 artefact (for example a parsed OPT 1.4): at-coded
 * nodes without an ADL 2 `adl_version`. at-coded ADL2 has `adl_version` 2.x.
 */
export function isAdl14Artefact(artefact: CodedArtefact): boolean {
  if (artefact.adl_version?.trim().startsWith("1.")) return true;
  if (/^\s*2/.test(artefact.adl_version ?? "")) return false;
  return adl2CodingSystemOf(artefact) === "at-coded";
}

/**
 * `adl_version` for ADL2 output: `2.4.0` when at-coded, else `idCodedVersion`
 * (AM 2.3 tools read any 2.0–2.3 version as id-coded).
 */
export function adl2VersionFor(
  coding: Adl2CodingSystem,
  idCodedVersion: string,
): string {
  return coding === "at-coded" ? AT_CODED_ADL_VERSION : idCodedVersion;
}

/**
 * Warning for an at-coded artefact with an ADL 2.0–2.3 `adl_version`, which
 * AM 2.3 tools read as id-coded. Reading stays tolerant: this does not fail.
 */
export function adl2CodingVersionWarning(
  artefact: CodedArtefact,
): string | undefined {
  const version = artefact.adl_version?.trim();
  if (!version || adl2CodingSystemOf(artefact) !== "at-coded") return undefined;
  const m = /^2\.(\d+)/.exec(version);
  if (!m || Number(m[1]) >= 4) return undefined;
  return `at-coded ADL2 artefact has adl_version=${version}; ADL 2.0–2.3 ` +
    `tools read it as id-coded. at-coded ADL2 is ADL ${AT_CODED_ADL_VERSION}.`;
}

/**
 * Meta key on a C_OBJECT whose node id was minted on OPT 1.4 up-conversion.
 * Such ids are not in the OPT 1.4 (or in data built from it), so data paths
 * (Web Template, FLAT, AQL) leave them out.
 */
export const SYNTHETIC_NODE_ID_KEY = "synthetic_node_id";

/**
 * Mark a minted node id. The flag is non-enumerable, so it stays out of
 * JSON output and template hashes; it lives on the in-memory object only.
 */
export function markSyntheticNodeId(obj: object): void {
  Object.defineProperty(obj, SYNTHETIC_NODE_ID_KEY, {
    value: true,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/** True when {@link SYNTHETIC_NODE_ID_KEY} is set on the object. */
export function isSyntheticNodeId(obj: unknown): boolean {
  return !!obj && typeof obj === "object" &&
    (obj as Record<string, unknown>)[SYNTHETIC_NODE_ID_KEY] === true;
}
