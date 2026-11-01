/**
 * Both ADL2 coding systems in one build (ADR 0015, #246): one detector, the
 * ADL2 spec id → at mapping, Web Template parity, honest `adl_version`
 * headers and at-coded golden fixtures.
 *
 * Regenerate the golden files with `UPDATE_GOLDEN=1 deno test -A <this file>`.
 */
import { assert, assertEquals } from "@std/assert";
import { parseOptXml } from "../../../parser/legacy/opt_xml_parser.ts";
import {
  readOpt14Header,
  upconvertOpt14ToAdl2,
} from "../../../parser/legacy/opt14_upconvert.ts";
import {
  adl2CodingSystemOf,
  adl2CodingVersionWarning,
  AT_CODED_ADL_VERSION,
  isAdl14Artefact,
} from "../../../parser/legacy/adl2_coding_system.ts";
import { convertAdl14ToAdl2 } from "../../../parser/adl14_to_adl2_converter.ts";
import { ADL2Parser } from "../../../parser/adl2_parser.ts";
import { ADL2Tokenizer } from "../../../parser/adl2_tokenizer.ts";
import { OPT2Serializer } from "../../../generation/opt2_serializer.ts";
import { nodeIdsMatch, nodeIdToAtCode } from "../../../generation/id_to_at_code.ts";
import { buildWebTemplate } from "../../../serialization/simplified/mod.ts";
import type { WebTemplate, WebTemplateNode } from "../../../serialization/simplified/types.ts";

const TEST_DATA = new URL("../../", import.meta.url);
const GOLDEN = new URL("adl2/at-coded/", TEST_DATA);
const UPDATE = Deno.env.get("UPDATE_GOLDEN") === "1";

function parseAdl2(text: string) {
  return new ADL2Parser(new ADL2Tokenizer(text).tokenize()).parse();
}

async function loadOpt14(name: string) {
  const xml = await Deno.readTextFile(new URL(`opt14/${name}`, TEST_DATA));
  return { xml, opt: parseOptXml(xml).operationalTemplate };
}

/** Node signature: id, path, type, occurrences, name and node id. */
function signature(wt: WebTemplate, fields = ["id", "aqlPath", "rmType", "min", "max", "name", "nodeId"]): string[] {
  const out: string[] = [];
  const walk = (n: WebTemplateNode) => {
    const rec = n as unknown as Record<string, unknown>;
    // One OPT 1.4 fixture writes a 3-digit at-code (`at029`); ADL2 pads it.
    out.push(fields.map((f) => String(rec[f] ?? "")).join(" ").replace(/\bat(\d{3})\b/g, "at0$1"));
    for (const c of n.children ?? []) walk(c);
  };
  walk(wt.tree);
  return out;
}

Deno.test("adl2CodingSystemOf reads the root node id; isAdl14Artefact needs no ADL 2 header", () => {
  assertEquals(adl2CodingSystemOf({ definition: { node_id: "at0000" } }), "at-coded");
  assertEquals(adl2CodingSystemOf({ definition: { node_id: "at0000.1" } }), "at-coded");
  assertEquals(adl2CodingSystemOf({ definition: { node_id: "id1" } }), "id-coded");
  assertEquals(adl2CodingSystemOf({ definition: { node_id: "id1.1" } }), "id-coded");
  assertEquals(adl2CodingSystemOf({ definition: {} }), undefined);
  assertEquals(adl2CodingSystemOf(undefined), undefined);
  assert(isAdl14Artefact({ adl_version: "1.4", definition: { node_id: "at0000" } }));
  assert(isAdl14Artefact({ definition: { node_id: "at0000" } }));
  assert(!isAdl14Artefact({ adl_version: "2.4.0", definition: { node_id: "at0000" } }));
  assert(!isAdl14Artefact({ definition: { node_id: "id1" } }));
});

Deno.test("nodeIdToAtCode uses the ADL2 spec mapping (id1 → at0000)", () => {
  assertEquals(nodeIdToAtCode("id1"), "at0000");
  assertEquals(nodeIdToAtCode("id2"), "at0001");
  assertEquals(nodeIdToAtCode("id5.2"), "at0004.2");
  assertEquals(nodeIdToAtCode("id1.1"), "at0000.1");
  assertEquals(nodeIdToAtCode("at0003"), "at0003");
  assertEquals(nodeIdToAtCode("openEHR-EHR-CLUSTER.x.v1"), "openEHR-EHR-CLUSTER.x.v1");
  assert(nodeIdsMatch("id5", "at0004"));
  assert(!nodeIdsMatch("id5", "at0005"));
});

Deno.test("at-coded artefact with an ADL 2.0–2.3 header: warning, not failure", () => {
  assert(adl2CodingVersionWarning({ adl_version: "2.0.5", definition: { node_id: "at0000" } }));
  assertEquals(adl2CodingVersionWarning({ adl_version: "2.4.0", definition: { node_id: "at0000" } }), undefined);
  assertEquals(adl2CodingVersionWarning({ adl_version: "2.0.5", definition: { node_id: "id1" } }), undefined);

  const atText = `archetype (adl_version=2.0.6; rm_release=1.0.4)
    openEHR-EHR-CLUSTER.coding_test.v1.0.0

language
    original_language = <[ISO_639-1::en]>

description
    original_author = <
        ["name"] = <"x">
    >
    details = <
        ["en"] = <
            language = <[ISO_639-1::en]>
            purpose = <"test">
        >
    >

definition
    CLUSTER[at0000] matches {
        items matches {
            ELEMENT[at0001] matches {
                value matches {
                    DV_TEXT[at0002]
                }
            }
        }
    }

terminology
    term_definitions = <
        ["en"] = <
            ["at0000"] = <text = <"Test"> description = <"Test">>
            ["at0001"] = <text = <"Item"> description = <"Item">>
        >
    >
`;
  const parsed = parseAdl2(atText);
  assertEquals(parsed.kind, "archetype");
  assertEquals(adl2CodingSystemOf(parsed.archetype), "at-coded");
  assert(parsed.warnings.some((w) => w.includes("adl_version=2.0.6")), parsed.warnings.join("; "));
  const honest = parseAdl2(atText.replace("adl_version=2.0.6", `adl_version=${AT_CODED_ADL_VERSION}`));
  assert(!honest.warnings.some((w) => w.includes("adl_version")), honest.warnings.join("; "));
});

