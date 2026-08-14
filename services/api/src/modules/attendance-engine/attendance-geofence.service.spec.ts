import {
  AttendanceGeofenceService,
  type GeofenceCandidate,
} from './attendance-geofence.service';

/**
 * The geofence decides whether a web punch is accepted, so it is worth being
 * precise about. No external map service is involved — the maths is local and
 * deterministic, which is why these assertions can be exact.
 */
describe('AttendanceGeofenceService', () => {
  const service = new AttendanceGeofenceService();

  // Real coordinates, so the distances are checkable against any map.
  const DOHA_HQ = { latitude: 25.2854, longitude: 51.531 };
  const LUSAIL = { latitude: 25.4295, longitude: 51.4911 };

  function site(
    id: string,
    coordinates: { latitude: number; longitude: number },
    overrides: Partial<GeofenceCandidate> = {},
  ): GeofenceCandidate {
    return {
      workSiteId: id,
      name: id,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radiusMeters: null,
      maximumAccuracyMeters: null,
      timezone: 'Asia/Qatar',
      ...overrides,
    };
  }

  const base = {
    candidates: [site('hq', DOHA_HQ)],
    defaultRadiusMeters: 100,
    defaultMaximumAccuracyMeters: 100,
  };

  // ------------------------------------------------------------- distance

  it('measures a known distance correctly', () => {
    // Doha to Lusail is about 16 km. A rectangular bounding box would give a
    // different answer depending on which way the two points lie.
    const distance = service.distanceMeters(
      DOHA_HQ.latitude,
      DOHA_HQ.longitude,
      LUSAIL.latitude,
      LUSAIL.longitude,
    );

    expect(distance).toBeGreaterThan(16_000);
    expect(distance).toBeLessThan(17_000);
  });

  it('measures zero for the same point', () => {
    expect(
      service.distanceMeters(
        DOHA_HQ.latitude,
        DOHA_HQ.longitude,
        DOHA_HQ.latitude,
        DOHA_HQ.longitude,
      ),
    ).toBeCloseTo(0, 6);
  });

  // --------------------------------------------------------------- inside

  it('accepts a position at the centre of a site', () => {
    const result = service.evaluate({
      ...base,
      position: { ...DOHA_HQ, accuracyMeters: 10 },
    });

    expect(result.positionUsable).toBe(true);
    expect(result.insideSite?.workSiteId).toBe('hq');
    expect(result.insideSite?.distanceMeters).toBe(0);
  });

  it('rejects a position well outside the radius', () => {
    const result = service.evaluate({
      ...base,
      position: { ...LUSAIL, accuracyMeters: 10 },
    });

    expect(result.positionUsable).toBe(true);
    expect(result.insideSite).toBeNull();
    // Still reported as the nearest, which is what a refusal message needs.
    expect(result.nearest?.workSiteId).toBe('hq');
  });

  it('treats a position exactly on the boundary as inside', () => {
    // A point at the radius is at the edge of the site, and an employee standing
    // in the doorway should not be refused by a floating-point tie-break.
    const metresPerDegreeLatitude = 111_320;
    const offset = 100 / metresPerDegreeLatitude;

    const result = service.evaluate({
      ...base,
      position: {
        latitude: DOHA_HQ.latitude + offset,
        longitude: DOHA_HQ.longitude,
        accuracyMeters: 5,
      },
    });

    expect(result.nearest?.distanceMeters).toBe(100);
    expect(result.insideSite).not.toBeNull();
  });

  it('honours a site radius override over the tenant default', () => {
    const result = service.evaluate({
      ...base,
      candidates: [site('hq', DOHA_HQ, { radiusMeters: 20_000 })],
      position: { ...LUSAIL, accuracyMeters: 10 },
    });

    // 16 km away, inside a 20 km campus radius.
    expect(result.insideSite?.workSiteId).toBe('hq');
  });

  // ------------------------------------------------------------- accuracy

  it('refuses a position whose accuracy is worse than allowed', () => {
    const result = service.evaluate({
      ...base,
      position: { ...DOHA_HQ, accuracyMeters: 1500 },
    });

    // A reading accurate to ±1500m says nothing about whether someone is in the
    // building. Accepting it would make the office-device rule bypassable by
    // anyone whose phone reports poor accuracy.
    expect(result.positionUsable).toBe(false);
    expect(result.rejectionCode).toBe('ACCURACY_TOO_LOW');
    expect(result.rejectionMessage).toMatch(/accurately enough/i);
    expect(result.insideSite).toBeNull();
  });

  it('honours a stricter site accuracy limit', () => {
    const result = service.evaluate({
      ...base,
      candidates: [site('hq', DOHA_HQ, { maximumAccuracyMeters: 20 })],
      position: { ...DOHA_HQ, accuracyMeters: 50 },
    });

    expect(result.positionUsable).toBe(false);
    expect(result.appliedAccuracyLimitMeters).toBe(20);
  });

  it('accepts any accuracy when no limit is configured anywhere', () => {
    const result = service.evaluate({
      ...base,
      defaultMaximumAccuracyMeters: null,
      position: { ...DOHA_HQ, accuracyMeters: 5000 },
    });

    expect(result.positionUsable).toBe(true);
    expect(result.appliedAccuracyLimitMeters).toBeNull();
  });

  it('accepts a position that reports no accuracy at all', () => {
    // Some browsers omit it. Refusing outright would block attendance for a
    // whole class of device; the limit applies to a stated accuracy, not to
    // silence, and the absence is recorded in the evidence.
    const result = service.evaluate({
      ...base,
      position: { ...DOHA_HQ },
    });

    expect(result.positionUsable).toBe(true);
    expect(result.reportedAccuracyMeters).toBeNull();
  });

  // ------------------------------------------------------------ bad input

  it('refuses coordinates outside the valid range', () => {
    const result = service.evaluate({
      ...base,
      position: { latitude: 91, longitude: 0, accuracyMeters: 5 },
    });

    expect(result.positionUsable).toBe(false);
    expect(result.rejectionCode).toBe('COORDINATES_INVALID');
  });

  it('refuses a non-finite coordinate', () => {
    const result = service.evaluate({
      ...base,
      position: {
        latitude: Number.NaN,
        longitude: DOHA_HQ.longitude,
        accuracyMeters: 5,
      },
    });

    expect(result.positionUsable).toBe(false);
  });

  // ------------------------------------------------------ multiple sites

  it('picks the containing site over a merely nearer one', () => {
    const result = service.evaluate({
      ...base,
      candidates: [
        site('lusail', LUSAIL),
        site('hq', DOHA_HQ, { radiusMeters: 500 }),
      ],
      position: { ...DOHA_HQ, accuracyMeters: 10 },
    });

    expect(result.insideSite?.workSiteId).toBe('hq');
    expect(result.matches[0].workSiteId).toBe('hq');
  });

  it('ranks by distance when the position is inside none of them', () => {
    const halfway = {
      latitude: (DOHA_HQ.latitude + LUSAIL.latitude) / 2 + 0.01,
      longitude: (DOHA_HQ.longitude + LUSAIL.longitude) / 2,
    };

    const result = service.evaluate({
      ...base,
      candidates: [site('hq', DOHA_HQ), site('lusail', LUSAIL)],
      position: { ...halfway, accuracyMeters: 10 },
    });

    expect(result.insideSite).toBeNull();
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].distanceMeters).toBeLessThanOrEqual(
      result.matches[1].distanceMeters,
    );
  });

  it('skips a site that has no coordinates', () => {
    // A site with no geofence cannot contain anybody. Skipped rather than
    // treated as "everywhere" or "nowhere", both of which would be a guess.
    const result = service.evaluate({
      ...base,
      candidates: [
        site('hq', DOHA_HQ, { latitude: null, longitude: null }),
        site('lusail', LUSAIL),
      ],
      position: { ...DOHA_HQ, accuracyMeters: 10 },
    });

    expect(result.matches.map((match) => match.workSiteId)).toEqual(['lusail']);
  });

  it('returns nothing to match against when the employee has no sites', () => {
    const result = service.evaluate({
      ...base,
      candidates: [],
      position: { ...DOHA_HQ, accuracyMeters: 10 },
    });

    expect(result.positionUsable).toBe(true);
    expect(result.nearest).toBeNull();
    expect(result.insideSite).toBeNull();
  });

  it('never lets a zero radius make a site unenterable', () => {
    const result = service.evaluate({
      ...base,
      candidates: [site('hq', DOHA_HQ, { radiusMeters: 0 })],
      position: { ...DOHA_HQ, accuracyMeters: 5 },
    });

    // Floored to a usable minimum: a misconfigured zero would otherwise lock
    // every employee out of that site permanently.
    expect(result.insideSite?.workSiteId).toBe('hq');
  });
});
