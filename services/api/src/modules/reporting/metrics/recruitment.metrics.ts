import { JobOpeningStatus, RecruitmentStage } from '@prisma/client';
import {
  RECRUITMENT_APPLICATIONS_SOURCE,
  RECRUITMENT_CANDIDATES_SOURCE,
  RECRUITMENT_OPENINGS_SOURCE,
  RECRUITMENT_STAGE_TRANSITIONS_SOURCE,
} from '../semantic/data-sources';
import { isGroupable } from '../semantic/semantic.types';
import type {
  ReportDataSource,
  ReportMetricDefinition,
} from '../semantic/semantic.types';
import { REQUISITION_COUNT_CAVEAT } from '../semantic/caveats';

/**
 * Recruitment metrics.
 *
 * **Stage order is pipeline configuration, never enum order.** Two metrics here
 * — the funnel and time-to-hire — are meaningless without knowing which stage
 * comes before which, and `RecruitmentStage` is a fixed vocabulary that says
 * nothing about a tenant's process. The order lives in
 * `RecruitmentPipelineStage.sortOrder`, exits are flagged by `isTerminal`, and
 * a tenant may omit stages entirely. None of that is reachable as a relation
 * from the sources these metrics sit on — an application reaches its pipeline
 * through `jobOpening.pipeline`, and stages hang off the pipeline — so the
 * query planner has to load it. Saying so on the metric is the only way that
 * requirement survives contact with whoever implements the chart.
 *
 * **A hire is an application reaching HIRED**, not a candidate whose status says
 * HIRED. A candidate has one status across every opening they applied to; an
 * application is the thing that was actually filled.
 */

const dimensionsOf = (source: ReportDataSource): string[] =>
  source.fields.filter(isGroupable).map((field) => field.key);

const OPENING_DIMENSIONS = dimensionsOf(RECRUITMENT_OPENINGS_SOURCE);
const CANDIDATE_DIMENSIONS = dimensionsOf(RECRUITMENT_CANDIDATES_SOURCE);
const APPLICATION_DIMENSIONS = dimensionsOf(RECRUITMENT_APPLICATIONS_SOURCE);
const TRANSITION_DIMENSIONS = dimensionsOf(
  RECRUITMENT_STAGE_TRANSITIONS_SOURCE,
);

