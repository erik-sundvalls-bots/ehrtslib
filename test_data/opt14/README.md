# ADL 1.4 operational templates (XML OPT)

Twenty curated **legacy operational templates** from the [ehrbase/openEHR_SDK](https://github.com/ehrbase/openEHR_SDK) test-data module (`develop` branch).

## Format

These are **ADL 1.4 era XML operational templates** (`OPERATIONALTEMPLATE` schema), **not** ADL2 OPT2 (`.opt` ADL text). They match what most deployed openEHR platforms (ehrbase, EHRbase REST `template_id/adl1.4`) consume today.

## Licence

Apache License 2.0 — same as openEHR_SDK and ehrtslib.

## Selection criteria

Mix of:

- Conformance and minimal entry types (`minimal_*`, `RIPPLE-Conformance Test`, `Test_all_types`)
- Real-world clinical templates (`ips`, `GECCO_Diagnose`, IDCR lists/reports)
- Edge cases (`section_cardinality`, `nested`, `language_test`, `duration_validation`, ISM)

## Refresh

Included in `test_data/scripts/download_fixtures.ts`.

## Future use in ehrtslib

- ADL 1.4 OPT → web template / validation pipeline (Phase 6b PRD)
- Instance generation against legacy templates in demo app Template tab
- Cross-check with Archie JVM flattener where applicable

## Local additions

Some files are not from openEHR_SDK and are not refreshed by the download
script:

- `multilingual_en_sv_de.opt`: a hand-written ehrtslib test fixture.
- `simple-diagnose-and-vitals.opt`: the "Simple vitals" template by Erik
  Sundvall, from
  [Ehrlibs/openEHR-model-examples](https://github.com/Ehrlibs/openEHR-model-examples)
  (`local/theme-packs/simple-diagnose-and-vitals/`, commit `40573df`), also
  used by intehrgrator. That repository has no licence file and the template's
  `licence` field is empty; the included archetypes come from the openEHR CKM.
  ehrtslib adds template annotations (`ui.section`, `a.id`,
  `am.symbol_binding`) at the end of the file so the Contribution Builder
  address examples in `docs/maintainers/contribution-builder-design.md`
  have a real template. `a.id = rate` is set on both Respiration and Pulse on
  purpose, to show a non-unique value.
