import { Injectable } from '@nestjs/common';
import {
  AttendanceDeviceDirectionMode,
  RawAttendanceCaptureSource,
} from '@prisma/client';

/**
 * Turns raw source events into an attendance intent.
 *
 * PROVIDER-NEUTRAL BY CONSTRUCTION. Nothing here knows what a ZKTeco is. A
 * connector reports raw vendor integers whose meaning is device- and
 * firmware-specific; this stage applies the interpretation an administrator
 * CONFIGURED for that device, and refuses to guess when none is configured.
 *
 * The temptation this file exists to resist is mapping `punchStateRaw = 0` to
 * "check in" because it usually is. On the reference K50 those codes were never
 * verified against the firmware, and a wrong guess does not fail loudly — it
 * produces a plausible attendance day with the in and out reversed, which is
 * discovered at payroll. An UNKNOWN punch that raises an exception is strictly
 * better than a confident wrong one.
 */

export type PunchDirection =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'BREAK_START'
  | 'BREAK_END'
  | 'UNKNOWN';

/** What the interpreter is given about one event. Deliberately minimal. */
export interface InterpretablePunch {
  rawEventId: string;
  captureSource: RawAttendanceCaptureSource;
  /** The instant this punch happened, already resolved to UTC. */
  occurredAt: Date;
  /** Vendor punch state, uninterpreted. */
  punchStateRaw: number | null;
  /** Vendor verification mode, uninterpreted. */
  verificationModeRaw: number | null;
  deviceId: string | null;
  workSiteId: string | null;
  /**
   * The direction a non-device source stated explicitly. Web and mobile
   * check-in/out know which they are, so they never need inference.
   */
  declaredDirection?: PunchDirection | null;
}

export interface DeviceInterpretationConfig {
  deviceId: string;
  /** Existing per-device configuration. BOTH means the device reports neither. */
  directionMode: AttendanceDeviceDirectionMode;
  /**
   * Explicit, administrator-verified mapping of vendor punch-state integers.
   * Absent means the codes have NOT been verified for this firmware and must
   * not be interpreted.
   */
  punchStateMap?: Record<string, PunchDirection> | null;
  strategy: DirectionStrategy;
}

/**
 * How to decide what a device punch means.
 *
 * Every strategy other than DEVICE_STATE works without trusting vendor codes,
 * which is what makes the engine usable on hardware whose codes nobody has
 * confirmed.
 */
export type DirectionStrategy =
  /** Trust the vendor punch-state integer, via a configured mapping. */
  | 'DEVICE_STATE'
  /** Trust the device's configured direction: an entry-only or exit-only reader. */
  | 'DEVICE_DIRECTION'
  /** Alternate in/out from the first punch of the day. */
  | 'ALTERNATING'
  /** First punch of the day is in, last is out; everything between is ignored. */
  | 'FIRST_IN_LAST_OUT'
  /** Alternating, but nudged by the shift window when the sequence is ambiguous. */
  | 'RULE_ENGINE';

export interface InterpretedPunch extends InterpretablePunch {
  direction: PunchDirection;
  /** Which rule decided, so an operator can see why a punch was read that way. */
  interpretationSource: string;
  /** Suppressed as a near-duplicate of the preceding punch. Never deleted. */
  suppressedAsDuplicate: boolean;
}

export interface InterpretationContext {
  /** Per-device configuration, keyed by device id. */
  devices: Map<string, DeviceInterpretationConfig>;
  /** Default for devices with no configuration of their own. */
  defaultStrategy: DirectionStrategy;
  /**
   * Two punches by the same person on the same device within this many seconds
   * are the same intent — someone pressed twice, or the reader double-fired.
   */
  semanticDuplicateWindowSeconds: number;
  /** Scheduled shift window, when one is known. Used only by RULE_ENGINE. */
  shiftStartAt?: Date | null;
  shiftEndAt?: Date | null;
}

