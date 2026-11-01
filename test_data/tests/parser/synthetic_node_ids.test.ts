/**
 * Minted node ids (#252): at9000+ / id9000+, marked in ADL2 text by
 * `annotations` (default on), and an optional conversion log in the format
 * of Archie's converter.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { parseOptXml } from "../../../parser/legacy/opt_xml_parser.ts";
import {
  readOpt14Header,
  upconvertOpt14ToAdl2,
} from "../../../parser/legacy/opt14_upconvert.ts";
import { ADL2Parser } from "../../../parser/adl2_parser.ts";
import { ADL2Tokenizer } from "../../../parser/adl2_tokenizer.ts";
import { OPT2Serializer } from "../../../generation/opt2_serializer.ts";
import {
  isSyntheticNodeId,
  markSyntheticNodeId,
} from "../../../parser/legacy/adl2_coding_system.ts";
import {
  parseConversionRunLog,
  serializeConversionRunLog,
} from "../../../parser/legacy/conversion_log.ts";
import * as openehr_am from "../../../am/openehr_am.ts";

const xml = Deno.readTextFileSync(
  new URL("../../opt14/minimal_evaluation.opt", import.meta.url),
);

function convert(options?: Parameters<typeof upconvertOpt14ToAdl2>[2]) {
  return upconvertOpt14ToAdl2(
    parseOptXml(xml).operationalTemplate,
    readOpt14Header(xml),
    options,
  );
}

function minted(opt: openehr_am.OPERATIONAL_TEMPLATE): string[] {
  const out: string[] = [];
  const walk = (o: openehr_am.C_OBJECT) => {
    if (isSyntheticNodeId(o) && o.node_id) out.push(o.node_id);
    for (const a of (o as openehr_am.C_COMPLEX_OBJECT).attributes ?? []) {
      for (
        const c of (a as { children?: openehr_am.C_OBJECT[] }).children ?? []
      ) walk(c);
    }
  };
  walk(opt.definition!);
  return out;
}

Deno.test("minted node ids start at 9000 in both coding systems", () => {
  assertEquals(minted(convert().operationalTemplate), ["at9000", "at9000"]);
  assertEquals(
    minted(convert({ adl2CodingSystem: "id-coded" }).operationalTemplate),
    [
      "id9000",
      "id9000",
    ],
  );
});

Deno.test("annotations mark minted ids by default and restore the flag on parse", () => {
  const text = new OPT2Serializer().serializeOperationalTemplate(
    convert().operationalTemplate,
  );
  assertStringIncludes(text, `["/category[at9000]"] = <`);
  assertStringIncludes(text, `["synthetic_node_id"] = <"true">`);
  const reparsed = new ADL2Parser(new ADL2Tokenizer(text).tokenize()).parse()
    .operationalTemplate!;
  assertEquals(minted(reparsed), ["at9000", "at9000"]);
  // The marker is consumed: writing again gives the same text.
  assertEquals(
    new OPT2Serializer().serializeOperationalTemplate(reparsed),
    text,
  );
});

Deno.test("syntheticNodeIdAnnotations: false leaves the marker out", () => {
  const text = new OPT2Serializer().serializeOperationalTemplate(
    convert().operationalTemplate,
    {
      syntheticNodeIdAnnotations: false,
    },
  );
  assert(!text.includes("synthetic_node_id"));
  const reparsed = new ADL2Parser(new ADL2Tokenizer(text).tokenize()).parse()
    .operationalTemplate!;
  assertEquals(minted(reparsed), []);
});

Deno.test("two id-less siblings of one RM type get their own markers", () => {
  const opt = convert().operationalTemplate;
  const category = opt.definition!.attributes!.find((a) =>
    a.rm_attribute_name === "category"
  )!;
  const children = (category as { children: openehr_am.C_OBJECT[] }).children;
  const twin = new openehr_am.C_COMPLEX_OBJECT();
  twin.rm_type_name = children[0].rm_type_name;
  twin.node_id = "at9001";
  markSyntheticNodeId(twin);
  children.push(twin);
  const text = new OPT2Serializer().serializeOperationalTemplate(opt);
  assertStringIncludes(text, `["/category[at9000]"]`);
  assertStringIncludes(text, `["/category[at9001]"]`);
  const reparsed = new ADL2Parser(new ADL2Tokenizer(text).tokenize()).parse()
    .operationalTemplate!;
  assertEquals(minted(reparsed), ["at9000", "at9001", "at9000"]);
});

Deno.test("conversion log is off by default and uses Archie's JSON shape", () => {
  assertEquals(convert().conversionLog, undefined);
  const log = convert({ conversionLog: true }).conversionLog!;
  const json = JSON.parse(serializeConversionRunLog(log));
  const root = json.converted_archetypes["openEHR-EHR-COMPOSITION.minimal.v1"];
  assertEquals(root.created_codes.at9000, {
    generated_code: "at9000",
    reason_for_creation: "C_OBJECT_WITHOUT_NODE_ID",
    path_created: "/category",
    rm_type_name: "DV_CODED_TEXT",
  });
});

Deno.test("a previous conversion log keeps minted codes stable", () => {
  const log = parseConversionRunLog(
    JSON.stringify({
      converted_archetypes: {
        "openEHR-EHR-COMPOSITION.minimal.v1": {
          created_codes: {
            at9005: {
              generated_code: "at9005",
              reason_for_creation: "C_OBJECT_WITHOUT_NODE_ID",
              path_created: "/category",
              rm_type_name: "DV_CODED_TEXT",
            },
          },
          created_value_sets: {},
        },
      },
    }),
  );
  const result = convert({ conversionLog: log });
  assertEquals(minted(result.operationalTemplate), ["at9005", "at9000"]);
  assertEquals(
    Object.keys(
      result.conversionLog!
        .converted_archetypes["openEHR-EHR-COMPOSITION.minimal.v1"]
        .created_codes,
    ),
    ["at9005"],
  );
});
