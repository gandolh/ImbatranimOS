import { IMBATRANIMOS_APP_SLUG } from './ward.types';

describe('IMBATRANIMOS_APP_SLUG', () => {
  // Ward keys grants by this slug. A mismatch refuses every granted account
  // with a clean 403 and no error anywhere, which is how it shipped as
  // `imbatranimos` (brief 137). Change it only together with Ward's own list,
  // `wzd_auth/ui/src/lib/estate.ts`.
  it("is Ward's slug for this app", () => {
    expect(IMBATRANIMOS_APP_SLUG).toBe('imbatranim-os');
  });
});