@Injectable()
export class PunchInterpreterService {
  /**
   * Interprets a day's punches in order.
   *
   * Returns one output per input: nothing is dropped. A punch that cannot be
   * read becomes UNKNOWN and a near-duplicate is flagged rather than removed, so
   * the count of evidence always matches the count of raw events and the
   * reconciler can raise an exception naming the specific event.
   */
  interpret(
    punches: readonly InterpretablePunch[],
    context: InterpretationContext,
  ): InterpretedPunch[] {
    const ordered = [...punches].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );

    const results: InterpretedPunch[] = [];
    /** The last direction actually accepted, for alternating strategies. */
    let lastAcceptedDirection: PunchDirection | null = null;

    for (const punch of ordered) {
      const duplicateOf = this.findSemanticDuplicate(
        punch,
        results,
        context.semanticDuplicateWindowSeconds,
      );

      if (duplicateOf) {
        // Kept, flagged, and given the direction of the punch it repeats, so a
        // double-tap cannot open a second session. The raw event is untouched.
        results.push({
          ...punch,
          direction: duplicateOf.direction,
          interpretationSource: 'SEMANTIC_DUPLICATE',
          suppressedAsDuplicate: true,
        });
        continue;
      }

      // A source that knows its own direction is believed. Web and mobile
      // check-in/out are explicit user actions, not inferences.
      if (punch.declaredDirection && punch.declaredDirection !== 'UNKNOWN') {
        results.push({
          ...punch,
          direction: punch.declaredDirection,
          interpretationSource: 'DECLARED',
          suppressedAsDuplicate: false,
        });
        lastAcceptedDirection = punch.declaredDirection;
        continue;
      }

      const device = punch.deviceId
        ? context.devices.get(punch.deviceId)
        : undefined;
      const strategy = device?.strategy ?? context.defaultStrategy;

      const resolved = this.applyStrategy(
        punch,
        device,
        strategy,
        lastAcceptedDirection,
        context,
      );

      results.push({
        ...punch,
        direction: resolved.direction,
        interpretationSource: resolved.source,
        suppressedAsDuplicate: false,
      });

      if (resolved.direction !== 'UNKNOWN') {
        lastAcceptedDirection = resolved.direction;
      }
    }

