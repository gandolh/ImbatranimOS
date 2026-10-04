/**
 * Environment every test run needs before `ConfigModule` validates it.
 *
 * `config/env.schema.ts` takes all three `WARD_*` variables or none: with
 * none, the backend runs its own local sign-in instead (brief 152). Most suites
 * test the Ward path, so they get all three here; `local-identity.e2e-spec.ts`
 * supplies its own config to test the local one.
 *
 * That correctness costs the test suite three lines. Setting them here rather
 * than defaulting them in the schema keeps the production guarantee intact:
 * these values are fictional, no test reaches Ward with them, and every suite
 * that authenticates does so through `modules/ward/testing.ts`'s fake client.
 *
 * `??=` rather than `=` so a run that deliberately points at a real Ward — a
 * manual integration check — keeps whatever it was given.
 */
process.env.WARD_PUBLIC_ORIGIN ??= 'https://ward.test';
process.env.WARD_API_BASE_PATH ??= '/ward-api';
process.env.WARD_APP_KEY ??= 'wak_test_key_not_a_real_credential';
