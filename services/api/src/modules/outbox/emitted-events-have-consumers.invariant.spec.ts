import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * INVARIANT — every domain event that is emitted has somebody listening.
 *
 * This is BUG-0078, and it is the check whose absence let that defect ship
 * inside a work package that closed `DONE` with `QA_STATUS = PASS`.
 *
 * `PROVISIONING_REQUESTED` was emitted by `openOnboarding` from the day WP-07
 * landed. Nothing consumed it. The event was written to the outbox, delivered,
 * and dropped — and no test failed, because from the dispatcher's side an event
 * with no registered consumer is a *settled delivery*, not an error. That is
 * correct behaviour for a generic dispatcher and exactly why the gap is
 * invisible from inside it: the outbox reported every event PROCESSED while the
 * platform's headline feature had never once run.
 *
 * The check reads sources rather than booting Nest, for the same reason
 * `public-write-rate-limit.invariant.spec.ts` does: booting tests the wiring of
 * the handlers that exist, and this must constrain the event somebody emits next
 * month.
 */
describe('every emitted domain event has a consumer', () => {
  const MODULES_DIR = join(__dirname, '..');

  /**
   * Event types that are deliberately emitted with nobody listening, each with
   * the reason it is safe.
   *
   * An allowlist rather than a silent skip. An event recorded purely as history
   * is a legitimate design — but it should be a decision somebody wrote down,
   * not the accident BUG-0078 was.
   */
  const ALLOWLIST = new Map<string, string>([
    [
      'CHECKOUT_STARTED',
      'A funnel record. Nothing should act when somebody begins a checkout; the ' +
        'acting happens at PAYMENT_CONFIRMED, which has a consumer.',
    ],
    [
      'CUSTOMER_CREATED',
      'A record that a prospect now exists. Acting on it would mean contacting ' +
        'somebody who has only filled in a form, which is a sales decision and ' +
        'not a platform one.',
    ],
    [
      'PLAN_CHANGE_REQUESTED',
      'The request is recorded; PLAN_CHANGE_APPLIED is the moment worth ' +
        'announcing and it is in the notification catalog. A decrease can sit ' +
        'pending until renewal, so notifying on request would announce a change ' +
        'that has not happened.',
    ],
    [
      'SEAT_CHANGE_REQUESTED',
      'Same asymmetry as PLAN_CHANGE_REQUESTED, and for the same reason: a ' +
        'decrease takes effect at renewal, so the request is not yet a fact ' +
        'about the customer bill.',
    ],
    [
      'SEAT_CHANGE_APPLIED',
      'Believed to be an oversight rather than a decision — PLAN_CHANGE_APPLIED ' +
        'is in the notification catalog and this is not. Recorded as ITEM-0061 ' +
        'rather than silently accepted; this entry states what is true today, ' +
        'not that it is right.',
    ],
    [
      'SUBSCRIPTION_TERMINATED',
      'SUBSCRIPTION_ACTIVATED is in the notification catalog and this is not, so ' +
        'the platform announces a start and not an end. Same disposition as ' +
        'SEAT_CHANGE_APPLIED — see ITEM-0061.',
    ],
  ]);

  function collectSources(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        found.push(...collectSources(fullPath));
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      // Specs emit events to set up their own fixtures; that is not production
      // intent and must not be read as either an emission or a consumption.
      if (entry.endsWith('.spec.ts')) continue;
      found.push(fullPath);
    }
    return found;
  }

  const sources = collectSources(MODULES_DIR).map((path) => ({
    path,
    text: readFileSync(path, 'utf8'),
  }));

  it('finds sources to check', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  /**
   * A file that declares subscriptions rather than performing emissions.
   *
   * `LifecycleNotificationHandler` builds its `handles` array by mapping over
   * `platform-lifecycle-notifications.catalog.ts`, so its subscriptions are not
   * a literal this check can read from the handler itself. The catalog uses the
   * same `eventType:` key an emission does — which is why the two are told apart
   * by file rather than by token. Reading a catalog as an emitter would have
   * this check reporting events as unhandled *because* they are handled.
   */
  const isSubscriptionCatalog = (path: string) =>
    /notifications\.catalog\.ts$/.test(path);

  /** `eventType: DomainEventType.X` outside a subscription catalog. */
  function emittedTypes() {
    const found = new Set<string>();
    for (const { path, text } of sources) {
      if (isSubscriptionCatalog(path)) continue;
      for (const match of text.matchAll(
        /eventType:\s*DomainEventType\.([A-Z0-9_]+)/g,
      )) {
        found.add(match[1]);
      }
    }
    return found;
  }

  /** A literal `handles = [...]`, or any event named by a subscription catalog. */
  function handledTypes() {
    const found = new Set<string>();
    for (const { path, text } of sources) {
      if (isSubscriptionCatalog(path)) {
        for (const match of text.matchAll(/DomainEventType\.([A-Z0-9_]+)/g)) {
          found.add(match[1]);
        }
        continue;
      }
      for (const match of text.matchAll(
        /readonly handles\s*=\s*\[([^\]]*)\]/g,
      )) {
        for (const inner of match[1].matchAll(
          /DomainEventType\.([A-Z0-9_]+)/g,
        )) {
          found.add(inner[1]);
        }
      }
    }
    return found;
  }

  it('finds emitted events to check', () => {
    // Guards against the walk silently finding nothing and passing.
    expect(emittedTypes().size).toBeGreaterThan(2);
  });

  it('finds registered consumers to check', () => {
    expect(handledTypes().size).toBeGreaterThan(0);
  });

  it('leaves no emitted event unhandled', () => {
    const handled = handledTypes();
    const unhandled = [...emittedTypes()]
      .filter((type) => !handled.has(type))
      .filter((type) => !ALLOWLIST.has(type))
      .sort();

    expect(unhandled).toEqual([]);
  });

  it('does not allowlist an event that is no longer emitted', () => {
    // A stale exemption looks deliberate while protecting nothing.
    const emitted = emittedTypes();
    for (const allowlisted of ALLOWLIST.keys()) {
      expect(emitted.has(allowlisted)).toBe(true);
    }
  });

  it('states a reason for every allowlisted event', () => {
    for (const [type, reason] of ALLOWLIST) {
      expect(`${type}:${reason}`.length).toBeGreaterThan(type.length + 40);
    }
  });
});