Deno.test("adl_version header follows the coding system", async () => {
  const { xml, opt } = await loadOpt14("minimal_evaluation.opt");
  const at = upconvertOpt14ToAdl2(opt, readOpt14Header(xml)).operationalTemplate;
  const id = upconvertOpt14ToAdl2(opt, readOpt14Header(xml), { adl2CodingSystem: "id-coded" }).operationalTemplate;
  assertEquals(at.adl_version, AT_CODED_ADL_VERSION);
  assertEquals(id.adl_version, "2.0.5");
  const serializer = new OPT2Serializer();
  assert(serializer.serializeOperationalTemplate(at).startsWith(`operational_template (adl_version=${AT_CODED_ADL_VERSION};`));
  assert(serializer.serializeOperationalTemplate(id).startsWith("operational_template (adl_version=2.0.5;"));
  assert(serializer.serializeOperationalTemplate(opt).startsWith(`operational_template (adl_version=${AT_CODED_ADL_VERSION};`));

  const adl14 = await Deno.readTextFile(new URL("adl14/openEHR-TEST_PKG-WHOLE.most_minimal.v1.adl", TEST_DATA));
  assert(convertAdl14ToAdl2(adl14).adl2Text.includes(`adl_version=${AT_CODED_ADL_VERSION}`));
  assert(convertAdl14ToAdl2(adl14, { adl2CodingSystem: "id-coded" }).adl2Text.includes("adl_version=2.0.6"));
});

const OPT14_FIXTURES = [...Deno.readDirSync(new URL("opt14/", TEST_DATA))]
  .map((e) => e.name)
  .filter((n) => n.endsWith(".opt"))
  .sort();

Deno.test("Web Template parity: OPT 1.4 and its at-coded and id-coded ADL2 forms", async () => {
  assert(OPT14_FIXTURES.length > 10);
  for (const name of OPT14_FIXTURES) {
    const { xml, opt } = await loadOpt14(name);
    const expected = signature(buildWebTemplate(opt));
    for (const coding of ["at-coded", "id-coded"] as const) {
      const adl2 = upconvertOpt14ToAdl2(opt, readOpt14Header(xml), { adl2CodingSystem: coding }).operationalTemplate;
      assertEquals(adl2CodingSystemOf(adl2), coding, name);
      assertEquals(signature(buildWebTemplate(adl2)), expected, `${name} (${coding})`);
    }
  }
});

const GOLDEN_OPTS = [
  "minimal_evaluation",
  "Test_all_types",
  "ehrbase_blood_pressure_simple.de.v0",
];

async function checkGolden(file: string, text: string): Promise<void> {
  const url = new URL(file, GOLDEN);
  if (UPDATE) await Deno.writeTextFile(url, text);
  assertEquals(text, await Deno.readTextFile(url), `${file} (UPDATE_GOLDEN=1 to regenerate)`);
}

Deno.test("at-coded golden OPT2 fixtures: stable output, parse back at-coded, same data paths", async () => {
  for (const base of GOLDEN_OPTS) {
    const { xml, opt } = await loadOpt14(`${base}.opt`);
    const adl2 = upconvertOpt14ToAdl2(opt, readOpt14Header(xml)).operationalTemplate;
    const text = new OPT2Serializer().serializeOperationalTemplate(adl2);
    await checkGolden(`${base}.opt2`, text);
    const parsed = parseAdl2(text);
    assertEquals(parsed.kind, "operational_template", base);
    const reparsed = parsed.operationalTemplate!;
    assertEquals(adl2CodingSystemOf(reparsed), "at-coded", base);
    assertEquals(reparsed.adl_version, AT_CODED_ADL_VERSION, base);
    assertEquals(parsed.warnings.filter((w) => w.includes("adl_version")), [], base);
    // Paths, types and node ids survive the text round trip. Node ids minted
    // for OPT 1.4 nodes without one are not marked in ADL2 text, so they
    // reappear in paths after parsing (ADR 0015).
    const expected = signature(buildWebTemplate(opt), ["aqlPath", "rmType", "nodeId"]);
    const actual = signature(buildWebTemplate(reparsed), ["aqlPath", "rmType", "nodeId"]);
    const differing = expected.filter((e, i) => e !== actual[i]);
    assert(differing.length <= 1, `${base}: ${differing.join("\n")}`);
  }
});

Deno.test("at-coded golden ADL2 archetype fixture", async () => {
  const adl14 = await Deno.readTextFile(new URL("adl14/openEHR-TEST_PKG-WHOLE.most_minimal.v1.adl", TEST_DATA));
  const { adl2Text } = convertAdl14ToAdl2(adl14);
  await checkGolden("openEHR-TEST_PKG-WHOLE.most_minimal.v1.0.0.adls", adl2Text);
  const parsed = parseAdl2(adl2Text);
  assertEquals(parsed.kind, "archetype");
  assertEquals(adl2CodingSystemOf(parsed.archetype), "at-coded");
  assertEquals(parsed.archetype?.adl_version, AT_CODED_ADL_VERSION);
});
