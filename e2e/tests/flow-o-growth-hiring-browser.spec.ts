import { expect, test, type Locator, type Page } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import {
  actor,
  requireGrowthEnvironment,
  RUN_TAG,
  rows,
  unique,
  type Actor,
} from '../fixtures/growth-api';
import { deleteTaggedJobOpenings, residue } from '../fixtures/residue';
import { resolveTenant, type TenantTarget } from '../fixtures/web-session';

/**
 * Flow O — the hiring journey, driven through the browser.
 *
 * Flow M proves the same hand-offs through the API. This is the version a
 * prospect watches: a recruiter signs in, opens a job, registers a candidate,
 * applies them, moves them through the pipeline to HIRED, starts onboarding, and
 * an administrator turns the onboarding into an employee. Every mutation below
 * is a click or a keystroke; the API is used only to *check* what the screen
 * did, never to do it. (Flow M's rule in reverse: API for state, UI for action.)
 *
 * Sign-ins: one per role per run (the login throttle is 20 per 10 minutes).
 */
test.describe.configure({ mode: 'serial' });

let tenant: TenantTarget;
let recruiterPage: Page;
let adminPage: Page;
let recruiter: Actor;
let admin: Actor;

const suffix = unique();
const jobTitle = `Browser Recruiter ${suffix}`;
const lastName = `Browser${suffix}`;

let jobId = '';
let candidateId = '';
let applicationId = '';
let onboardingId = '';

async function signIn(
  page: Page,
  email: string,
  password: string,
  slug: string,
) {
  await page.goto(`${BASE_URLS.web}/login?tenant=${slug}`);
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
}

