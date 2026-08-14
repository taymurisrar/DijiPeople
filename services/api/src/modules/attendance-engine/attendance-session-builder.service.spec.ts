import {
  AttendanceExceptionType,
  AttendanceSessionStatus,
  EmployeeWorkMode,
  RawAttendanceCaptureSource,
} from '@prisma/client';

import {
  AttendanceSessionBuilderService,
  type PunchWorkMode,
  type SessionBuildPolicy,
} from './attendance-session-builder.service';
import type { InterpretedPunch } from './punch-interpreter.service';

/**
 * Punch pairing, which is where the subtle attendance bugs live.
 *
 * Every scenario here is one a real customer produces: the hybrid day, the
 * multi-entrance office, the forgotten checkout, the double-tapped reader. They
 * are cheap to test only because the builder is pure — no database, no clock.
 */
describe('AttendanceSessionBuilderService', () => {
  const builder = new AttendanceSessionBuilderService();

  const HQ = 'site-hq';
  const LUSAIL = 'site-lusail';

  const defaultPolicy: SessionBuildPolicy = {
    openSessionPolicy: 'CREATE_EXCEPTION',
    crossSitePolicy: 'WARNING',
    autoCloseAtShiftEnd: false,
    treatGapsAsBreaks: false,
  };

  const at = (time: string) => new Date(`2026-08-14T${time}:00.000Z`);

  let sequence = 0;

  beforeEach(() => {
    sequence = 0;
  });

  function punch(
    time: string,
    direction: InterpretedPunch['direction'],
    options: {
      source?: RawAttendanceCaptureSource;
      workMode?: EmployeeWorkMode;
      workSiteId?: string | null;
      deviceId?: string | null;
      duplicate?: boolean;
    } = {},
  ): InterpretedPunch {
    return {
      rawEventId: `event-${sequence++}`,
      captureSource: options.source ?? RawAttendanceCaptureSource.DEVICE,
      occurredAt: at(time),
      punchStateRaw: null,
      verificationModeRaw: null,
      deviceId: options.deviceId ?? null,
      workSiteId: options.workSiteId ?? null,
      direction,
      interpretationSource: 'TEST',
      suppressedAsDuplicate: options.duplicate ?? false,
    };
  }

  function modes(
    punches: readonly InterpretedPunch[],
    workMode: EmployeeWorkMode,
    workSiteId: string | null = null,
  ): Map<string, PunchWorkMode> {
    return new Map(
      punches.map((item) => [
        item.rawEventId,
        { rawEventId: item.rawEventId, workMode, workSiteId },
      ]),
    );
  }

  function context(
    overrides: Partial<Parameters<typeof builder.build>[2]> = {},
  ): Parameters<typeof builder.build>[2] {
    return {
      policy: defaultPolicy,
      shiftStartAt: at('08:00'),
      shiftEndAt: at('17:00'),
      authorizedWorkSiteIds: new Set([HQ, LUSAIL]),
      ...overrides,
    };
  }

  // ------------------------------------------------------------ office day

  it('pairs a simple office day into one session', () => {
    const punches = [punch('08:00', 'CHECK_IN'), punch('17:00', 'CHECK_OUT')];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      workMode: EmployeeWorkMode.OFFICE,
      durationMinutes: 540,
      status: AttendanceSessionStatus.CLOSED,
    });
    expect(result.exceptions).toHaveLength(0);
  });

  it('accepts a session that starts on one reader and ends on another', () => {
    // Entering by the main door and leaving by the back one is one ordinary
    // office session. Requiring the same device would manufacture an exception
    // on every multi-entrance site.
    const punches = [
      punch('08:00', 'CHECK_IN', { deviceId: 'main-entrance', workSiteId: HQ }),
      punch('17:00', 'CHECK_OUT', {
        deviceId: 'back-entrance',
        workSiteId: HQ,
      }),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].startDeviceId).toBe('main-entrance');
    expect(result.sessions[0].endDeviceId).toBe('back-entrance');
    expect(result.exceptions).toHaveLength(0);
  });

  // ---------------------------------------------------------------- hybrid

  it('builds two sessions for an office-then-remote day', () => {
    const office = [punch('08:00', 'CHECK_IN'), punch('12:00', 'CHECK_OUT')];
    const remote = [
      punch('14:00', 'CHECK_IN', { source: RawAttendanceCaptureSource.WEB }),
      punch('18:00', 'CHECK_OUT', { source: RawAttendanceCaptureSource.WEB }),
    ];

    const workModes = new Map([
      ...modes(office, EmployeeWorkMode.OFFICE, HQ),
      ...modes(remote, EmployeeWorkMode.REMOTE, null),
    ]);

    const result = builder.build([...office, ...remote], workModes, context());

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]).toMatchObject({
      workMode: EmployeeWorkMode.OFFICE,
      durationMinutes: 240,
    });
    expect(result.sessions[1]).toMatchObject({
      workMode: EmployeeWorkMode.REMOTE,
      durationMinutes: 240,
    });
    // Two closed sessions with a gap between them is not a conflict.
    expect(result.exceptions).toHaveLength(0);
  });

  it('builds two sessions for a remote-then-office day', () => {
    // Office does not have to come first. Assuming it does is how a reverse
    // hybrid day gets mis-paired.
    const remote = [
      punch('09:00', 'CHECK_IN', { source: RawAttendanceCaptureSource.WEB }),
      punch('12:00', 'CHECK_OUT', { source: RawAttendanceCaptureSource.WEB }),
    ];
    const office = [punch('13:30', 'CHECK_IN'), punch('17:30', 'CHECK_OUT')];

    const workModes = new Map([
      ...modes(remote, EmployeeWorkMode.REMOTE, null),
      ...modes(office, EmployeeWorkMode.OFFICE, HQ),
    ]);

    const result = builder.build([...remote, ...office], workModes, context());

    expect(result.sessions.map((session) => session.workMode)).toEqual([
      EmployeeWorkMode.REMOTE,
      EmployeeWorkMode.OFFICE,
    ]);
  });

  it('supports more than two mode transitions in a day', () => {
    const first = [punch('08:00', 'CHECK_IN'), punch('11:00', 'CHECK_OUT')];
    const middle = [
      punch('12:00', 'CHECK_IN', { source: RawAttendanceCaptureSource.WEB }),
      punch('15:00', 'CHECK_OUT', { source: RawAttendanceCaptureSource.WEB }),
    ];
    const last = [punch('16:00', 'CHECK_IN'), punch('18:00', 'CHECK_OUT')];

    const workModes = new Map([
      ...modes(first, EmployeeWorkMode.OFFICE, HQ),
      ...modes(middle, EmployeeWorkMode.REMOTE, null),
      ...modes(last, EmployeeWorkMode.OFFICE, HQ),
    ]);

    const result = builder.build(
      [...first, ...middle, ...last],
      workModes,
      context(),
    );

    expect(result.sessions).toHaveLength(3);
    expect(result.sessions.map((session) => session.workMode)).toEqual([
      EmployeeWorkMode.OFFICE,
      EmployeeWorkMode.REMOTE,
      EmployeeWorkMode.OFFICE,
    ]);
  });

  // -------------------------------------------------------------- overlaps

  it('keeps both facts when a check-in arrives over an open session', () => {
    const punches = [
      punch('08:00', 'CHECK_IN'),
      punch('13:00', 'CHECK_IN', { source: RawAttendanceCaptureSource.WEB }),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    // The earlier session keeps running and is flagged. Silently closing it
    // would invent a checkout time, and inventing a checkout invents paid time.
    expect(
      result.exceptions.some(
        (exception) =>
          exception.type === AttendanceExceptionType.OVERLAPPING_SESSION,
      ),
    ).toBe(true);
    expect(result.sessions).toHaveLength(1);
  });

  it('closes the previous session only when the tenant asked for that', () => {
    const punches = [
      punch('08:00', 'CHECK_IN'),
      punch('13:00', 'CHECK_IN', { source: RawAttendanceCaptureSource.WEB }),
      punch('18:00', 'CHECK_OUT', { source: RawAttendanceCaptureSource.WEB }),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context({
        policy: { ...defaultPolicy, openSessionPolicy: 'AUTO_CLOSE_PREVIOUS' },
      }),
    );

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].endedAt).toEqual(at('13:00'));
    expect(result.sessions[0].status).toBe(AttendanceSessionStatus.ADJUSTED);
    // Still reported: closing it automatically is a decision worth seeing.
    expect(
      result.exceptions.some(
        (exception) =>
          exception.type === AttendanceExceptionType.OVERLAPPING_SESSION,
      ),
    ).toBe(true);
  });

  // -------------------------------------------------------- missing punches

  it('leaves an unterminated session incomplete rather than inventing an end', () => {
    const punches = [punch('08:00', 'CHECK_IN')];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    expect(result.sessions[0].status).toBe(AttendanceSessionStatus.INCOMPLETE);
    expect(result.sessions[0].endedAt).toBeNull();
    // Null, not zero: the duration is unknown, and zero would be a claim.
    expect(result.sessions[0].durationMinutes).toBeNull();
    expect(result.exceptions[0].type).toBe(
      AttendanceExceptionType.MISSING_CHECKOUT,
    );
  });

  it('closes at the shift end only when the tenant opted in', () => {
    const punches = [punch('08:00', 'CHECK_IN')];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context({
        policy: { ...defaultPolicy, autoCloseAtShiftEnd: true },
      }),
    );

    expect(result.sessions[0].endedAt).toEqual(at('17:00'));
    expect(result.sessions[0].status).toBe(AttendanceSessionStatus.ADJUSTED);
    expect(result.sessions[0].durationMinutes).toBe(540);
    // Auto-closing does not hide the fact that a punch was missing.
    expect(result.exceptions[0].type).toBe(
      AttendanceExceptionType.MISSING_CHECKOUT,
    );
  });

  it('never closes a session before it started', () => {
    // A check-in after the shift ended cannot be auto-closed at the shift end,
    // which would give it a negative duration.
    const punches = [punch('19:00', 'CHECK_IN')];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context({ policy: { ...defaultPolicy, autoCloseAtShiftEnd: true } }),
    );

    expect(result.sessions[0].durationMinutes).toBe(0);
    expect(result.sessions[0].endedAt).toEqual(at('19:00'));
  });

  it('reports a check-out with no check-in', () => {
    const punches = [punch('17:00', 'CHECK_OUT')];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    expect(result.sessions).toHaveLength(0);
    expect(result.exceptions[0].type).toBe(
      AttendanceExceptionType.MISSING_CHECKIN,
    );
  });

  // ------------------------------------------------------------ duplicates

  it('records a suppressed duplicate without opening a session', () => {
    const punches = [
      punch('08:00', 'CHECK_IN'),
      punch('08:00', 'CHECK_IN', { duplicate: true }),
      punch('17:00', 'CHECK_OUT'),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    expect(result.sessions).toHaveLength(1);
    expect(result.exceptions[0].type).toBe(
      AttendanceExceptionType.DUPLICATE_SEMANTIC_PUNCH,
    );
  });

  // ----------------------------------------------------------- work sites

  it('flags a punch from a site the employee is not authorised for', () => {
    const punches = [
      punch('08:00', 'CHECK_IN', { workSiteId: 'site-unknown' }),
      punch('17:00', 'CHECK_OUT', { workSiteId: 'site-unknown' }),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, 'site-unknown'),
      context(),
    );

    // Kept as evidence — someone was physically at that terminal — and flagged
    // so a human decides whether it counts.
    expect(result.sessions).toHaveLength(1);
    expect(
      result.exceptions.some(
        (exception) =>
          exception.type === AttendanceExceptionType.UNAUTHORIZED_WORK_SITE,
      ),
    ).toBe(true);
  });

  it('warns when a session crosses authorised work sites', () => {
    const start = punch('08:00', 'CHECK_IN', { workSiteId: HQ });
    const end = punch('17:00', 'CHECK_OUT', { workSiteId: LUSAIL });

    const workModes = new Map<string, PunchWorkMode>([
      [
        start.rawEventId,
        {
          rawEventId: start.rawEventId,
          workMode: EmployeeWorkMode.OFFICE,
          workSiteId: HQ,
        },
      ],
      [
        end.rawEventId,
        {
          rawEventId: end.rawEventId,
          workMode: EmployeeWorkMode.OFFICE,
          workSiteId: LUSAIL,
        },
      ],
    ]);

    const result = builder.build([start, end], workModes, context());

    expect(result.sessions).toHaveLength(1);
    expect(
      result.exceptions.some(
        (exception) =>
          exception.type === AttendanceExceptionType.CROSS_SITE_SESSION,
      ),
    ).toBe(true);
  });

  it('accepts a cross-site session silently when the tenant allows it', () => {
    const start = punch('08:00', 'CHECK_IN', { workSiteId: HQ });
    const end = punch('17:00', 'CHECK_OUT', { workSiteId: LUSAIL });

    const workModes = new Map<string, PunchWorkMode>([
      [
        start.rawEventId,
        {
          rawEventId: start.rawEventId,
          workMode: EmployeeWorkMode.OFFICE,
          workSiteId: HQ,
        },
      ],
      [
        end.rawEventId,
        {
          rawEventId: end.rawEventId,
          workMode: EmployeeWorkMode.OFFICE,
          workSiteId: LUSAIL,
        },
      ],
    ]);

    const result = builder.build(
      [start, end],
      workModes,
      context({ policy: { ...defaultPolicy, crossSitePolicy: 'ALLOWED' } }),
    );

    expect(result.exceptions).toHaveLength(0);
  });

  // ---------------------------------------------------------------- breaks

  it('records an explicit break as its own session', () => {
    const punches = [
      punch('08:00', 'CHECK_IN'),
      punch('12:00', 'BREAK_START'),
      punch('13:00', 'BREAK_END'),
      punch('17:00', 'CHECK_OUT'),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    const breaks = result.sessions.filter((session) => session.isBreak);
    expect(breaks).toHaveLength(1);
    expect(breaks[0].durationMinutes).toBe(60);
  });

  it('does not treat the gap between sessions as a break by default', () => {
    // An employee who checked out at 12:30 and back in at 14:00 may have been
    // at lunch, or travelling between sites on work time. Only policy knows.
    const punches = [
      punch('08:00', 'CHECK_IN'),
      punch('12:00', 'CHECK_OUT'),
      punch('14:00', 'CHECK_IN'),
      punch('18:00', 'CHECK_OUT'),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    expect(result.sessions.filter((session) => session.isBreak)).toHaveLength(
      0,
    );
  });

  it('records the gap as a break when the tenant asked for that', () => {
    const punches = [
      punch('08:00', 'CHECK_IN'),
      punch('12:00', 'CHECK_OUT'),
      punch('14:00', 'CHECK_IN'),
      punch('18:00', 'CHECK_OUT'),
    ];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context({ policy: { ...defaultPolicy, treatGapsAsBreaks: true } }),
    );

    const breaks = result.sessions.filter((session) => session.isBreak);
    expect(breaks).toHaveLength(1);
    expect(breaks[0].durationMinutes).toBe(120);
  });

  // --------------------------------------------------------------- unknown

  it('surfaces an uninterpretable punch instead of ignoring it', () => {
    const punches = [punch('08:00', 'UNKNOWN')];

    const result = builder.build(
      punches,
      modes(punches, EmployeeWorkMode.OFFICE, HQ),
      context(),
    );

    expect(result.sessions).toHaveLength(0);
    expect(result.exceptions[0].type).toBe(
      AttendanceExceptionType.UNKNOWN_PUNCH_DIRECTION,
    );
  });

  // --------------------------------------------------------- determinism

  it('produces the same result however the punches are ordered on input', () => {
    const punches = [
      punch('08:00', 'CHECK_IN'),
      punch('12:00', 'CHECK_OUT'),
      punch('14:00', 'CHECK_IN'),
      punch('18:00', 'CHECK_OUT'),
    ];
    const workModes = modes(punches, EmployeeWorkMode.OFFICE, HQ);

    const ordered = builder.build(punches, workModes, context());
    const shuffled = builder.build(
      [punches[2], punches[0], punches[3], punches[1]],
      workModes,
      context(),
    );

    // Reconciliation must not depend on the order rows came back from a query.
    expect(shuffled.sessions.map((session) => session.startedAt)).toEqual(
      ordered.sessions.map((session) => session.startedAt),
    );
    expect(shuffled.sessions.map((session) => session.durationMinutes)).toEqual(
      ordered.sessions.map((session) => session.durationMinutes),
    );
  });
});
