import type { DlpRuleConfig } from "../types";

/**
 * The foreground application at a moment in time, as the activity tracker
 * already reports it. Either field may be null when the OS does not tell us.
 */
export type ForegroundApp = {
  name: string | null;
  path: string | null;
};

/**
 * A rule that fired: a copy was made from a sensitive-source application and,
 * within the trigger window, one of that rule's channel applications came to the
 * foreground. This is the record-only outcome — the caller decides what to do
 * with it (capture a screenshot, raise an alert); the evaluator never acts.
 */
export type DlpTrigger = {
  ruleId: string;
  ruleName: string;
  action: DlpRuleConfig["action"];
  sourceApp: string;
  channelApp: string;
};

type ArmedCopy = {
  ruleId: string;
  ruleName: string;
  action: DlpRuleConfig["action"];
  sourceApp: string;
  atMs: number;
};

/**
 * Detects the exfiltration shape "copied from a sensitive app, then a channel
 * app came forward". It is deliberately pure and clock-injected — every method
 * takes the current time in milliseconds from the caller — so the ACTIVE/IDLE
 * threshold-style tests can drive it deterministically without a real clock.
 *
 * The evaluator holds no OS handles and reads nothing itself. The session
 * manager feeds it two facts: when the clipboard changed and what was in front
 * at the time (`noteClipboardCopy`), and when the foreground changed
 * (`evaluateForeground`). The evaluator only decides whether those two facts,
 * together and in order, match a rule.
 */
export class DlpRuleEvaluator {
  private rules: DlpRuleConfig[] = [];
  private triggerWindowMs = 30_000;
  private armed: ArmedCopy[] = [];

  configure(rules: DlpRuleConfig[], triggerWindowSeconds: number): void {
    this.rules = rules.filter((rule) => rule.enabled);
    this.triggerWindowMs = Math.max(1, triggerWindowSeconds) * 1000;
    // Dropping a rule mid-session must not leave an armed copy that can still
    // fire against a rule the tenant just disabled.
    const liveIds = new Set(this.rules.map((rule) => rule.id));
    this.armed = this.armed.filter((copy) => liveIds.has(copy.ruleId));
  }

  /**
   * A clipboard change happened while `foreground` was in front. Arms every rule
   * whose source patterns match the foreground app, so a later switch to that
   * rule's channel app fires. A copy from an app no rule cares about arms
   * nothing and is forgotten immediately.
   */
  noteClipboardCopy(foreground: ForegroundApp, nowMs: number): void {
    for (const rule of this.rules) {
      const sourceApp = this.matchLabel(rule.sourceAppPatterns, foreground);
      if (sourceApp === null) {
        continue;
      }

      this.armed.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        sourceApp,
        atMs: nowMs,
      });
    }

    this.expire(nowMs);
  }

  /**
   * The foreground app changed to `foreground`. Returns one trigger per armed
   * copy whose rule's channel patterns match — and consumes those armed copies,
   * so a single copy-then-paste fires once, not on every subsequent focus of the
   * channel app. Expired arms are discarded first.
   */
  evaluateForeground(foreground: ForegroundApp, nowMs: number): DlpTrigger[] {
    this.expire(nowMs);

    const triggers: DlpTrigger[] = [];
    const survivors: ArmedCopy[] = [];

    for (const copy of this.armed) {
      const rule = this.rules.find((candidate) => candidate.id === copy.ruleId);
      const channelApp = rule
        ? this.matchLabel(rule.channelAppPatterns, foreground)
        : null;

      if (rule && channelApp !== null) {
        triggers.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          sourceApp: copy.sourceApp,
          channelApp,
        });
        // Consumed: this armed copy has produced its trigger.
        continue;
      }

      survivors.push(copy);
    }

    this.armed = survivors;
    return triggers;
  }

  /** Visible for tests: how many copies are currently armed. */
  armedCount(): number {
    return this.armed.length;
  }

  private expire(nowMs: number): void {
    const cutoff = nowMs - this.triggerWindowMs;
    this.armed = this.armed.filter((copy) => copy.atMs >= cutoff);
  }

  /**
   * Returns the human label of the first matching pattern, or null. A pattern
   * matches case-insensitively as a substring of either the app name or its
   * path, so `"whatsapp"` matches both `WhatsApp` and
   * `C:\\Program Files\\WhatsApp\\WhatsApp.exe`. The label returned is the app
   * name when present, else the path — never the pattern, so the record shows
   * what was actually in front.
   */
  private matchLabel(
    patterns: string[],
    foreground: ForegroundApp,
  ): string | null {
    const haystacks = [foreground.name, foreground.path]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase());

    if (haystacks.length === 0) {
      return null;
    }

    const matched = patterns.some((pattern) => {
      const needle = pattern.trim().toLowerCase();
      return needle.length > 0 && haystacks.some((h) => h.includes(needle));
    });

    if (!matched) {
      return null;
    }

    return foreground.name ?? foreground.path;
  }
}
