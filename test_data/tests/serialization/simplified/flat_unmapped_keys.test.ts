/**
 * A FLAT key that sets nothing is an issue with the `unknownKeys` severity,
 * never dropped silently. The spec has no FLAT form for DV_SCALE, DV_STATE
 * or DV_PARAGRAPH (docs/vendor/simplified_formats.md), so their field keys
 * and bare keys are reported; `_<attribute>` paths still work.
 */
import { assert, assertEquals } from "@std/assert";
import { parseOptXml } from "../../../../parser/legacy/opt_xml_parser.ts";
import {
  buildWebTemplate,
  deserializeFromFlatWithIssues,
  type FlatPayload,
  type WebTemplate,
} from "../../../../serialization/simplified/mod.ts";
import type { WebTemplateNode } from "../../../../serialization/simplified/types.ts";

const OPT = new URL(
  "../../../opt14/conformance_ehrbase.de.v0.opt",
  import.meta.url,
);
const CLOCK = () => "2026-10-30T12:00:00Z";

/** The conformance template with its first DV_TEXT leaf retyped to `rmType`. */
function withLeaf(rmType: string): { wt: WebTemplate; key: string } {
  const wt = buildWebTemplate(
    parseOptXml(Deno.readTextFileSync(OPT)).operationalTemplate!,
  );
  let key = "";
  const walk = (n: WebTemplateNode, chain: string[]): boolean => {
    if (n.rmType === "DV_TEXT" && !n.children?.length && !n.inContext) {
      n.rmType = rmType;
      n.inputs = [];
      key = chain.join("/");
      return true;
    }
    for (const c of n.children ?? []) {
      const seg = c.id + (c.max === -1 || (c.max ?? 1) > 1 ? ":0" : "");
      if (walk(c, [...chain, seg])) return true;
    }
    return false;
  };
  walk(wt.tree, [wt.tree.id]);
  assert(key, "no DV_TEXT leaf");
  return { wt, key };
}

const BASE: FlatPayload = {
  "ctx/language": "en",
  "ctx/territory": "DE",
  "ctx/composer_name": "Test",
};

function unknownIssues(
  flat: FlatPayload,
  wt: WebTemplate,
  unknownKeys?: "error" | "warning" | "ignore",
) {
  const { issues } = deserializeFromFlatWithIssues({ ...BASE, ...flat }, wt, {
    clock: CLOCK,
    unknownKeys,
  });
  return issues.filter((i) => i.kind === "unknown-key");
}

Deno.test("DV_SCALE: DV_ORDINAL-style keys are reported, not dropped", () => {
  const { wt, key } = withLeaf("DV_SCALE");
  const issues = unknownIssues({
    [`${key}|code`]: "at0001",
    [`${key}|value`]: "Mild",
    [`${key}|ordinal`]: 1,
  }, wt);
  assertEquals(issues.map((i) => i.path.split("|").pop()).sort(), [
    "code",
    "ordinal",
    "value",
  ]);
  assert(issues.every((i) => i.severity === "error"));
});

Deno.test("DV_STATE and DV_PARAGRAPH: a bare key is reported, not written as an invalid value", () => {
  for (const type of ["DV_STATE", "DV_PARAGRAPH"]) {
    const { wt, key } = withLeaf(type);
    const issues = unknownIssues({ [key]: "x" }, wt, "warning");
    assertEquals(issues.length, 1, type);
    assertEquals(issues[0].severity, "warning");
    assert(issues[0].message.includes(type), issues[0].message);
  }
});

Deno.test("unknownKeys: ignore drops the report", () => {
  const { wt, key } = withLeaf("DV_SCALE");
  assertEquals(unknownIssues({ [`${key}|code`]: "at0001" }, wt, "ignore"), []);
});

Deno.test("a known type: an unrecognised field is reported, known fields are not", () => {
  const { wt, key } = withLeaf("DV_TEXT");
  const issues = unknownIssues({ [key]: "hello", [`${key}|magnitude`]: 3 }, wt);
  assertEquals(issues.map((i) => i.path.split("|").pop()), ["magnitude"]);
});

Deno.test("DV_SCALE: _value and _symbol paths set the value without issues", () => {
  const { wt, key } = withLeaf("DV_SCALE");
  const flat = {
    [`${key}/_value`]: 1.5,
    [`${key}/_symbol|code`]: "at0001",
    [`${key}/_symbol|value`]: "Mild",
    [`${key}/_symbol|terminology`]: "local",
  };
  assertEquals(unknownIssues(flat, wt), []);
  const { composition } = deserializeFromFlatWithIssues(
    { ...BASE, ...flat },
    wt,
    { clock: CLOCK },
  );
  const json = JSON.stringify(composition);
  assert(
    json.includes('"_type":"DV_SCALE"') && json.includes('"value":1.5'),
    json,
  );
});