    return this.applyFirstInLastOut(results, context);
  }

  private applyStrategy(
    punch: InterpretablePunch,
    device: DeviceInterpretationConfig | undefined,
    strategy: DirectionStrategy,
    lastAcceptedDirection: PunchDirection | null,
    context: InterpretationContext,
  ): { direction: PunchDirection; source: string } {
    switch (strategy) {
      case 'DEVICE_STATE': {
        // Only with an explicit, administrator-verified mapping. Without one the
        // integer stays uninterpreted rather than being guessed at — the whole
        // point of keeping vendor codes raw.
        const mapped =
          punch.punchStateRaw !== null && device?.punchStateMap
            ? device.punchStateMap[String(punch.punchStateRaw)]
            : undefined;

        if (mapped) {
          return { direction: mapped, source: 'DEVICE_STATE_MAP' };
        }

        return {
          direction: 'UNKNOWN',
          source: device?.punchStateMap
            ? 'DEVICE_STATE_UNMAPPED_VALUE'
            : 'DEVICE_STATE_NO_MAPPING',
        };
      }

      case 'DEVICE_DIRECTION': {
        // A reader physically mounted on the way in only ever means one thing.
        switch (device?.directionMode) {
          case AttendanceDeviceDirectionMode.ENTRY:
            return { direction: 'CHECK_IN', source: 'DEVICE_DIRECTION' };
          case AttendanceDeviceDirectionMode.EXIT:
            return { direction: 'CHECK_OUT', source: 'DEVICE_DIRECTION' };
          default:
            // BOTH means the device is not direction-specific, so this strategy
            // has nothing to say. Fall through to alternation.
            return this.alternate(
              lastAcceptedDirection,
              'DEVICE_DIRECTION_BOTH',
            );
        }
      }

      case 'ALTERNATING':
        return this.alternate(lastAcceptedDirection, 'ALTERNATING');

      case 'FIRST_IN_LAST_OUT':
        // Decided in a second pass once the whole day is known.
        return { direction: 'UNKNOWN', source: 'FIRST_IN_LAST_OUT_PENDING' };

      case 'RULE_ENGINE': {
        const alternated = this.alternate(lastAcceptedDirection, 'RULE_ENGINE');

        // The shift window only breaks a tie at the very start of the day: a
        // first punch near the shift end is far more likely to be someone
        // leaving after a missed entry punch than someone arriving.
        if (lastAcceptedDirection === null && context.shiftEndAt) {
          const toShiftEnd = Math.abs(
            punch.occurredAt.getTime() - context.shiftEndAt.getTime(),
          );
          const toShiftStart = context.shiftStartAt
            ? Math.abs(
                punch.occurredAt.getTime() - context.shiftStartAt.getTime(),
              )
            : Number.POSITIVE_INFINITY;

          if (toShiftEnd < toShiftStart) {
            return { direction: 'CHECK_OUT', source: 'RULE_ENGINE_SHIFT_END' };
          }
        }

        return alternated;
      }

      default:
        return { direction: 'UNKNOWN', source: 'NO_STRATEGY' };
    }
  }

  private alternate(
    lastAcceptedDirection: PunchDirection | null,
    source: string,
  ): { direction: PunchDirection; source: string } {
    // Breaks alternate too: a BREAK_START is followed by a BREAK_END, and the
    // work session resumes after it rather than starting again.
    switch (lastAcceptedDirection) {
      case 'CHECK_IN':
        return { direction: 'CHECK_OUT', source };
      case 'BREAK_START':
        return { direction: 'BREAK_END', source };
      case null:
      case 'CHECK_OUT':
      case 'BREAK_END':
      default:
        return { direction: 'CHECK_IN', source };
    }
  }

  /**
   * Resolves FIRST_IN_LAST_OUT once the whole day is visible.
   *
   * Deliberately does not discard the punches in between: they stay as evidence
   * with an UNKNOWN direction, so a device configured this way still shows every
   * punch it recorded on the day detail.
   */
  private applyFirstInLastOut(
    results: InterpretedPunch[],
    context: InterpretationContext,
  ): InterpretedPunch[] {
    const pending = results.filter(
      (punch) => punch.interpretationSource === 'FIRST_IN_LAST_OUT_PENDING',
    );

    if (pending.length === 0) return results;

    const first = pending[0];
    const last = pending[pending.length - 1];

    for (const punch of pending) {
      if (punch === first) {
        punch.direction = 'CHECK_IN';
        punch.interpretationSource = 'FIRST_IN_LAST_OUT_FIRST';
      } else if (punch === last) {
        punch.direction = 'CHECK_OUT';
        punch.interpretationSource = 'FIRST_IN_LAST_OUT_LAST';
      } else {
        // A single punch day under this strategy is an unpaired check-in, which
        // the session builder turns into a MISSING_CHECKOUT exception.
        punch.direction = 'UNKNOWN';
        punch.interpretationSource = 'FIRST_IN_LAST_OUT_IGNORED';
      }
    }

    void context;
    return results;
  }

  /**
   * Finds a preceding punch this one merely repeats.
   *
   * Scoped to the same device (or the same non-device source): two people
   * punching different readers a second apart is normal, one reader firing twice
   * is not. The cloud fingerprint already removes byte-identical events; this
   * catches the semantically identical ones a second apart that would otherwise
   * open and immediately close a session.
   */
  private findSemanticDuplicate(
    punch: InterpretablePunch,
    previous: readonly InterpretedPunch[],
    windowSeconds: number,
  ): InterpretedPunch | null {
    if (windowSeconds <= 0) return null;

    const windowMs = windowSeconds * 1000;

    for (let index = previous.length - 1; index >= 0; index--) {
      const candidate = previous[index];
      const gap = punch.occurredAt.getTime() - candidate.occurredAt.getTime();

      if (gap > windowMs) break;
      if (candidate.deviceId !== punch.deviceId) continue;
      if (candidate.captureSource !== punch.captureSource) continue;

      return candidate;
    }

    return null;
  }
}
