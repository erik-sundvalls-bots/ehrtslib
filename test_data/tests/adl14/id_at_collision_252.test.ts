/**
 * https://github.com/ErikSundvall/ehrtslib/issues/252
 * id-coded ADL2 → ADL 1.4 codes: node ids never move, value codes do.
 *
 * Fixtures: CKM-mirror faeces and person_identifier from Archie (see
 * test_data/adl2/ckm_mirror_252/README.md).
 */
import { assert, assertEquals } from "@std/assert";
import { ADL2Parser } from "../../../parser/adl2_parser.ts";
import { ADL2Tokenizer } from "../../../parser/adl2_tokenizer.ts";
import { flattenToOperationalTemplate } from "../../../am/util/flattening/template_flattener.ts";
import type { ArchetypeResolver } from "../../../am/util/flattening/template_flattener.ts";
import {
  buildWebTemplate,
  deserializeFromFlatWithIssues,
} from "../../../serialization/simplified/mod.ts";
import type { WebTemplateNode } from "../../../serialization/simplified/types.ts";
import { Adl2TemplateLibrary } from "../../../generation/opt14/adl2_template_library.ts";
import { exportAdl2TemplateToOpt14 } from "../../../generation/opt14/opt14_exporter.ts";
import {
  buildAdl14CodeMap,
  DROPPED_NODE_ID,
} from "../../../generation/id_to_at_code.ts";
import {
  adl14CodeFor,
  adl14CodeMapWarnings,
} from "../../../generation/adl14_code_map_cache.ts";
import { downConvertToAdl14 } from "../../../contribution_builder/adl14_downconvert.ts";
import type { TemplateBinding } from "../../../contribution_builder/template_binding.ts";

const DIR = new URL("../../adl2/ckm_mirror_252/", import.meta.url);
const FAECES = "openEHR-EHR-OBSERVATION.faeces.v1.0.0.adls";
const PERSON_ID = "openEHR-DEMOGRAPHIC-CLUSTER.person_identifier.v1.0.0.adls";

// deno-lint-ignore no-explicit-any
function archetype(name: string): any {
  // deno-lint-ignore no-explicit-any
  const r: any = new ADL2Parser(
    new ADL2Tokenizer(Deno.readTextFileSync(new URL(name, DIR))).tokenize(),
  ).parse();
  return r.archetype ?? r;
}

const noResolver = { resolve: () => undefined } as unknown as ArchetypeResolver;

function find(n: WebTemplateNode, id: string): WebTemplateNode | undefined {
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return undefined;
}

Deno.test("#252 faeces: node id19 keeps at0018; post-parse value at19 is written back as openehr::128", () => {
  const opt = flattenToOperationalTemplate(archetype(FAECES), noResolver);
  assertEquals(adl14CodeFor(opt, "id19"), "at0018");
  assertEquals(adl14CodeFor(opt, "at19"), "openehr::128");
  assertEquals(adl14CodeFor(opt, "at13"), "at0012"); // genuine value codes keep the shift
  assertEquals(adl14CodeMapWarnings(opt), []); // post-parse write-back is expected, no warning
  const wt = buildWebTemplate(opt);
  const node = find(wt.tree, "clinical_description");
  assertEquals(node?.nodeId, "at0018");
  assertEquals(
    node?.aqlPath,
    "/data[at0001]/events[at0002]/data[at0003]/items[at0018]",
  );
});

Deno.test("#252 faeces: Web Template value codes of an id-coded template are ADL 1.4 codes", () => {
  const wt = buildWebTemplate(
    flattenToOperationalTemplate(archetype(FAECES), noResolver),
  );
  const amount = find(wt.tree, "amount");
  const codes = amount?.inputs?.find((i) => i.suffix === "code")?.list?.map((
    i,
  ) => i.value);
  assertEquals(codes, [
    "at0012",
    "at0013",
    "at0014",
    "at0015",
    "at0016",
    "at0017",
  ]);
});

Deno.test("#252 faeces: FLAT → RM writes archetype_node_id at0018", () => {
  const wt = buildWebTemplate(
    flattenToOperationalTemplate(archetype(FAECES), noResolver),
  );
  const p = "faeces/any_event:0/";
  const { composition } = deserializeFromFlatWithIssues(
    {
      [`${p}clinical_description|code`]: "123",
      [`${p}clinical_description|value`]: "Normal",
      [`${p}clinical_description|terminology`]: "SNOMED-CT",
      [`${p}amount|code`]: "at0012",
      [`${p}amount|value`]: "x",
      [`${p}amount|ordinal`]: 1,
    },
    wt,
    { unknownKeys: "error" },
  );
  const json = JSON.stringify(composition);
  assert(json.includes('"archetype_node_id":"at0018"'), json);
  assert(json.includes('"code_string":"at0012"'), json);
});

