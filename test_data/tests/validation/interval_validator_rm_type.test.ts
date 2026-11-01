/**
 * IntervalValidator and the other validators find the RM type of a typed
 * instance by its class, not by a `_type` field: typed RM classes keep the
 * `type` attribute of DV_IDENTIFIER, OBJECT_REF, … in `_type`.
 */
import { assert, assertEquals } from "@std/assert";
import { parseOptXml } from "../../../parser/legacy/opt_xml_parser.ts";
import { RMInstanceGenerator } from "../../../generation/rm_instance_generator.ts";
import { DV_IDENTIFIER } from "../../../rm/data_types/basic.ts";
import { DV_INTERVAL } from "../../../rm/data_types/quantity.ts";
import { toTypedRm } from "../../../serialization/simplified/typed_rm.ts";
import { CANONICAL_JSON_DESERIALIZE_CONFIG } from "../../../serialization/json/json_config.ts";
import { JsonConfigurableDeserializer } from "../../../serialization/json/json_configurable_deserializer.ts";
import { IntervalValidator } from "../../../validation/interval_validator.ts";
import { instanceRmType } from "../../../validation/rm_type.ts";
import { TemplateValidator } from "../../../validation/template_validator.ts";

type Rm = Record<string, any>;

Deno.test("instanceRmType: class for typed instances, _type for plain JSON", () => {
  const id = new DV_IDENTIFIER({ id: "123", type: "MRN", issuer: "H", assigner: "H" } as never);
  assertEquals(instanceRmType(id), "DV_IDENTIFIER");
  assertEquals(instanceRmType({ _type: "DV_IDENTIFIER", type: "MRN" }), "DV_IDENTIFIER");
  assertEquals(instanceRmType({ id: "1" }), undefined);
});

Deno.test("IntervalValidator: typed DV_IDENTIFIER with type is not an interval and does not throw", () => {
  const id = new DV_IDENTIFIER({ id: "123", type: "MRN", issuer: "H", assigner: "H" } as never);
  assertEquals(new IntervalValidator().validate(id, "/x"), []);
});

Deno.test("IntervalValidator: typed and plain DV_INTERVAL are still checked", () => {
  const plain = { _type: "DV_INTERVAL", lower: { _type: "DV_COUNT", magnitude: 5 }, upper: { _type: "DV_COUNT", magnitude: 2 }, lower_included: true, upper_included: true, lower_unbounded: false, upper_unbounded: false };
  const errs = new IntervalValidator().validate(plain, "/x").filter((m) => m.severity === "error");
  assert(errs.some((m) => /exceeds upper bound/.test(m.message)));
  const typed = toTypedRm<DV_INTERVAL<never>>(plain);
  assert(typed instanceof DV_INTERVAL);
  const typedErrs = new IntervalValidator().validate(typed, "/x").filter((m) => m.severity === "error");
  assert(typedErrs.some((m) => /exceeds upper bound/.test(m.message)));
});

Deno.test("TemplateValidator: typed composition with DV_IDENTIFIER.type validates with validateIntervals", async () => {
  const xml = await Deno.readTextFile(new URL("../../opt14/IDCR - Laboratory Test Report.v0.opt", import.meta.url));
  const opt = parseOptXml(xml).operationalTemplate;
  const plain = new RMInstanceGenerator({ mode: "example" }).generate(opt) as Rm;
  let identifiers = 0;
  const visit = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if ((o as Rm)._type === "DV_IDENTIFIER") {
      (o as Rm).type = "MRN";
      (o as Rm).id ??= "123";
      identifiers++;
    }
    for (const v of Object.values(o)) visit(v);
  };
  visit(plain);
  assert(identifiers > 0, "template has no DV_IDENTIFIER");
  const typed = new JsonConfigurableDeserializer({ ...CANONICAL_JSON_DESERIALIZE_CONFIG }).deserialize(JSON.stringify(plain));
  const ids: unknown[] = [];
  const find = (o: unknown, seen = new Set<unknown>()) => {
    if (!o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    if (o instanceof DV_IDENTIFIER) ids.push(o);
    for (const k of Object.keys(o)) find((o as Rm)[k], seen);
  };
  find(typed);
  assert(ids.length > 0 && typeof (ids[0] as Rm)._type === "object", "typed DV_IDENTIFIER keeps type in _type");
  const result = new TemplateValidator({ validateIntervals: true, validateUnits: false }).validate(typed as never, opt as never);
  assertEquals(result.errors.filter((e) => e.constraintType === "interval"), []);
});
