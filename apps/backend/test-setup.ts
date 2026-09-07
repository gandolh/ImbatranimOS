/**
 * Environment every test run needs before `ConfigModule` validates it.
 *
 * `config/env.schema.ts` requires the three `WARD_*` variables and has no
 * defaults for them — deliberately, because a missing one in production is a
 * total outage rather than a degraded mode, and an undefaulted
 * `WARD_API_BASE_PATH` in particular is what stops an empty value resolving
 * Ward's JWKS to a path nothing serves.
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
