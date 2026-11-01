/**
 * OPT2 text round trip (#252): an OPT 1.4 up-converted to ADL2, written with
 * OPT2Serializer and parsed again gives the same Web Template as the OPT 1.4,
 * for every fixture in test_data/opt14.
 */
import { assertEquals } from "@std/assert";
import { parseOptXml } from "../../../parser/legacy/opt_xml_parser.ts";
import {
  readOpt14Header,
  upconvertOpt14ToAdl2,
} from "../../../parser/legacy/opt14_upconvert.ts";
import { ADL2Parser } from "../../../parser/adl2_parser.ts";
import { ADL2Tokenizer } from "../../../parser/adl2_tokenizer.ts";
import { OPT2Serializer } from "../../../generation/opt2_serializer.ts";
import { buildWebTemplate } from "../../../serialization/simplified/mod.ts";
import type {
  WebTemplate,
  WebTemplateNode,
} from "../../../serialization/simplified/types.ts";

const DIR = new URL("../../opt14/", import.meta.url);
const FIELDS = [
  "id",
  "aqlPath",
  "rmType",
  "min",
  "max",
  "name",
  "nodeId",
] as const;

function signature(wt: WebTemplate): string[] {
  const out: string[] = [];
  const walk = (n: WebTemplateNode) => {
    const rec = n as unknown as Record<string, unknown>;
    // One fixture writes a 3-digit at-code (`at029`); ADL2 pads it.
    out.push(
      FIELDS.map((f) => String(rec[f] ?? "")).join(" | ").replace(
        /\bat(\d{3})\b/g,
        "at0$1",
      ),
    );
    for (const c of n.children ?? []) walk(c);
  };
  walk(wt.tree);
  return out;
}

const fixtures = [...Deno.readDirSync(DIR)].map((e) => e.name).filter((n) =>
  n.endsWith(".opt")
).sort();

for (const name of fixtures) {
  for (const coding of ["at-coded", "id-coded"] as const) {
    Deno.test(`OPT2 text round trip keeps the Web Template: ${name} (${coding})`, () => {
      const xml = Deno.readTextFileSync(new URL(name, DIR));
      const opt = parseOptXml(xml).operationalTemplate;
      if (!opt.definition) return; // not a complete OPT
      const adl2 = upconvertOpt14ToAdl2(opt, readOpt14Header(xml), {
        adl2CodingSystem: coding,
      })
        .operationalTemplate;
      const text = new OPT2Serializer().serializeOperationalTemplate(adl2);
      const parsed = new ADL2Parser(new ADL2Tokenizer(text).tokenize()).parse();
      assertEquals(parsed.errors ?? [], []);
      const reparsed = parsed.operationalTemplate!;
      assertEquals(
        signature(buildWebTemplate(reparsed)),
        signature(buildWebTemplate(opt)),
      );
    });
  }
}