export const RECRUITMENT_METRICS: ReportMetricDefinition[] = [
  {
    key: 'recruitment.open_requisitions',
    label: 'Open requisitions',
    description: 'Job openings whose status is OPEN right now.',
    dataSourceKey: 'recruitment_openings',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'recruitment_openings.status': { eq: JobOpeningStatus.OPEN },
      },
    },
    supportedDimensions: OPENING_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'Current status. JobOpening has no opened-at or closed-at column, so how long a requisition has been open is not computable and neither is a count of openings closed in a period.',
      REQUISITION_COUNT_CAVEAT,
      'ON_HOLD openings are excluded; they are neither open nor closed.',
    ],
  },
  {
    key: 'recruitment.candidates',
    label: 'Candidates',
    description:
      'People in the recruitment pipeline, counted once each regardless of how many openings they applied to.',
    dataSourceKey: 'recruitment_candidates',
    valueType: 'integer',
    calculation: { kind: 'count' },
    supportedDimensions: CANDIDATE_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'A period selects candidates by when their record was created, which is when they were first captured rather than when they applied.',
      'Duplicate people are possible. Deduplication runs on identity values and is not guaranteed, so two records for one person count twice.',
    ],
  },
  {
    key: 'recruitment.applications',
    label: 'Applications',
    description:
      'Applications raised in the period. One candidate against one opening; a candidate applying to three openings is three applications.',
    dataSourceKey: 'recruitment_applications',
    valueType: 'integer',
    calculation: { kind: 'count' },
    supportedDimensions: APPLICATION_DIMENSIONS,
    comparable: true,
    direction: 'neutral',
    caveats: [
      'Break this down by the Current stage dimension for an applications-by-stage view. Because stage is the CURRENT stage, that view shows where applications stand now — it is not a funnel and the stages do not sum to a progression.',
    ],
  },
  {
    key: 'recruitment.hires',
    label: 'Hires',
    description:
      'Applications whose current stage is HIRED. An application reaching HIRED is one hire.',
    dataSourceKey: 'recruitment_applications',
    valueType: 'integer',
    calculation: {
      kind: 'filtered_count',
      where: {
        'recruitment_applications.stage': { eq: RecruitmentStage.HIRED },
      },
    },
    supportedDimensions: APPLICATION_DIMENSIONS,
    comparable: true,
    direction: 'up_is_good',
    caveats: [
      'Counted against the period the application was RAISED, because applied-at is this source’s date field. Hires in a quarter therefore means "applications raised in that quarter that have since been hired", which is not the same as "people who started that quarter". Use Joiners for the latter.',
      'Current stage only. An application that reached HIRED and was later moved back leaves no trace here.',
    ],
  },
  {
    key: 'recruitment.funnel_conversion',
    label: 'Funnel conversion',
    description:
      'Share of applications entering each pipeline stage that go on to reach the next one, computed from recorded stage transitions.',
    dataSourceKey: 'recruitment_stage_transitions',
    valueType: 'percent',
    format: 'percent',
    calculation: {
      kind: 'derived',
      dependsOn: [
        'recruitment_stage_transitions.from_stage',
        'recruitment_stage_transitions.to_stage',
      ],
    },
    supportedDimensions: TRANSITION_DIMENSIONS,
    comparable: true,
    direction: 'up_is_good',
    caveats: [
      'Stage order must be read from RecruitmentPipelineStage.sortOrder for the pipeline in question, and terminal stages must be treated as exits. Ordering by the RecruitmentStage enum instead is correct only for a default pipeline and silently wrong for every customised one.',
      'Backward moves are real rows. A pipeline that allows them can produce a transition from OFFER back to INTERVIEW, which inflates entries into the earlier stage.',
      'Applications older than the pipeline’s stage history appear to jump straight to their current stage and contribute no transitions.',
      'Openings on different pipelines cannot be pooled into one funnel: their stages are different sets in different orders.',
    ],
  },
  {
    key: 'recruitment.time_to_hire_days',
    label: 'Time to hire (days)',
    description:
      'Mean days from an application being raised to its transition into HIRED, across applications hired in the period.',
    dataSourceKey: 'recruitment_stage_transitions',
    valueType: 'number',
    calculation: {
      kind: 'derived',
      dependsOn: [
        'recruitment_stage_transitions.to_stage',
        'recruitment_stage_transitions.changed_at',
        'recruitment_stage_transitions.applied_at',
      ],
    },
    supportedDimensions: TRANSITION_DIMENSIONS,
    comparable: true,
    direction: 'down_is_good',
    caveats: [
      'Measured from application to the HIRED transition. It is not time-to-fill, which would run from when the requisition opened, and JobOpening has no opened-at column to measure that from.',
      'Only hires with a recorded HIRED transition are included. An application hired before stage history began contributes nothing, so early figures are drawn from a smaller and more recent sample than they appear.',
      'If an application was moved into HIRED more than once, the transitions are several and the intended reading is the first.',
      'Survivorship: only successful applications are measured, so a slow process that rejects late looks fast here.',
    ],
  },
  {
    key: 'recruitment.source_effectiveness',
    label: 'Source effectiveness',
    description:
      'Share of candidates from each source whose current status is HIRED. Broken down by the candidate source channel.',
    dataSourceKey: 'recruitment_candidates',
    valueType: 'percent',
    format: 'percent',
    calculation: {
      kind: 'derived',
      dependsOn: [
        'recruitment_candidates.source',
        'recruitment_candidates.current_status',
      ],
    },
    supportedDimensions: ['recruitment_candidates.source'],
    comparable: true,
    direction: 'up_is_good',
    caveats: [
      'Candidate source is uncontrolled free text. "LinkedIn", "linkedin" and "LI referral" are three groups, nulls are a fourth, and nothing validates the column — so this ranks what recruiters typed, not channels.',
      'Computed on candidate current status rather than on applications, because Application carries the candidate id and not the source column, so applications cannot be grouped by source. A candidate who applied to several openings still counts once.',
      'Small sources produce extreme percentages. One hire from one candidate is a hundred percent.',
    ],
  },
];
