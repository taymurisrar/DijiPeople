import { AttendanceGeofenceService } from './attendance-geofence.service';
import { ImpossibleTravelDetectorService } from './impossible-travel-detector.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AttendancePolicyResolverService } from './attendance-policy-resolver.service';

/**
 * The detector, tested against real coordinates.
 *
 * Two things are being protected here. First that it flags what it should and
 * stays quiet otherwise — a risk signal that cries wolf gets switched off, and a
 * switched-off control protects nobody. Second that it never does more than
 * flag: no session is touched, no time is reduced, and a finding a human has
 * already closed is not reopened.
 */

// Real places, so the distances are checkable against any map.
const KARACHI = { latitude: 24.8607, longitude: 67.0011 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
/** About 11 km from the Karachi point: an ordinary cross-town journey. */
const KARACHI_NORTH = { latitude: 24.9607, longitude: 67.0011 };

const POLICY = {
  impossibleTravelDetectionEnabled: true,
  impossibleTravelMinimumDistanceKm: 100,
  impossibleTravelMaximumSpeedKph: 500,
};

interface PointOverrides {
  id?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number | null;
  capturedAt?: string;
  matchedWorkSiteName?: string | null;
}

function point(overrides: PointOverrides = {}) {
  return {
    id: overrides.id ?? 'evidence-1',
    capturedAt: new Date(overrides.capturedAt ?? '2026-08-14T08:00:00.000Z'),
    latitude: overrides.latitude ?? KARACHI.latitude,
    longitude: overrides.longitude ?? KARACHI.longitude,
    accuracyMeters:
      overrides.accuracyMeters === undefined ? 20 : overrides.accuracyMeters,
    matchedWorkSiteName: overrides.matchedWorkSiteName ?? null,
    attendanceDate: new Date('2026-08-14T00:00:00.000Z'),
  };
}

/** The shape `findFirst` returns, before `toPoint` normalises it. */
function evidenceRow(overrides: PointOverrides & { employeeId?: string } = {}) {
  const base = point(overrides);
  return {
    id: base.id,
    employeeId: overrides.employeeId ?? 'employee-1',
    capturedAt: base.capturedAt,
    latitude: base.latitude,
    longitude: base.longitude,
    accuracyMeters: base.accuracyMeters,
    attendanceDate: base.attendanceDate,
    matchedWorkSite: base.matchedWorkSiteName
      ? { name: base.matchedWorkSiteName }
      : null,
  };
}

describe('ImpossibleTravelDetectorService', () => {
  let service: ImpossibleTravelDetectorService;
  let prisma: {
    attendanceLocationEvidence: { findFirst: jest.Mock };
    attendanceException: { upsert: jest.Mock; count: jest.Mock };
    attendanceDay: { findUnique: jest.Mock; update: jest.Mock };
  };
  let policies: { resolve: jest.Mock };

  beforeEach(() => {
    prisma = {
      attendanceLocationEvidence: { findFirst: jest.fn() },
      attendanceException: {
        upsert: jest.fn().mockResolvedValue({ id: 'exception-1' }),
        count: jest.fn().mockResolvedValue(1),
      },
      attendanceDay: {
        findUnique: jest.fn().mockResolvedValue({ id: 'day-1' }),
        update: jest.fn().mockResolvedValue({ id: 'day-1' }),
      },
    };

    policies = { resolve: jest.fn().mockResolvedValue(POLICY) };

    service = new ImpossibleTravelDetectorService(
      prisma as unknown as PrismaService,
      new AttendanceGeofenceService(),
      policies as unknown as AttendancePolicyResolverService,
    );
  });

  describe('assess', () => {
    it('flags Karachi to London half an hour apart', () => {
      const result = service.assess(
        point({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        point({
          id: 'b',
          ...LONDON,
          capturedAt: '2026-08-14T08:30:00.000Z',
        }),
        POLICY,
      );

      expect(result).not.toBeNull();
      // ~6000 km; the exact figure depends on the earth model, so the assertion
      // is on the order of magnitude rather than a hard-coded number.
      expect(result!.distanceKm).toBeGreaterThan(5500);
      expect(result!.elapsedMinutes).toBe(30);
      expect(result!.requiredSpeedKph).toBeGreaterThan(10000);
    });

    it('ignores an ordinary cross-town journey', () => {
      // 11 km in 30 minutes: 22 km/h, and nowhere near the distance floor. Both
      // conditions must be exceeded, which is what stops this being noise.
      const result = service.assess(
        point({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        point({
          id: 'b',
          ...KARACHI_NORTH,
          capturedAt: '2026-08-14T08:30:00.000Z',
        }),
        POLICY,
      );

      expect(result).toBeNull();
    });

    it('ignores long travel that had time to happen', () => {
      // Karachi to London in fourteen hours is a flight, not a fraud.
      const result = service.assess(
        point({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        point({
          id: 'b',
          ...LONDON,
          capturedAt: '2026-08-14T22:00:00.000Z',
        }),
        POLICY,
      );

      expect(result).toBeNull();
    });

    it('subtracts the reported accuracy of both fixes before judging', () => {
      // Two fixes each accurate to ±4000 km would place someone anywhere; the
      // apparent distance says nothing, and blaming the employee for the phone
      // is the fastest way to make the signal worthless.
      const result = service.assess(
        point({
          id: 'a',
          accuracyMeters: 4_000_000,
          capturedAt: '2026-08-14T08:00:00.000Z',
        }),
        point({
          id: 'b',
          ...LONDON,
          accuracyMeters: 4_000_000,
          capturedAt: '2026-08-14T08:30:00.000Z',
        }),
        POLICY,
      );

      expect(result).toBeNull();
    });

    it('treats two distant positions at the same instant as the strongest case', () => {
      const result = service.assess(
        point({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        point({
          id: 'b',
          ...LONDON,
          capturedAt: '2026-08-14T08:00:00.000Z',
        }),
        POLICY,
      );

      expect(result).not.toBeNull();
      expect(result!.elapsedMinutes).toBe(0);
      expect(result!.requiredSpeedKph).toBe(Number.POSITIVE_INFINITY);
    });

    it('respects a tenant that has widened the thresholds', () => {
      // An airline with staff who genuinely cross continents between punches.
      const result = service.assess(
        point({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        point({
          id: 'b',
          ...LONDON,
          capturedAt: '2026-08-14T08:30:00.000Z',
        }),
        {
          impossibleTravelMinimumDistanceKm: 100,
          impossibleTravelMaximumSpeedKph: 20_000,
        },
      );

      expect(result).toBeNull();
    });
  });

  describe('evaluateForEvidence', () => {
    it('does nothing at all when the tenant has it switched off', async () => {
      policies.resolve.mockResolvedValue({
        ...POLICY,
        impossibleTravelDetectionEnabled: false,
      });

      const result = await service.evaluateForEvidence(
        'tenant-1',
        'evidence-1',
      );

      expect(result).toEqual({ pairsExamined: 0, flagged: 0, disabled: true });
      expect(
        prisma.attendanceLocationEvidence.findFirst,
      ).not.toHaveBeenCalled();
      expect(prisma.attendanceException.upsert).not.toHaveBeenCalled();
    });

    it('examines the neighbours on BOTH sides, for evidence that arrived late', async () => {
      // The gateway-was-offline case: A then C then B. Looking only backwards
      // would compare A→B and never notice that B→C is the impossible leg.
      const subject = evidenceRow({
        id: 'b',
        capturedAt: '2026-08-14T09:00:00.000Z',
      });
      const earlier = evidenceRow({
        id: 'a',
        capturedAt: '2026-08-14T08:00:00.000Z',
      });
      const later = evidenceRow({
        id: 'c',
        ...LONDON,
        capturedAt: '2026-08-14T09:20:00.000Z',
      });

      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(subject)
        .mockResolvedValueOnce(earlier)
        .mockResolvedValueOnce(later);

      const result = await service.evaluateForEvidence('tenant-1', 'b');

      expect(result.pairsExamined).toBe(2);
      // A→B is across town and quiet; B→C is Karachi to London in 20 minutes.
      expect(result.flagged).toBe(1);
      expect(prisma.attendanceException.upsert).toHaveBeenCalledTimes(1);
    });

    it('only considers accepted evidence, scoped to the tenant', async () => {
      prisma.attendanceLocationEvidence.findFirst.mockResolvedValue(null);

      await service.evaluateForEvidence('tenant-1', 'evidence-1');

      for (const call of prisma.attendanceLocationEvidence.findFirst.mock
        .calls) {
        expect(call[0].where.tenantId).toBe('tenant-1');
        // A refused punch is not a statement about where anybody was.
        expect(call[0].where.outcome).toBe('ALLOW');
      }
    });

    it('produces the same key whichever of the pair triggered it, and never reopens a closed finding', async () => {
      const a = evidenceRow({
        id: 'a',
        capturedAt: '2026-08-14T08:00:00.000Z',
      });
      const b = evidenceRow({
        id: 'b',
        ...LONDON,
        capturedAt: '2026-08-14T08:30:00.000Z',
      });

      // Triggered by B, looking backwards to A.
      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(b)
        .mockResolvedValueOnce(a)
        .mockResolvedValueOnce(null);
      await service.evaluateForEvidence('tenant-1', 'b');

      // Triggered by A, looking forwards to B.
      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(a)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(b);
      await service.evaluateForEvidence('tenant-1', 'a');

      const [first, second] = prisma.attendanceException.upsert.mock.calls;
      expect(first[0].where.tenantId_dedupeKey.dedupeKey).toBe(
        second[0].where.tenantId_dedupeKey.dedupeKey,
      );

      // The update path refreshes the wording and the figures only. Setting
      // status here would ask HR to re-decide "known bad GPS" on every re-run.
      expect(Object.keys(first[0].update).sort()).toEqual([
        'detail',
        'message',
      ]);
    });

    it('records the arithmetic and the site names, and no coordinates', async () => {
      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(
          evidenceRow({
            id: 'b',
            ...LONDON,
            capturedAt: '2026-08-14T08:30:00.000Z',
            matchedWorkSiteName: 'London Bridge',
          }),
        )
        .mockResolvedValueOnce(
          evidenceRow({
            id: 'a',
            capturedAt: '2026-08-14T08:00:00.000Z',
            matchedWorkSiteName: 'Karachi HQ',
          }),
        )
        .mockResolvedValueOnce(null);

      await service.evaluateForEvidence('tenant-1', 'b');

      const [call] = prisma.attendanceException.upsert.mock.calls;
      const { create } = call[0];

      expect(create.type).toBe('IMPOSSIBLE_TRAVEL');
      // WARNING, never blocking: the day's numbers are not in doubt, only how
      // both locations can be true.
      expect(create.severity).toBe('WARNING');
      expect(create.detail.fromWorkSite).toBe('Karachi HQ');
      expect(create.detail.toWorkSite).toBe('London Bridge');
      expect(create.detail.requiredSpeedKph).toBeGreaterThan(10000);

      // The exception list is read by every manager. Positions stay in
      // AttendanceLocationEvidence behind their own permission.
      const serialised = JSON.stringify(create);
      expect(serialised).not.toContain('latitude');
      expect(serialised).not.toContain('longitude');
      expect(serialised).not.toContain(String(LONDON.latitude));
      expect(create.message).not.toContain(String(KARACHI.latitude));
    });

    it('reaches a pair sharing an instant, and reports it without dividing by zero', async () => {
      const instant = '2026-08-14T08:00:00.000Z';

      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(
          evidenceRow({ id: 'b', ...LONDON, capturedAt: instant }),
        )
        .mockResolvedValueOnce(evidenceRow({ id: 'a', capturedAt: instant }))
        .mockResolvedValueOnce(null);

      await service.evaluateForEvidence('tenant-1', 'b');

      // The backward query must admit the tie, or the most impossible case there
      // is would be the one case that never gets examined.
      const backward =
        prisma.attendanceLocationEvidence.findFirst.mock.calls[1][0];
      expect(backward.where.capturedAt).toEqual({ lte: expect.any(Date) });
      expect(backward.where.id).toEqual({ not: 'b' });

      // Only the backward query admits ties, so the pair is raised once.
      const forward =
        prisma.attendanceLocationEvidence.findFirst.mock.calls[2][0];
      expect(forward.where.capturedAt).toEqual({ gt: expect.any(Date) });

      const [call] = prisma.attendanceException.upsert.mock.calls;
      expect(call[0].create.detail.elapsedMinutes).toBe(0);
      // Null rather than a meaningless Infinity, which does not survive JSON.
      expect(call[0].create.detail.requiredSpeedKph).toBeNull();
      expect(call[0].create.message).toContain('at the same moment');
    });

    it('attaches the finding to the day so the review list can count it', async () => {
      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(
          evidenceRow({
            id: 'b',
            ...LONDON,
            capturedAt: '2026-08-14T08:30:00.000Z',
          }),
        )
        .mockResolvedValueOnce(
          evidenceRow({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        )
        .mockResolvedValueOnce(null);

      prisma.attendanceException.count.mockResolvedValue(2);

      await service.evaluateForEvidence('tenant-1', 'b');

      expect(
        prisma.attendanceException.upsert.mock.calls[0][0].create
          .attendanceDayId,
      ).toBe('day-1');

      // The ONLY write to the day: the count of what is open. Not its status,
      // not its minutes, not its lock. Recounted rather than incremented, so a
      // re-run does not inflate it.
      expect(prisma.attendanceDay.update).toHaveBeenCalledWith({
        where: { id: 'day-1' },
        data: { openExceptionCount: 2 },
      });
    });

    it('still records a finding when the day has not been reconciled yet', async () => {
      prisma.attendanceDay.findUnique.mockResolvedValue(null);

      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(
          evidenceRow({
            id: 'b',
            ...LONDON,
            capturedAt: '2026-08-14T08:30:00.000Z',
          }),
        )
        .mockResolvedValueOnce(
          evidenceRow({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        )
        .mockResolvedValueOnce(null);

      await service.evaluateForEvidence('tenant-1', 'b');

      // Evidence can arrive before reconciliation has run. Reconciliation picks
      // the exception up by date; losing the finding would be the worse outcome.
      expect(
        prisma.attendanceException.upsert.mock.calls[0][0].create
          .attendanceDayId,
      ).toBeNull();
      expect(prisma.attendanceDay.update).not.toHaveBeenCalled();
    });

    it('leaves attendance alone entirely', async () => {
      prisma.attendanceLocationEvidence.findFirst
        .mockResolvedValueOnce(
          evidenceRow({
            id: 'b',
            ...LONDON,
            capturedAt: '2026-08-14T08:30:00.000Z',
          }),
        )
        .mockResolvedValueOnce(
          evidenceRow({ id: 'a', capturedAt: '2026-08-14T08:00:00.000Z' }),
        )
        .mockResolvedValueOnce(null);

      await service.evaluateForEvidence('tenant-1', 'b');

      // It is a risk signal, not a decision. The day update carries the open
      // count and nothing else — no status, no minutes, no lock — and no
      // session or attendance entry is touched at all.
      const dayWrite = prisma.attendanceDay.update.mock.calls[0][0];
      expect(Object.keys(dayWrite.data)).toEqual(['openExceptionCount']);
      expect(Object.keys(prisma)).toEqual([
        'attendanceLocationEvidence',
        'attendanceException',
        'attendanceDay',
      ]);
      expect(prisma.attendanceException.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
