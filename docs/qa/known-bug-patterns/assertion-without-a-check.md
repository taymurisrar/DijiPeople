# Bug pattern — `assertion-without-a-check`

**A comment states that something is enforced mechanically. Nothing enforces it.
The convention holds anyway — which is what makes this dangerous, because there
is no failing test to find and the sentence tells every reviewer not to look.**

## Pattern

A rule is established, usually after an incident. The author writes it down in
the place a future reader will meet it, and describes the guard they intend to
add:

```ts
/**
 * Spread this into the outbound `fetch()` headers of every route handler that
 * proxies to the API. `forwarded-headers.invariant.test.ts` fails the build if
 * a handler forgets — the guarantee is mechanical rather than a convention,
 * because this same convention has already been broken three times.
 */
```

The guard is never added. Nothing notices, because nothing validates that a
named test file exists, and the rule was being followed at the time.

The comment now does a check's job without a check behind it. It is worse than
saying nothing: a reviewer who reads *"the guarantee is mechanical"* has been
told, in the codebase's own voice, that this class of mistake cannot reach
production — so they stop looking, correctly, at a claim that is false.

## Why it happens in DijiPeople

This repository has an unusually strong house style of explanatory comments, and
that is a genuine asset — most of them carry a *why* nothing else records. The
same habit makes this failure available: writing the paragraph and writing the
test are two separate acts, the paragraph is the satisfying one, and only the
test has a mechanism that complains when it is missing.

It is the same shape as [`declared-but-unwired-step`](declared-but-unwired-step.md)
and [`defined-but-unwired-permission`](defined-but-unwired-permission.md), moved
up one level: there, a declaration exists with nothing behind it. Here, a
*description of a declaration* exists with nothing behind it.

## Example architecture area

`apps/landing/lib/forwarded-headers.ts`, and its byte-identical copies in
`apps/web` and `apps/admin`, each carried the comment above. No file named
`forwarded-headers.invariant.test.ts` existed in any workspace.

The rule it described is real and load-bearing. A route handler runs
server-side, so a handler that forgets `forwardedClientHeaders(request)` makes
the API attribute every visitor on earth to one egress IP —
`PublicRateLimitGuard` keys on exactly that address, so one omission converts a
per-visitor budget into a switch any single visitor can flip for everybody. That
is [[BUG-0032]], already filed once after it happened.

**All 24 direct-API handlers were forwarding correctly when this was found.**
That is the whole difficulty of the pattern. There was no red test, no incident,
no smell — only a sentence that was not true, discovered by going to run the
check it named.

## Detection checklist

- A comment naming a **specific file** that is supposed to enforce something.
  Go and open it.
- Phrases that promise a mechanism: *"fails the build"*, *"the guarantee is
  mechanical"*, *"enforced by"*, *"cannot happen because"*, *"validated in CI"*.
- A rule described as previously broken *n* times, with no test dated after the
  last occurrence.
- A named CI job, npm script or workflow step that does not appear in
  `package.json` or `.github/workflows/`.
- A test file whose name suggests an invariant but whose assertions only check
  that a file *mentions* a symbol — the inert-guard sibling of this pattern, and
  the reason every new invariant here must be mutation-tested.

The cheapest sweep is mechanical:

```bash
grep -rn "invariant\.\(test\|spec\)\.ts" --include=*.ts apps services \
  | grep -v "/.next/" \
  | while read -r hit; do
      name=$(sed -E 's/.*([a-z0-9-]+\.invariant\.(test|spec)\.ts).*/\1/' <<<"$hit")
      find . -name "$name" -not -path "*/node_modules/*" | grep -q . \
        || echo "MISSING: $name  ($hit)"
    done
```

## Required regression test

The check the comment promised, plus one assertion the comment would not have
thought to make: **a minimum count of the things being checked.**

```ts
it('finds the handlers it is supposed to be checking', () => {
  expect(directApiCallers.length).toBeGreaterThanOrEqual(9);
});
```

Without it, a scan that stops matching — a renamed helper, a moved directory, a
changed import style — goes green forever and reproduces the original defect in
a new costume. A guard that finds nothing to guard is not passing; it is inert.

Then mutation-test it. Delete the behaviour from one real call site, watch the
run go red and name the file, and put the numbers in the record. `10 passed`
becoming `1 failed / 9 passed` is evidence. "The test passes" is not.

## Agent responsible

Whichever agent writes the comment. There is no separate owner, and that is the
point: the failure is committing to a mechanism in prose and stopping there.

## Reviewer check

**Treat a comment that names an enforcing artefact as a claim to verify, not as
context to read.** Open the file. If it does not exist, that is a finding at the
severity of whatever it claimed to protect — not a documentation nit.

Where the guarantee turns out to be a convention, either build the check or
change the sentence to say *convention*. Both are honest. Leaving it is not.

## QA check

When a campaign relies on an existing guard to scope its work — "the forwarding
is covered, skip it" — confirm the guard runs. A guard named in a comment, in an
`AGENTS.md`, or in a previous QA run's Known Limitations is a claim about the
repository and can be checked in seconds.

## Related records

[[BUG-0081]] — the record this pattern was extracted from, including the audit
showing all 24 handlers were compliant at detection.
[[BUG-0032]] — the incident the convention was written after.
[[BUG-0075]] — the neighbouring case where the invariant *did* exist and was
inert: it passed by matching an import line, so deleting the guard it protected
changed nothing.

Regression coverage is REG-076; the reusable scenario is QA-LANDING-010.

## Prevention rule

**Write the check before the comment that describes it, and name the file only
once it exists.** If the check is genuinely not worth building, say "convention"
and let the next reader keep their scepticism — an accurate weak claim is worth
more than a confident false one.