Deno.test("#252 faeces: OPT 1.4 export keeps items[at0018] and writes property [openehr::128]", () => {
  const lib = new Adl2TemplateLibrary();
  const demo = new URL(
    "../../adl2/template_export_123/openEHR-EHR-COMPOSITION.report_demo.v1.0.0.adls",
    import.meta.url,
  );
  lib.addSource(Deno.readTextFileSync(demo), "report_demo.adls");
  lib.addSource(Deno.readTextFileSync(new URL(FAECES, DIR)), FAECES);
  const [tid] = lib.addSource(
    Deno.readTextFileSync(
      new URL("openEHR-EHR-COMPOSITION.t_faeces_252.v1.0.0.adls", DIR),
    ),
    "t_faeces_252.adls",
  );
  const { xml, warnings, componentCodeMaps } = exportAdl2TemplateToOpt14(
    lib,
    tid,
  );
  assert(xml.includes("<node_id>at0018</node_id>"));
  const prop = /<property>[\s\S]*?<\/property>/.exec(xml)?.[0] ?? "";
  assert(
    prop.includes("<value>openehr</value>") &&
      prop.includes("<code_string>128</code_string>"),
    prop,
  );
  assert(!warnings.some((w) => /id19|at19/.test(w)), warnings.join("\n"));
  const faeces = Object.entries(componentCodeMaps).find(([k]) =>
    k.includes("faeces")
  )?.[1];
  assertEquals(faeces?.id19, "at0018");
  assertEquals(faeces?.at19, "openehr::128");
  // The post-parse code has no local term in ADL 1.4.
  assert(!/code="at0018">\s*<items id="text">\(added by post-parse/.test(xml));
});

Deno.test("#252 person_identifier: DV_TEXT id11 is not a node in 1.4; value at11 keeps at0010", () => {
  const opt = flattenToOperationalTemplate(archetype(PERSON_ID), noResolver);
  assertEquals(adl14CodeFor(opt, "at11"), "at0010");
  assertEquals(adl14CodeFor(opt, "id4"), "at0003");
  assertEquals(adl14CodeMapWarnings(opt), []);
});

Deno.test("#252 native collision: LOCATABLE node keeps its code, the value code moves to at9000 with a warning", () => {
  const warns: string[] = [];
  const map = buildAdl14CodeMap(["id1", "id2", "id3", "at2", "at4"], {
    terms: {
      en: {
        id1: { text: "Root" },
        id2: { text: "Status" },
        id3: { text: "Value" },
        at2: { text: "Final" },
        at4: { text: "Draft" },
      },
    },
    nodeTypes: new Map([["id1", "CLUSTER"], ["id2", "ELEMENT"], [
      "id3",
      "DV_CODED_TEXT",
    ]]),
    warn: (m) => warns.push(m),
  });
  assertEquals(map.get("id2"), "at0001");
  assertEquals(map.get("id3"), DROPPED_NODE_ID); // DV_* node: no ADL 1.4 node id
  assertEquals(map.get("at2"), "at9000");
  assertEquals(map.get("at4"), "at0003");
  assertEquals(warns.length, 1);
  assert(warns[0].includes("at2") && warns[0].includes("at9000"), warns[0]);
});

Deno.test("#252 colliding value code with an external binding is written back", () => {
  const warns: string[] = [];
  const map = buildAdl14CodeMap(["id1", "id2", "at2"], {
    terms: { en: { id2: { text: "Node" }, at2: { text: "Minutes" } } },
    bindings: { openehr: { at2: "http://openehr.org/id/128" } },
    warn: (m) => warns.push(m),
  });
  assertEquals(map.get("id2"), "at0001");
  assertEquals(map.get("at2"), "openehr::128");
  assertEquals(warns.length, 1);
});

Deno.test("#252 id-coded draft down-conversion: written-back value code changes terminology", () => {
  const opt = flattenToOperationalTemplate(archetype(FAECES), noResolver);
  const binding = {
    templateId: "t",
    sourceFormat: "adl2",
  } as unknown as TemplateBinding;
  const data = {
    _type: "ELEMENT",
    archetype_node_id: "id19",
    value: {
      _type: "DV_CODED_TEXT",
      value: "x",
      defining_code: {
        _type: "CODE_PHRASE",
        terminology_id: { _type: "TERMINOLOGY_ID", value: "local" },
        code_string: "at19",
      },
    },
  };
  const { data: out } = downConvertToAdl14(data, binding, {
    operationalTemplate: opt,
  });
  const s = JSON.stringify(out);
  assert(s.includes('"archetype_node_id":"at0018"'), s);
  assert(
    s.includes('"value":"openehr"') && s.includes('"code_string":"128"'),
    s,
  );
});
