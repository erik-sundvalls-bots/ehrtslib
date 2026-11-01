# ADL2 coding system: at-codes (ADL 2.4) and id-codes in one library

Status: accepted (2026-11-01), implemented. Refs [#246](https://github.com/ErikSundvall/ehrtslib/issues/246).

## Decision

**Option 2: both ADL2 variants in one build. The coding system is a
property of each archetype or template. at-coded stays the default for
openEHR RM.** No separate builds. Runtime paths are always at-codes:
Web Template, FLAT, STRUCTURED, AQL and Contribution Builder paths.
id-coded artefacts are mapped to at-codes with the ADL2 spec rule
(`id1` → `at0000`) where data paths are built.

The ADL 2.4 at-code opt-in already exists and is already the default
(#181, 0.8.0). The next release should make it **correct and visible**
rather than add a new switch. See "Next release" below.

## Context

ADL 2.4 (AM 2.4.0, not yet released) defines two coding systems
([ADL2 development, §1.8.2 and §4.2.5](https://specifications.openehr.org/releases/AM/development/ADL2.html#_node_identifier_and_coding_systems),
[SPECAM-90](https://openehr.atlassian.net/browse/SPECAM-90)):

- **at-coded**: ADL 1.4 identical (root `at0000`, specialised `at0000.1`).
  It is mandatory for openEHR RM and compatible with ADL 1.4 data.
- **id-coded**: root `id1`. It is for non-openEHR models. ADL 2.0–2.3
  artefacts and data use it.

The spec states that ADL/AOM 2.3 tools do not read at-coded ADL2 without
engineering work. at-coded ADL 2.4 is incompatible with data created with
id-codes.

### What ehrtslib does today (main after 0.9.0)

- `Adl2CodingSystem = "at-coded" | "id-coded"`, default `"at-coded"`
  (`parser/legacy/adl2_coding_system.ts`). The option is named
  `adl2CodingSystem` on `upconvertOpt14ToAdl2`, `convertAdl14ToAdl2`,
  `OPT2Serializer.serializeOperationalTemplate` and `bindTemplate`.
  Template binding records `opt14-codes=am24-at|am2-archie-id`.
- The ADL2 parser reads both styles. It does not record which style it read.
- The issue text and `contribution-builder-design.md` still said OPT 1.4 is
  up-converted "with id-codes". That has been out of date since 0.8.0.
  This PR fixes the design doc.

### Measured conversion surface

Conversion code:

| File | Lines |
| --- | ---: |
| `parser/legacy/adl2_coding_system.ts` | 31 |
| `parser/legacy/opt14_code_mapping.ts` | 246 |
| `parser/legacy/opt14_upconvert.ts` | 505 |
| `parser/adl14_to_adl2_converter.ts` | 551 |
| `generation/id_to_at_code.ts` (ADL2 → 1.4, Archie-compatible) | 255 |
| `contribution_builder/adl14_downconvert.ts` | 221 |

That is about 1,800 lines. All of it is needed in every option, because
OPT 1.4 import and CDR down-conversion stay. The 1.4 → id mapping is
`adl14AtToId` in `adl14_to_adl2_converter.ts`, used by
`opt14_code_mapping.ts`; `idToAtCode` is its reverse.

**Ad hoc coding-system checks** (about 25 sites in 15 files) use regexes
such as `/^id\d/` and `/^at\d/`, and `startsWith("id")`:

- Coding-system detection exists twice:
  - `hasAdl14NodeIds` in `opt14_upconvert.ts`
  - `inferAdl2CodingSystem` in `contribution_builder/template_binding.ts`
- Generator and term lookup: `rm_instance_generator.ts`, `term_scope.ts`,
  `term_binding.ts`, `opt14_exporter.ts`, `oet14_exporter.ts`,
  `opt_html5_serialize.ts`, `web_template_id_hints.ts`.
- **A naive `idN` → `atNNNN` mapping appears four times:**
  - `serialization/simplified/normalize.ts` (`nodeIdToAtCode`, used by the
    Web Template builder for every `aqlPath`)
  - `instance_nav.ts`
  - `rm_instance_builder.ts`
  - `flat_context_defaults.ts`

  It maps `id2` → `at0002`. The spec and `idToAtCode` map `id2` → `at0001`,
  and `id1.1` becomes `at0011` instead of `at0000.1`.

Two probes on `test_data/opt14`, built from the same OPT 1.4:

1. **Web Template from an id-coded ADL2 template:** every `aqlPath` below
   the root is off by one, for example
   `/context/other_context[at0002]/items[at0007]` instead of `[at0001]/items[at0006]`.
   Data from such a Web Template does not match a CDR holding the OPT 1.4.
2. **Web Template from an at-coded ADL2 template:**
   - The paths match the OPT 1.4.
   - But 5, 15 and 9 node `id`s differ (blood pressure, conformance and
     IDCR lab templates). Names are looked up in the wrong archetype's
     terms, for example `description` becomes `cuff_size`.
   - The IDCR template also gains `/name[at0121]`.

   So FLAT keys differ between an OPT 1.4 and its at-coded ADL2 form.

Fixtures:

- 29 test files cover the coding-system options.
- 44 id-coded ADL2 fixtures are on disk (Archie test set).
- There are no at-coded ADL2 or OPT2 fixtures on disk. at-coded output is
  only produced in memory, in tests.

## Options

| | 1. at-codes only | 2. Both, per artefact | 3. Two builds |
| --- | --- | --- | --- |
| Code | Removes about 30 regex sites. Adds a lossy id → at converter on load. | Today's state. One detector and one mapping replace the ad hoc checks. | Same code as 2, plus build flags and duplicate packages. |
| CDR round trip (OPT 1.4, EHRbase, Better, others) | Good | Good (at-coded default) | Good in the at build only |
| id-coded ADL2 artefacts and data (Archie, ADL 2.0–2.3 tools) | Lost: they cannot be written back as id-coded, and id-coded data paths no longer match | Kept | Kept in the id build only |
| Non-openEHR RMs (id-codes required by spec) | Not supported | Supported | Id build only |
| API and bundle | Smallest API | One `adl2CodingSystem` option. The Contribution Builder resolver accepts both styles. | Two packages, two JSR/npm names, double CI |
| Tests | at fixtures only | Both styles, but only at the parse, serialize and conversion edges. Runtime paths are always at-codes. | Full matrix, twice |
| Vendor neutral, pre-1.0 | Yes | Yes | Yes |
| Timing vs AM 2.4.0 | Commits early to an unreleased spec | Opt-in now, and a default switch is one line if the spec moves | Heavy for an interim period |

Option 1 drops what the spec keeps (id-codes for other RMs and existing
ADL2 data). Option 3 costs a lot and gives nothing over Option 2, because
the parser must read both styles in any case.

## Next release (minimal list)

1. **One detector:** export `adl2CodingSystemOf(archetypeOrTemplate)`,
   which checks the root node id (`at0000…` or `id1…`). It replaces
   `hasAdl14NodeIds` and `inferAdl2CodingSystem`, and the ADL2 parser
   records the result.
2. **One mapping:** replace the four naive `idN` → `atNNNN` copies with
   `idToAtCode` (or the collision-free `buildAdl14CodeMap`). This fixes the
   off-by-one Web Template, FLAT and STRUCTURED paths for id-coded templates.
3. **Web Template parity:** an at-coded ADL2 template must give the same Web
   Template (ids and paths) as its source OPT 1.4. Fix the term-scope name
   lookup and the extra `/name[at0121]`. Add a parity test over all
   `test_data/opt14` fixtures, in both coding systems.
4. **Honest header:** at-coded ADL2 output writes `adl_version=2.4.0`.
   Today `upconvertOpt14ToAdl2` and `OPT2Serializer` write `2.0.5`, which
   AM 2.3 tools read as id-coded. id-coded output keeps `2.0.5`.
5. **Fixtures:** check in at-coded ADL2 and OPT2 fixtures, generated from
   the OPT 1.4 fixtures, as golden files.
6. **Docs:**
   - Document `adl2CodingSystem` as the switch:
     - `"at-coded"`: ADL 2.4, the default for openEHR RM, experimental until
       AM 2.4.0.
     - `"id-coded"`: ADL 2.0–2.3, Archie-compatible.
   - Note in the README that no separate build is planned.

Items 1–3 are bug fixes that are worth doing whatever is decided.
Items 4–6 make the existing opt-in usable for testing ADL 2.4.

## Decisions on the open questions

- **Default:** at-coded stays the default before AM 2.4.0. It matches
  openEHR RM data and the 0.8.0 decision (#181). It is documented as
  experimental until AM 2.4.0 is released.
- **Header mismatch on read:** an at-coded artefact with an ADL 2.0–2.3
  `adl_version` parses with a warning, not an error, so reading stays
  tolerant.

## Implementation

All six next-release items are done:

1. `adl2CodingSystemOf`, `isAdl14Artefact` (replaces `hasAdl14NodeIds`)
   and `adl2CodingVersionWarning` in `parser/legacy/adl2_coding_system.ts`.
   Template binding uses them; the ADL2 parser warns on a header mismatch.
2. `nodeIdToAtCode` and `nodeIdsMatch` in `generation/id_to_at_code.ts`
   (by `idToAtCode`) replace the naive copies in `normalize.ts`,
   `instance_nav.ts`, `rm_instance_builder.ts`, `flat_context_defaults.ts`,
   `archetype_path_resolver.ts` and `aom_path_navigator.ts`.
3. Web Template parity: data values and node ids minted on up-conversion
   (marked with a non-enumerable flag, so not in JSON or template hashes)
   have no node id in paths; the ELEMENT's term names a leaf; a code
   missing from an archetype's terms does not fall back to the flat
   template terms (also for id-codes). The parity test covers every
   `test_data/opt14` fixture in both coding systems: ids, names, paths,
   occurrences and node ids are equal.
4. `adl_version=2.4.0` on at-coded output (`AT_CODED_ADL_VERSION`,
   `adl2VersionFor`); id-coded output keeps `2.0.5` / `2.0.6`.
5. Golden at-coded fixtures in `test_data/adl2/at-coded/` (three OPT2
   files and one archetype), regenerated with `UPDATE_GOLDEN=1`.
6. README and `docs/ADL_SUPPORT.md` "ADL2 coding systems".

OPT2 text round trip ([#252](https://github.com/ErikSundvall/ehrtslib/issues/252)):
an up-converted template written with `OPT2Serializer` and parsed again
gives the same Web Template as the OPT 1.4, for every `test_data/opt14`
fixture in both coding systems (`opt2_text_round_trip.test.ts`). Minted
node ids are `at9000+` / `id9000+`, as in Archie, and are marked in the
text by a `synthetic_node_id` entry in `annotations`, keyed by the minted
node's own path. This is on by default (`syntheticNodeIdAnnotations:
false` turns it off). The marker travels with the text, so no side file is
needed. For compatibility with Archie's format, `upconvertOpt14ToAdl2`
can also write and read Archie's conversion log (`conversionLog`, off by
default), which keeps minted codes stable across re-conversions.

Known limit, left for a decision (#252):

- Node ids are mapped one-to-one by `idToAtCode`. A node id of a natively
  authored id-coded template that the collision-free OPT 1.4 export
  (`buildAdl14CodeMap`) moves to `at9000+` keeps its plain mapping in Web
  Template and FLAT paths, so those paths differ from the exported OPT
  1.4. The export warns about each moved code. Using the collision map
  in paths changes which at-code an id-coded node has in data, so it is
  left for a decision.
