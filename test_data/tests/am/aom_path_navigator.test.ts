/**
 * AOM path navigator tests.
 */

import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { parseAdl } from "../../../parser/mod.ts";
import { resolveAomPath } from "../../../am/util/aom_path_navigator.ts";

const TEST_DATA = new URL("../../", import.meta.url);

Deno.test("resolveAomPath - simple_observation element", async () => {
  const adl = await Deno.readTextFile(new URL("adl2/simple_observation.adl", TEST_DATA));
  const { archetype } = parseAdl(adl);
  const def = archetype!.definition!;
  const match = resolveAomPath(
    def,
    // at-code path for the id-coded nodes (id2 → at0001, …, id5 → at0004).
    "/data[at0001]/events[at0002]/data[at0003]/items[at0004]",
  );
  assertEquals(match?.object.rm_type_name, "ELEMENT");
  assertEquals(match?.object.node_id, "id5");
});
