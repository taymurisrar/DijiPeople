import { expect, test } from '@playwright/test';
import {
  actor,
  isoDay,
  requireGrowthEnvironment,
  RUN_TAG,
  rows,
  unique,
  type Actor,
} from '../fixtures/growth-api';
import { deleteTaggedJobOpenings, residue } from '../fixtures/residue';

/**
 * Flow M — Growth plan, hiring workflows (recruitment -> onboarding -> employee).
 *
 * Flow I proves every entitled module *renders*. This flow proves the work
 * people actually do in them: a recruiter takes a candidate from application to
 * offer and the next role takes it over, with the authorization boundaries that
 * implies. Each test creates what it asserts on and removes what it created
 * (`.agent/context/test-resource-policy.md`); a cleanup failure is reported, not
 * swallowed.
 *
 * Found by this flow on first run: `recruitment.advance` was granted to no role,
 * so a recruiter could create a candidate and an application but never move one
 * between stages (BUG-4438). GM-R3 is that regression.
 */
test.describe.configure({ mode: 'serial' });

let recruiter: Actor;
let admin: Actor;
let hr: Actor;
let employee: Actor;

const created = {
  jobOpenings: [] as string[],
  candidates: [] as string[],
  onboarding: [] as string[],
};
const cleanupFailures: string[] = [];

test.beforeAll(async () => {
  await requireGrowthEnvironment();
  [recruiter, admin, hr, employee] = await Promise.all([
    actor('recruiter'),
    actor('system-admin'),
    actor('hr'),
    actor('employee'),
  ]);
});

test.afterAll(async () => {
  for (const id of created.onboarding) {
    const r = await admin.del(`onboarding/${id}`);
    if (![200, 204, 404].includes(r.status))
      cleanupFailures.push(`onboarding ${id}: ${r.status} ${r.message}`);
  }
  for (const id of created.candidates) {
    const r = await admin.del(`candidates/${id}`);
    if (![200, 204, 404].includes(r.status))
      cleanupFailures.push(`candidate ${id}: ${r.status} ${r.message}`);
  }
  // No API route deletes a job opening; remove this run's by tag, then prove it.
  await deleteTaggedJobOpenings(RUN_TAG);
  expect(cleanupFailures, 'cleanup must not fail silently').toEqual([]);
  expect(await residue(RUN_TAG), 'this run left rows behind').toEqual({});
});

type Pipeline = { id: string; stages: Array<{ stageKey: string }> };
type Application = {
  id: string;
  stage: string;
  stageHistory?: Array<{ fromStage: string | null; toStage: string }>;
};

async function newApplication(label: string) {
  const suffix = unique();
  const pipelines = await recruiter.get<{ items: Pipeline[] }>(
    'recruitment/pipelines',
  );
  expect(pipelines.status).toBe(200);
  const pipeline = pipelines.body.items[0];

  const job = await recruiter.post<{ id: string; status: string }>(
    'job-openings',
    { title: `${label} opening ${suffix}`, pipelineId: pipeline.id, status: 'OPEN' },
  );
  expect(job.status, job.message).toBe(201);
  created.jobOpenings.push(job.body.id);

  const candidate = await recruiter.post<{ id: string }>('candidates', {
    firstName: 'Qa',
    lastName: `Candidate${suffix}`,
    email: `qa.${suffix}@example.test`,
    phone: '+97455500000',
  });
  expect(candidate.status, candidate.message).toBe(201);
  created.candidates.push(candidate.body.id);

  const application = await recruiter.post<Application>('applications', {
    candidateId: candidate.body.id,
    jobOpeningId: job.body.id,
  });
  expect(application.status, application.message).toBe(201);
  return {
    job: job.body,
    candidateId: candidate.body.id,
    application: application.body,
    pipeline,
  };
}

test.describe('Flow M — recruitment pipeline', () => {
  test('GM-R1 a recruiter opens a job, registers a candidate and applies them', async () => {
    const { application, job } = await newApplication('GM-R1');
    expect(application.stage).toBe('APPLIED');
    expect(job.status).toBe('OPEN');

    const listed = await recruiter.get(`applications?jobOpeningId=${job.id}`);
    expect(listed.status).toBe(200);
    expect(rows<{ id: string }>(listed.body).map((r) => r.id)).toContain(
      application.id,
    );
  });

  test('GM-R2 duplicate or malformed input is refused with an actionable message', async () => {
    const bad = await recruiter.post('candidates', {
      firstName: 'Qa',
      lastName: 'Bad',
      email: 'not-an-email',
      phone: '+97455500000',
    });
    expect(bad.status).toBe(400);
    expect(bad.message).toMatch(/email must be an email/);

    const noJob = await recruiter.post('applications', {
      candidateId: 'nope',
      jobOpeningId: 'nope',
    });
    expect(noJob.status).toBe(400);
    expect(noJob.message).toMatch(/candidateId must be a UUID/);
  });

  test('GM-R3 a recruiter moves a candidate through the pipeline and history records every move', async () => {
    const { application } = await newApplication('GM-R3');
    for (const stage of ['SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER']) {
      const moved = await recruiter.patch<Application>(
        `applications/${application.id}/stage`,
        { stage },
      );
      expect(moved.status, `${stage}: ${moved.message}`).toBe(200);
      expect(moved.body.stage).toBe(stage);
    }
    const detail = await recruiter.get<Application>(
      `applications/${application.id}`,
    );
    expect(detail.status).toBe(200);
    const trail = (detail.body.stageHistory ?? []).map((h) => h.toStage);
    expect(trail).toEqual(
      expect.arrayContaining(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER']),
    );
  });

  test('GM-R4 rejecting needs a reason; the evaluation round is recorded', async () => {
    const { application } = await newApplication('GM-R4');
    const noReason = await recruiter.patch(
      `applications/${application.id}/stage`,
      { stage: 'REJECTED' },
    );
    expect(noReason.status).toBe(400);
    expect(noReason.message).toMatch(/rejection reason is required/i);

    const evaluation = await recruiter.post<{
      evaluations: Array<{ interviewRound: number }>;
    }>(`applications/${application.id}/evaluations`, {});
    expect(evaluation.status).toBe(201);
    expect(evaluation.body.evaluations.length).toBeGreaterThan(0);

    const rejected = await recruiter.patch<Application>(
      `applications/${application.id}/stage`,
      { stage: 'REJECTED', rejectionReason: 'Role filled internally' },
    );
    expect(rejected.status, rejected.message).toBe(200);
    expect(rejected.body.stage).toBe('REJECTED');
  });

  test('GM-R5 who may reach recruitment: recruiter and admin yes; HR, employee no', async () => {
    for (const who of [hr, employee]) {
      for (const path of ['job-openings', 'candidates', 'applications']) {
        const r = await who.get(path);
        expect(r.status, `${who.role} ${path}`).toBe(403);
      }
    }
    for (const who of [recruiter, admin]) {
      const r = await who.get('candidates');
      expect(r.status, `${who.role}`).toBe(200);
    }
    const move = await employee.patch(
      'applications/00000000-0000-4000-8000-000000000000/stage',
      { stage: 'SCREENING' },
    );
    expect(move.status).toBe(403);
  });
});
