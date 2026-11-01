/**
 * Conversion log for minted codes, in the JSON shape Archie's ADL 1.4
 * converter writes (`ADL2ConversionRunLog`, snake_case via Jackson), for
 * compatibility with Archie's format (#252).
 *
 * Optional and off by default: the minted ids are already marked in the
 * ADL2 text through `annotations`. Use the log to exchange conversions with
 * Archie, or to keep minted codes stable when the same OPT 1.4 is converted
 * again: pass the previous log back in and each minted code is reused for
 * the same attribute path and RM type.
 */

/** Why a code was created (Archie's `ReasonForCodeCreation`). */
export type ConversionCodeReason =
  | "C_OBJECT_WITHOUT_NODE_ID"
  | "CREATED_VALUE_SET"
  | "CREATED_VALUE_FOR_EXTERNAL_TERM";

/** One created code (Archie's `CreatedCode`). */
export interface ConversionCreatedCode {
  generated_code: string;
  reason_for_creation: ConversionCodeReason;
  /** Path of the attribute the object sits in, within its archetype. */
  path_created?: string;
  rm_type_name?: string;
  original_term?: unknown;
}

/** One created value set (Archie's `ValueSet`). */
export interface ConversionValueSet {
  id: string;
  members: string[];
}

/** Created codes for one archetype (Archie's `ConversionLog`). */
export interface ArchetypeConversionLog {
  created_codes: Record<string, ConversionCreatedCode>;
  created_value_sets: Record<string, ConversionValueSet>;
}

/** Log for a conversion run, keyed by archetype id (Archie's `ADL2ConversionRunLog`). */
export interface ConversionRunLog {
  converted_archetypes: Record<string, ArchetypeConversionLog>;
}

/** Previous codes for one archetype, consumed in document order. */
export class PreviousConversionCodes {
  private readonly used = new Set<string>();
  constructor(private readonly log: ArchetypeConversionLog | undefined) {}

  /** Every code the previous run created, so new codes do not reuse them. */
  codes(): string[] {
    return Object.keys(this.log?.created_codes ?? {});
  }

  /**
   * The previous code for an object without a node id at `attributePath`:
   * the first unused entry with that path and RM type. Like Archie's
   * `PreviousConversionApplier`, the match is by path and type only.
   */
  take(
    attributePath: string,
    rmTypeName: string | undefined,
  ): string | undefined {
    for (const [code, entry] of Object.entries(this.log?.created_codes ?? {})) {
      if (this.used.has(code)) continue;
      if (entry.reason_for_creation !== "C_OBJECT_WITHOUT_NODE_ID") continue;
      if (entry.path_created !== attributePath) continue;
      if (
        rmTypeName && entry.rm_type_name && entry.rm_type_name !== rmTypeName
      ) continue;
      this.used.add(code);
      return entry.generated_code ?? code;
    }
    return undefined;
  }
}

/** Parse a conversion log from JSON text (Archie's file or ours). */
export function parseConversionRunLog(json: string): ConversionRunLog {
  const data = JSON.parse(json) as Partial<ConversionRunLog>;
  return { converted_archetypes: data.converted_archetypes ?? {} };
}

/** Write a conversion log as JSON text. */
export function serializeConversionRunLog(log: ConversionRunLog): string {
  return JSON.stringify(log, null, 2) + "\n";
}
