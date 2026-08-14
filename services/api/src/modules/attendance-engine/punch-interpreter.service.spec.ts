import {
  AttendanceDeviceDirectionMode,
  RawAttendanceCaptureSource,
} from '@prisma/client';

import {
  PunchInterpreterService,
  type DeviceInterpretationConfig,
  type InterpretablePunch,
  type InterpretationContext,
} from './punch-interpreter.service';

/**
 * Reading a terminal's punches without a verified code table.
 *
 * The behaviour worth protecting here is the refusal: on hardware whose vendor
 * codes nobody has confirmed, an UNKNOWN punch that raises an exception is
 * strictly better than a confident wrong one, because a reversed in/out produces
 * a plausible attendance day that is only discovered at payroll.
 */
describe('PunchInterpreterService', () => {
  const interpreter = new PunchInterpreterService();

  const at = (time: string) => new Date(`2026-08-14T${time}.000Z`);

  let sequence = 0;
  beforeEach(() => {
    sequence = 0;
  });

  function punch(
    time: string,
    overrides: Partial<InterpretablePunch> = {},
  ): InterpretablePunch {
    return {
      rawEventId: `event-${sequence++}`,
      captureSource: RawAttendanceCaptureSource.DEVICE,
      occurredAt: at(time),
      punchStateRaw: null,
      verificationModeRaw: null,
      deviceId: 'device-1',
      workSiteId: 'site-hq',
      ...overrides,
    };
  }

  function context(
    overrides: Partial<InterpretationContext> = {},
  ): InterpretationContext {
    return {
      devices: new Map(),
      defaultStrategy: 'ALTERNATING',
      semanticDuplicateWindowSeconds: 30,
      shiftStartAt: at('08:00:00'),
      shiftEndAt: at('17:00:00'),
      ...overrides,
    };
  }

  function device(
    overrides: Partial<DeviceInterpretationConfig> = {},
  ): Map<string, DeviceInterpretationConfig> {
    return new Map([
      [
        'device-1',
        {
          deviceId: 'device-1',
          directionMode: AttendanceDeviceDirectionMode.BOTH,
          punchStateMap: null,
          strategy: 'ALTERNATING',
          ...overrides,
        },
      ],
    ]);
  }

  // ---------------------------------------------------------- alternating

  it('alternates in and out from the first punch of the day', () => {
    const result = interpreter.interpret(
      [
        punch('08:00:00'),
        punch('12:00:00'),
        punch('13:00:00'),
        punch('17:00:00'),
      ],
      context(),
    );

    expect(result.map((item) => item.direction)).toEqual([
      'CHECK_IN',
      'CHECK_OUT',
      'CHECK_IN',
      'CHECK_OUT',
    ]);
  });

  it('sorts punches before interpreting them', () => {
    const result = interpreter.interpret(
      [punch('17:00:00'), punch('08:00:00')],
      context(),
    );

    // The earliest punch is the check-in whatever order the rows arrived in.
    expect(result[0].occurredAt).toEqual(at('08:00:00'));
    expect(result[0].direction).toBe('CHECK_IN');
  });

  // --------------------------------------------------------- device state

  it('refuses to interpret vendor codes without a verified mapping', () => {
    const result = interpreter.interpret(
      [punch('08:00:00', { punchStateRaw: 0 })],
      context({ devices: device({ strategy: 'DEVICE_STATE' }) }),
    );

    // punchStateRaw = 0 is very probably a check-in. "Very probably" is not a
    // basis for attributing paid time, so it stays unknown until an
    // administrator states the mapping.
    expect(result[0].direction).toBe('UNKNOWN');
    expect(result[0].interpretationSource).toBe('DEVICE_STATE_NO_MAPPING');
  });

  it('uses a verified vendor mapping when one is configured', () => {
    const result = interpreter.interpret(
      [
        punch('08:00:00', { punchStateRaw: 0 }),
        punch('17:00:00', { punchStateRaw: 1 }),
      ],
      context({
        devices: device({
          strategy: 'DEVICE_STATE',
          punchStateMap: { '0': 'CHECK_IN', '1': 'CHECK_OUT' },
        }),
      }),
    );

    expect(result.map((item) => item.direction)).toEqual([
      'CHECK_IN',
      'CHECK_OUT',
    ]);
  });

  it('reports a value the configured mapping does not cover', () => {
    const result = interpreter.interpret(
      [punch('08:00:00', { punchStateRaw: 5 })],
      context({
        devices: device({
          strategy: 'DEVICE_STATE',
          punchStateMap: { '0': 'CHECK_IN', '1': 'CHECK_OUT' },
        }),
      }),
    );

    expect(result[0].direction).toBe('UNKNOWN');
    expect(result[0].interpretationSource).toBe('DEVICE_STATE_UNMAPPED_VALUE');
  });

  // ----------------------------------------------------- device direction

  it('reads an entry-only reader as always a check-in', () => {
    const result = interpreter.interpret(
      [punch('08:00:00'), punch('09:00:00')],
      context({
        devices: device({
          strategy: 'DEVICE_DIRECTION',
          directionMode: AttendanceDeviceDirectionMode.ENTRY,
        }),
      }),
    );

    expect(result.map((item) => item.direction)).toEqual([
      'CHECK_IN',
      'CHECK_IN',
    ]);
  });

  it('falls back to alternating for a reader that is not direction-specific', () => {
    const result = interpreter.interpret(
      [punch('08:00:00'), punch('17:00:00')],
      context({
        devices: device({
          strategy: 'DEVICE_DIRECTION',
          directionMode: AttendanceDeviceDirectionMode.BOTH,
        }),
      }),
    );

    expect(result.map((item) => item.direction)).toEqual([
      'CHECK_IN',
      'CHECK_OUT',
    ]);
  });

  // ------------------------------------------------- first in / last out

  it('takes the first and last punch and ignores the rest', () => {
    const result = interpreter.interpret(
      [
        punch('08:00:00'),
        punch('12:00:00'),
        punch('13:00:00'),
        punch('17:00:00'),
      ],
      context({ devices: device({ strategy: 'FIRST_IN_LAST_OUT' }) }),
    );

    expect(result.map((item) => item.direction)).toEqual([
      'CHECK_IN',
      'UNKNOWN',
      'UNKNOWN',
      'CHECK_OUT',
    ]);
  });

  // ----------------------------------------------------------- rule engine

  it('reads a lone punch near the shift end as a departure', () => {
    // Far likelier that someone left after a missed entry punch than that they
    // arrived nine hours late.
    const result = interpreter.interpret(
      [punch('16:55:00')],
      context({ devices: device({ strategy: 'RULE_ENGINE' }) }),
    );

    expect(result[0].direction).toBe('CHECK_OUT');
    expect(result[0].interpretationSource).toBe('RULE_ENGINE_SHIFT_END');
  });

  it('reads a lone punch near the shift start as an arrival', () => {
    const result = interpreter.interpret(
      [punch('08:05:00')],
      context({ devices: device({ strategy: 'RULE_ENGINE' }) }),
    );

    expect(result[0].direction).toBe('CHECK_IN');
  });

  // ------------------------------------------------------------ declared

  it('believes a source that states its own direction', () => {
    const result = interpreter.interpret(
      [
        punch('09:00:00', {
          captureSource: RawAttendanceCaptureSource.WEB,
          deviceId: null,
          declaredDirection: 'CHECK_OUT',
        }),
      ],
      context(),
    );

    // A browser check-out knows it is a check-out. Inferring one would be
    // strictly worse than using what the source already told us.
    expect(result[0].direction).toBe('CHECK_OUT');
    expect(result[0].interpretationSource).toBe('DECLARED');
  });

  // ---------------------------------------------------------- duplicates

  it('suppresses a repeat on the same reader inside the window', () => {
    const result = interpreter.interpret(
      [punch('08:00:00'), punch('08:00:03'), punch('08:00:06')],
      context(),
    );

    expect(result[0].suppressedAsDuplicate).toBe(false);
    expect(result[1].suppressedAsDuplicate).toBe(true);
    expect(result[2].suppressedAsDuplicate).toBe(true);
    // All three are still returned. The raw events exist and remain visible.
    expect(result).toHaveLength(3);
  });

  it('gives a suppressed repeat the direction of the punch it repeats', () => {
    const result = interpreter.interpret(
      [punch('08:00:00'), punch('08:00:03')],
      context(),
    );

    // Otherwise the double-tap would alternate to CHECK_OUT and close a session
    // three seconds after it opened.
    expect(result[1].direction).toBe('CHECK_IN');
  });

  it('does not suppress punches from different readers', () => {
    const result = interpreter.interpret(
      [
        punch('08:00:00', { deviceId: 'device-1' }),
        punch('08:00:03', { deviceId: 'device-2' }),
      ],
      context(),
    );

    // Two people at two doors a second apart is normal.
    expect(result[1].suppressedAsDuplicate).toBe(false);
  });

  it('does not suppress punches beyond the window', () => {
    const result = interpreter.interpret(
      [punch('08:00:00'), punch('08:01:00')],
      context({ semanticDuplicateWindowSeconds: 30 }),
    );

    expect(result[1].suppressedAsDuplicate).toBe(false);
  });

  it('suppresses nothing when the window is switched off', () => {
    const result = interpreter.interpret(
      [punch('08:00:00'), punch('08:00:01')],
      context({ semanticDuplicateWindowSeconds: 0 }),
    );

    expect(result.every((item) => !item.suppressedAsDuplicate)).toBe(true);
  });

  // -------------------------------------------------------------- output

  it('returns one result per input punch', () => {
    const punches = [
      punch('08:00:00'),
      punch('08:00:02'),
      punch('12:00:00'),
      punch('17:00:00'),
    ];

    // Nothing is dropped, so the reconciler can always name the specific event
    // an exception is about.
    expect(interpreter.interpret(punches, context())).toHaveLength(4);
  });
});
