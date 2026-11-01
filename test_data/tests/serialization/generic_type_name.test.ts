/**
 * Generic `_type` names (`DV_INTERVAL<DV_COUNT>`) deserialize to the base
 * class. openEHR ITS-JSON writes generic parameters in `_type`, and the
 * example generator does so for intervals.
 */
import { assert, assertEquals } from "@std/assert";
import { parseOptXml } from "../../../parser/legacy/opt_xml_parser.ts";
import { RMInstanceGenerator } from "../../../generation/rm_instance_generator.ts";
import { DV_INTERVAL } from "../../../rm/data_types/quantity.ts";
import { CANONICAL_JSON_DESERIALIZE_CONFIG } from "../../../serialization/json/json_config.ts";
import { JsonConfigurableDeserializer } from "../../../serialization/json/json_configurable_deserializer.ts";
import { JsonCanonicalDeserializer } from "../../../serialization/json/json_canonical_deserializer.ts";
import { TypeRegistry } from "../../../serialization/common/type_registry.ts";
import { registerOpenEhrModelTypes } from "../../../serialization/common/openehr_model_registry.ts";

const INTERVAL = {
  _type: "DV_INTERVAL<DV_COUNT>",
  lower: { _type: "DV_COUNT", magnitude: 1 },
  upper: { _type: "DV_COUNT", magnitude: 5 },
  lower_unbounded: false,
  upper_unbounded: false,
};

Deno.test("TypeRegistry resolves a generic type name to its base class", () => {
  registerOpenEhrModelTypes();
  assertEquals(TypeRegistry.getConstructor("DV_INTERVAL<DV_COUNT>"), DV_INTERVAL);
  assertEquals(TypeRegistry.getConstructor("DV_INTERVAL< DV_QUANTITY >"), DV_INTERVAL);
  assertEquals(TypeRegistry.getConstructor("NO_SUCH_TYPE<DV_COUNT>"), undefined);
});

Deno.test("canonical deserializers accept _type DV_INTERVAL<DV_COUNT>", () => {
  const json = JSON.stringify(INTERVAL);
  const a = new JsonConfigurableDeserializer({ ...CANONICAL_JSON_DESERIALIZE_CONFIG }).deserialize(json);
  assert(a instanceof DV_INTERVAL);
  const b = new JsonCanonicalDeserializer().deserialize(json);
  assert(b instanceof DV_INTERVAL);
});

Deno.test("generated example with DV_INTERVAL<DV_COUNT> deserializes (conformance template)", async () => {
  const xml = await Deno.readTextFile(new URL("../../opt14/conformance_ehrbase.de.v0.opt", import.meta.url));
  const { operationalTemplate: opt } = parseOptXml(xml);
  const plain = new RMInstanceGenerator({ mode: "example" }).generate(opt);
  const json = JSON.stringify(plain);
  assert(json.includes('"DV_INTERVAL<DV_COUNT>"'), "fixture still has a generic interval");
  // Lenient: an unknown `_type` would come back as a plain object, which the
  // instanceof check below catches.
  const typed = new JsonConfigurableDeserializer({
    ...CANONICAL_JSON_DESERIALIZE_CONFIG,
    strict: false,
  }).deserialize(json);
  const intervals: unknown[] = [];
  const find = (o: unknown, seen = new Set<unknown>()) => {
    if (!o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    if (o instanceof DV_INTERVAL) intervals.push(o);
    for (const k of Object.keys(o)) find((o as Record<string, unknown>)[k], seen);
  };
  find(typed);
  assert(intervals.length > 0, "typed DV_INTERVAL instances");
});