async function go(page: Page, path: string) {
  await page.goto(`${BASE_URLS.web}${path}?tenant=${tenant.slug}`, {
    waitUntil: 'domcontentloaded',
  });
  // A form typed into before the app hydrates is reset by hydration, which
  // shows up as "First Name is required" over a field that was just filled.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** Fill, and keep filling until the value sticks: survives a late hydration. */
async function fillStable(field: Locator, value: string) {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

/** Open a runtime lookup (a combobox) and choose the first option matching `option`. */
async function pickLookup(page: Page, label: RegExp, option: RegExp) {
  const field = page.getByRole('combobox', { name: label }).first();
  await expect(async () => {
    await field.click();
    // The record's Form switcher is a <select> whose hidden <option>s also match
    // a bare role query, so only the visible options of the open popup count.
    await page.locator('[role="option"]:visible').filter({ hasText: option }).first().click({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

test.beforeAll(async ({ browser }) => {
  await requireGrowthEnvironment();
  const found = await resolveTenant();
  if (!found) throw new Error('no ACTIVE tenant to sign in to');
  tenant = found;
  [recruiter, admin] = await Promise.all([actor('recruiter'), actor('system-admin')]);
  const domain = process.env.E2E_TENANT_USER_DOMAIN || 'dijipeople.local';
  const password = process.env.E2E_TENANT_USER_PASSWORD!;
  recruiterPage = await (await browser.newContext()).newPage();
  adminPage = await (await browser.newContext()).newPage();
  await signIn(recruiterPage, `recruiter@${domain}`, password, tenant.slug);
  await signIn(adminPage, `system-admin@${domain}`, password, tenant.slug);
});

test.afterAll(async () => {
  const failures: string[] = [];
  if (onboardingId) {
    const r = await admin.del(`onboarding/${onboardingId}`);
    if (![200, 204, 404].includes(r.status)) failures.push(`onboarding: ${r.status} ${r.message}`);
  }
  // The draft employee exists from "Start onboarding" onward, so remove it by
  // tag whether or not the conversion step ran.
  const found = await admin.get(`employees?search=${encodeURIComponent(suffix)}`);
  for (const e of rows<{ id: string; lastName?: string }>(found.body).filter((x) => x.lastName === lastName)) {
    const r = await admin.del(`employees/${e.id}`);
    if (![200, 204, 404].includes(r.status)) failures.push(`employee: ${r.status} ${r.message}`);
  }
  if (candidateId) {
    const r = await admin.del(`candidates/${candidateId}`);
    if (![200, 204, 404].includes(r.status)) failures.push(`candidate: ${r.status} ${r.message}`);
  }
  await deleteTaggedJobOpenings(RUN_TAG);
  expect(failures, 'cleanup must not fail silently').toEqual([]);
  expect(await residue(RUN_TAG), 'this run left rows behind').toEqual({});
});

test.describe('Flow O — recruiter to employee, in the browser', () => {
  test('GO-1 the recruiter creates a job opening through the form', async () => {
    await go(recruiterPage, '/recruitment/jobs/new');
    await fillStable(recruiterPage.getByLabel(/job title/i), jobTitle);
    await recruiterPage.getByRole('button', { name: /^save$/i }).click();
    await expect
      .poll(async () => {
        const list = await recruiter.get(`job-openings?search=${encodeURIComponent(suffix)}`);
        return rows<{ id: string; title: string }>(list.body).find((j) => j.title === jobTitle)?.id ?? '';
      }, { timeout: 30_000 })
      .not.toBe('');
    const list = await recruiter.get(`job-openings?search=${encodeURIComponent(suffix)}`);
    jobId = rows<{ id: string; title: string }>(list.body).find((j) => j.title === jobTitle)!.id;
  });

  test('GO-2 the recruiter registers a candidate through the form', async () => {
    await go(recruiterPage, '/recruitment/candidates/new');
    await fillStable(recruiterPage.getByLabel(/first name/i), 'Browser');
    await fillStable(recruiterPage.getByLabel(/last name/i), lastName);
    await fillStable(recruiterPage.getByLabel(/primary email/i), `browser.${suffix}@example.test`);
    await fillStable(recruiterPage.getByLabel(/^phone/i), '+97455500001');
    await recruiterPage.getByRole('button', { name: /^save$/i }).click();
    await expect
      .poll(async () => {
        const list = await recruiter.get(`candidates?search=${encodeURIComponent(suffix)}`);
        return rows<{ id: string; lastName: string }>(list.body).find((c) => c.lastName === lastName)?.id ?? '';
      }, { timeout: 30_000 })
      .not.toBe('');
    const list = await recruiter.get(`candidates?search=${encodeURIComponent(suffix)}`);
    candidateId = rows<{ id: string; lastName: string }>(list.body).find((c) => c.lastName === lastName)!.id;
  });

  test('GO-3 the recruiter applies the candidate to the job from the Applications screen', async () => {
    await go(recruiterPage, '/recruitment/applications');
    await recruiterPage.getByLabel(/^candidate/i).selectOption({ value: candidateId });
    await recruiterPage.getByLabel(/job opening/i).selectOption({ value: jobId });
    await recruiterPage.getByRole('button', { name: /add|create|apply|submit/i }).first().click();
    await expect
      .poll(async () => {
        const list = await recruiter.get(`applications?jobOpeningId=${jobId}`);
        return rows<{ id: string; candidateId: string }>(list.body).find((a) => a.candidateId === candidateId)?.id ?? '';
      }, { timeout: 30_000 })
      .not.toBe('');
    const list = await recruiter.get(`applications?jobOpeningId=${jobId}`);
    applicationId = rows<{ id: string; candidateId: string }>(list.body).find((a) => a.candidateId === candidateId)!.id;
  });

  test('GO-4 the recruiter moves the application to HIRED one stage at a time', async () => {
    await go(recruiterPage, `/recruitment/applications/${applicationId}`);
    for (const stage of ['SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED']) {
      await recruiterPage.getByLabel(/move to stage/i).selectOption(stage);
      await recruiterPage.getByRole('button', { name: /move|update|save/i }).first().click();
      await expect
        .poll(async () => {
          const r = await recruiter.get<{ stage: string }>(`applications/${applicationId}`);
          return r.body.stage;
        }, { timeout: 30_000, message: `stage ${stage}` })
        .toBe(stage);
    }
  });

  test('GO-5 onboarding is started from the hired application', async () => {
    await go(recruiterPage, `/recruitment/applications/${applicationId}`);
    await recruiterPage.getByRole('button', { name: /start onboarding/i }).click();
    await expect
      .poll(async () => {
        const r = await admin.get(`onboarding?candidateId=${candidateId}`);
        return rows<{ id: string; candidateId?: string }>(r.body)[0]?.id ?? '';
      }, { timeout: 30_000 })
      .not.toBe('');
    const r = await admin.get(`onboarding?candidateId=${candidateId}`);
    onboardingId = rows<{ id: string }>(r.body)[0].id;
  });

  test('GO-6 the administrator completes every onboarding task through the screen', async () => {
    await go(adminPage, `/onboarding/${onboardingId}`);
    const detail = await admin.get<{ tasks?: Array<{ status: string }> }>(`onboarding/${onboardingId}`);
    const total = detail.body.tasks?.length ?? 0;
    expect(total, 'the template created a checklist').toBeGreaterThan(0);
    // Each task is a group collapsed behind its own Review button; the status
    // control is the product's combobox. Work through them as a person would:
    // open one, choose Completed, save it.
    for (let i = 1; i <= total; i += 1) {
      const task = adminPage.getByRole('group').filter({ hasText: new RegExp(`^Task ${i}(?![0-9])`) });
      // The task is a <details>; its <summary> carries the "Review" affordance.
      await task.locator('summary').click();
      await task.getByRole('combobox', { name: /task status/i }).click();
      await adminPage.getByRole('option', { name: /^completed$/i }).click();
      await task.getByRole('button', { name: /save task/i }).click();
      await expect
        .poll(async () => {
          const r = await admin.get<{ tasks?: Array<{ status: string }> }>(`onboarding/${onboardingId}`);
          return (r.body.tasks ?? []).filter((t) => t.status === 'COMPLETED').length;
        }, { timeout: 30_000, message: `task ${i} of ${total}` })
        .toBeGreaterThanOrEqual(i);
    }
  });

  test('GO-7 the administrator assigns department, designation and reporting manager on the employee record, which unblocks conversion', async () => {
    // BUG-4447: this step used to be made through the API because the lookup
    // editor was thought to be undrivable. It is a standard combobox with a
    // labelled listbox; what was missing was the approach (see pickLookup).
    await go(adminPage, `/onboarding/${onboardingId}`);
    await adminPage.getByRole('link', { name: /open employee record/i }).click();
    await expect(adminPage).toHaveURL(new RegExp('/employees/[0-9a-f-]{36}'), { timeout: 30_000 });
    const draftId = adminPage.url().split('/employees/')[1].split(/[/?#]/)[0];
    await adminPage.waitForLoadState('networkidle').catch(() => undefined);

    // The record opens read-only: the lookups are plain text until Edit is
    // pressed, and only then do they become comboboxes.
    await adminPage.getByRole('button', { name: 'Edit', exact: true }).click();
    await pickLookup(adminPage, /^department/i, /.+/);
    await pickLookup(adminPage, /^designation/i, /.+/);
    await pickLookup(adminPage, /reporting manager/i, /.+/);
    // The form also requires an emergency contact before it will save, so a
    // person doing this fills it in too.
    await fillStable(adminPage.getByLabel(/^emergency contact name/i), `Contact ${suffix}`);
    await pickLookup(adminPage, /emergency contact relation/i, /.+/);
    await fillStable(adminPage.getByLabel(/^emergency contact phone/i), '+97455500002');
    await adminPage.getByRole('button', { name: /^save$/i }).click();

    type Draft = { departmentId?: string | null; designationId?: string | null; reportingManagerEmployeeId?: string | null; managerEmployeeId?: string | null };
    await expect
      .poll(async () => {
        const r = await admin.get<Draft>(`employees/${draftId}`);
        const d = r.body;
        return Boolean(d.departmentId && d.designationId && (d.reportingManagerEmployeeId ?? d.managerEmployeeId));
      }, { timeout: 30_000, message: 'department, designation and manager were saved from the screen' })
      .toBe(true);
  });

  test('GO-8 the onboarding converts to an employee and the employee exists', async () => {
    await go(adminPage, `/onboarding/${onboardingId}`);
    await expect(adminPage.getByText(/blocking conversion/i)).toHaveCount(0, { timeout: 30_000 });
    // BUG-4446: this button was not rendered while the linked employee was a
    // draft profile, which is the state "Start onboarding" always creates. There
    // is deliberately no API fallback here: if the button is missing, fail.
    await adminPage.getByRole('button', { name: /convert to employee/i }).click();
    await expect
      .poll(async () => {
        const r = await admin.get<{ status?: string }>(`onboarding/${onboardingId}`);
        return r.body.status ?? '';
      }, { timeout: 30_000 })
      .toMatch(/CONVERTED|COMPLETED/);
    const found = await admin.get(`employees?search=${encodeURIComponent(suffix)}`);
    const employee = rows<{ id: string; lastName?: string }>(found.body).find((e) => e.lastName === lastName);
    expect(employee, 'the converted employee is listed').toBeTruthy();
  });
});
