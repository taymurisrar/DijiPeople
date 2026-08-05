import { slaTargets } from './support-cases.service';

describe('support case SLA policy', () => {
  it('uses enterprise defaults by severity', () => {
    expect(slaTargets('S1_CRITICAL')).toEqual({
      responseHours: 1,
      resolutionHours: 4,
    });
    expect(slaTargets('S4_LOW')).toEqual({
      responseHours: 24,
      resolutionHours: 120,
    });
  });

  it('uses valid platform support settings and rejects invalid values', () => {
    expect(
      slaTargets('S2_HIGH', { s2ResponseHours: 2, s2ResolutionHours: 8 }),
    ).toEqual({ responseHours: 2, resolutionHours: 8 });
    expect(
      slaTargets('S3_MEDIUM', {
        s3ResponseHours: -1,
        s3ResolutionHours: 'bad',
      }),
    ).toEqual({ responseHours: 8, resolutionHours: 48 });
  });
});
