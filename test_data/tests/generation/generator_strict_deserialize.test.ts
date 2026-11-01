/**
 * Every instance the generator writes for the OPT 1.4 fixtures deserializes
 * with the strict canonical JSON deserializer (#253).
 */
import { assert } from "@std/assert";
import { parseOptXml } from "../../../parser/legacy/opt_xml_parser.ts";
import { RMInstanceGenerator } from "../../../generation/rm_instance_generator.ts";
import { CANONICAL_JSON_DESERIALIZE_CONFIG } from "../../../serialization/json/json_config.ts";
import { JsonConfigurableDeserializer } from "../../../serialization/json/json_configurable_deserializer.ts";

const DIR = new URL("../../opt14/", import.meta.url);
const MODES = ["minimal", "example", "maximal"] as const;

function fixtures(): string[] {
  return [...Deno.readDirSync(DIR)].map((e) => e.name).filter((n) => n.endsWith(".opt")).sort();
}

Deno.test("generator output strict-deserializes for every OPT 1.4 fixture and mode (#253)", () => {
  const failures: string[] = [];
  for (const name of fixtures()) {
    const xml = Deno.readTextFileSync(new URL(name, DIR));
    let opt;
    try {
      opt = parseOptXml(xml).operationalTemplate;
    } catch {
      continue; // fixtures that are not complete OPTs
    }
    if (!opt.definition) continue;
    for (const mode of MODES) {
      const json = JSON.stringify(new RMInstanceGenerator({ mode }).generate(opt));
      try {
        new JsonConfigurableDeserializer({ ...CANONICAL_JSON_DESERIALIZE_CONFIG }).deserialize(json);
      } catch (e) {
        failures.push(`${name} ${mode}: ${String(e).split(": ").slice(-2).join(": ").slice(0, 300)}`);
      }
    }
  }
  assert(failures.length === 0, failures.join("\n"));
});

Deno.test("generated DV_MULTIMEDIA has media_type, size and uri; DV_PARSABLE has formalism (#253)", () => {
  const xml = Deno.readTextFileSync(new URL("conformance_ehrbase.de.v0.opt", DIR));
  const inst = new RMInstanceGenerator({ mode: "maximal" }).generate(parseOptXml(xml).operationalTemplate);
  const found: Record<string, unknown>[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    if (typeof r._type === "string" && /^DV_(MULTIMEDIA|PARSABLE|ORDINAL)$/.test(r._type)) found.push(r);
    for (const v of Object.values(r)) walk(v);
  };
  walk(inst);
  assert(found.length >= 3);
  for (const dv of found) {
    if (dv._type === "DV_MULTIMEDIA") {
      assert(!("value" in dv), JSON.stringify(dv));
      assert(typeof dv.size === "number" && dv.media_type && dv.uri, JSON.stringify(dv));
      const code = (dv.media_type as { code_string?: string }).code_string ?? "";
      assert(code.includes("/"), `IANA media type, got ${code}`);
    }
    if (dv._type === "DV_PARSABLE") assert(dv.formalism && typeof dv.value === "string", JSON.stringify(dv));
    if (dv._type === "DV_ORDINAL") assert(typeof dv.value === "number" && dv.symbol, JSON.stringify(dv));
  }
});
