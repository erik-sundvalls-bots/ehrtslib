/**
 * OET → operational template compilation tests.
 */

import { assert, assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.220.0/path/mod.ts";
import { ArchetypeRepository, parseOetXml, compileOetToOperational } from "../../../parser/mod.ts";
import { resolveAomPath } from "../../../am/util/aom_path_navigator.ts";

const ADL2_DIR = new URL("../../adl2/", import.meta.url);

const MINIMAL_OET = `<?xml version="1.0"?>
<template xmlns="openEHR/v1/Template">
  <name>simple_observation_hide_element</name>
  <definition archetype_id="openEHR-EHR-OBSERVATION.simple_test.v1.0.0" concept_name="Simple Observation">
    <Rule path="/data[at0001]/events[at0002]/data[at0003]/items[at0004]" max="0" />
  </definition>
</template>`;

Deno.test("compileOetToOperational - max=0 rule on simple_observation", async () => {
  const repo = await ArchetypeRepository.fromDirectory(fromFileUrl(ADL2_DIR));
  const oet = parseOetXml(MINIMAL_OET);
  const { operationalTemplate, warnings } = compileOetToOperational(oet, { repository: repo });

  assert(operationalTemplate.definition);
  assertEquals(
    operationalTemplate.archetype_id?.value,
    "simple_observation_hide_element",
  );

  const elementPath =
    "/data[at0001]/events[at0002]/data[at0003]/items[at0004]";
  const match = resolveAomPath(operationalTemplate.definition!, elementPath);
  assert(match, `expected element at ${elementPath}; warnings: ${warnings.join("; ")}`);
  assertEquals(match.object.occurrences?.upper, 0);
});
