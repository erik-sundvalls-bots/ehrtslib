# CKM-mirror id/at collision fixtures (#252)

| File | Notes |
|------|--------|
| `openEHR-EHR-OBSERVATION.faeces.v1.0.0.adls` | Node id `id19` (Clinical description, 1.4 `at0018`) and the post-parse value code `at19` (bound to `http://openehr.org/id/128`, 1.4 `[openehr::128]`) share the shifted code `at0018`. |
| `openEHR-DEMOGRAPHIC-CLUSTER.person_identifier.v1.0.0.adls` | DV_TEXT node `id11` (no ADL 1.4 node id) and the genuine value code `at11` (1.4 `at0010` 'Local'). |

Both are copied unchanged from [openEHR/archie](https://github.com/openEHR/archie)
`tools/src/test/resources/ckm-mirror/local/archetypes/` (Apache License 2.0, Copyright 2015 Nedap
Healthcare). They are ADL Workbench conversions of the CKM archetypes, © openEHR Foundation,
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
