/**
 * TemplateValidator tells siblings with the same node id apart by their name
 * constraint (#250): the same archetype used twice, or an ELEMENT cloned with
 * another name (Karda: CLUSTER 'Vårdgivare', at0003 Identifierare /
 * Organisationsnummer).
 */
import { assert, assertEquals } from "@std/assert";
import { parseOptXml } from "../../../parser/legacy/opt_xml_parser.ts";
import { RMInstanceGenerator } from "../../../generation/rm_instance_generator.ts";
import { TemplateValidator } from "../../../validation/template_validator.ts";
import { CANONICAL_JSON_DESERIALIZE_CONFIG } from "../../../serialization/json/json_config.ts";
import { JsonConfigurableDeserializer } from "../../../serialization/json/json_configurable_deserializer.ts";

function load() {
  const xml = Deno.readTextFileSync(new URL("../../opt14/aql_example.opt", import.meta.url));
  const opt = parseOptXml(xml).operationalTemplate;
  // deno-lint-ignore no-explicit-any
  const plain: any = new RMInstanceGenerator({ mode: "maximal" }).generate(opt);
  return { opt, plain };
}

function validate(opt: ReturnType<typeof load>["opt"], plain: unknown) {
  const typed = new JsonConfigurableDeserializer({ ...CANONICAL_JSON_DESERIALIZE_CONFIG })
    .deserialize(JSON.stringify(plain));
  // deno-lint-ignore no-explicit-any
  return new TemplateValidator().validate(typed as any, opt);
}

Deno.test("same-archetype SECTION siblings validate against their own name constraint (#250)", () => {
  const { opt, plain } = load();
  assertEquals(plain.content.map((c: { name: { value: string } }) => c.name.value), ["Measurements", "Behavior"]);
  const result = validate(opt, plain);
  assertEquals(result.errors.map((e) => `${e.path} ${e.message}`), []);
});

Deno.test("a sibling whose name matches no constraint is still checked against one (#250)", () => {
  const { opt, plain } = load();
  plain.content[1].name.value = "Not in the template";
  const result = validate(opt, plain);
  assert(result.errors.length > 0);
});
