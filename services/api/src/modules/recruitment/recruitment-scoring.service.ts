import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RecruitmentStage } from '@prisma/client';

type NumericWeights = {
  skillMatch: number;
  experienceFit: number;
  educationFit: number;
  locationFit: number;
  availabilityFit: number;
};

export type JobOpeningMatchCriteria = {
  requiredSkills: string[];
  preferredSkills: string[];
  minimumYearsExperience?: number | null;
  educationLevels?: string[];
  allowedWorkModes?: string[];
  allowedLocations?: string[];
  noticePeriodDays?: number | null;
  weights: NumericWeights;
  knockoutRules?: {
    requireAllMandatorySkills?: boolean;
    rejectIfExperienceBelowMinimum?: boolean;
    rejectIfWorkModeMismatch?: boolean;
    rejectIfLocationMismatch?: boolean;
  };
};

type CandidateEducationForScoring = {
  degreeTitle: string;
  fieldOfStudy?: string | null;
};

export type CandidateForScoring = {
  id: string;
  skills: string[];
  totalYearsExperience?: number | null;
  educationRecords: CandidateEducationForScoring[];
  currentCity?: string | null;
  currentCountry?: string | null;
  preferredLocation?: string | null;
  willingToRelocate?: boolean | null;
  noticePeriodDays?: number | null;
  preferredWorkMode?: string | null;
};

export type JobOpeningForScoring = {
  id: string;
  matchCriteria?: Prisma.JsonValue | null;
};

export type ApplicationMatchBreakdown = {
  skillMatch?: {
    score: number;
    matchedSkills: string[];
    missingRequiredSkills?: string[];
    matchedPreferredSkills?: string[];
  };
  experienceFit?: {
    score: number;
    candidateYearsExperience?: number | null;
    minimumYearsExperience?: number | null;
  };
  educationFit?: {
    score: number;
    matchedEducationLevels?: string[];
  };
  locationFit?: {
    score: number;
    candidateLocation?: string | null;
    matchedLocation?: string | null;
  };
  availabilityFit?: {
    score: number;
    candidateNoticePeriodDays?: number | null;
    allowedNoticePeriodDays?: number | null;
  };
  knockoutSummary?: {
    failedRules: string[];
    passed: boolean;
  };
};

export type MatchResult = {
  matchScore: number | null;
  matchBreakdown: ApplicationMatchBreakdown | null;
};

const SCORE_COMPONENT_KEYS = [
  'skillMatch',
  'experienceFit',
  'educationFit',
  'locationFit',
  'availabilityFit',
] as const;

type ScoreComponentKey = (typeof SCORE_COMPONENT_KEYS)[number];

@Injectable()
export class RecruitmentScoringService {
  normalizeMatchCriteria(rawCriteria: unknown): JobOpeningMatchCriteria | null {
    if (!isPlainObject(rawCriteria)) {
      return null;
    }

    const weights = normalizeWeights(rawCriteria.weights);
    if (!weights) {
      return null;
    }

    return {
      requiredSkills: normalizeStringList(rawCriteria.requiredSkills),
      preferredSkills: normalizeStringList(rawCriteria.preferredSkills),
      minimumYearsExperience: normalizeNullableNonNegativeNumber(
        rawCriteria.minimumYearsExperience,
      ),
      educationLevels: normalizeStringList(rawCriteria.educationLevels),
      allowedWorkModes: normalizeStringList(rawCriteria.allowedWorkModes),
      allowedLocations: normalizeStringList(rawCriteria.allowedLocations),
      noticePeriodDays: normalizeNullableNonNegativeInteger(
        rawCriteria.noticePeriodDays,
      ),
      weights,
      knockoutRules: normalizeKnockoutRules(rawCriteria.knockoutRules),
    };
  }

  hasMatchCriteriaConfigured(criteria?: JobOpeningMatchCriteria | null) {
    if (!criteria) {
      return false;
    }

    return (
      criteria.requiredSkills.length > 0 ||
      criteria.preferredSkills.length > 0 ||
      (criteria.minimumYearsExperience !== null &&
        criteria.minimumYearsExperience !== undefined) ||
      (criteria.educationLevels?.length ?? 0) > 0 ||
      (criteria.allowedWorkModes?.length ?? 0) > 0 ||
      (criteria.allowedLocations?.length ?? 0) > 0 ||
      (criteria.noticePeriodDays !== null &&
        criteria.noticePeriodDays !== undefined)
    );
  }

  validateMatchCriteria(criteria?: JobOpeningMatchCriteria | null) {
    if (!criteria) {
      return;
    }

    for (const key of SCORE_COMPONENT_KEYS) {
      const value = criteria.weights[key];
      if (value < 0 || value > 100) {
        throw new BadRequestException(
          `matchCriteria.weights.${key} must be between 0 and 100.`,
        );
      }
    }

    if (!this.hasMatchCriteriaConfigured(criteria)) {
      return;
    }

    const totalWeight = SCORE_COMPONENT_KEYS.reduce(
      (total, key) => total + criteria.weights[key],
      0,
    );

    if (Math.abs(totalWeight - 100) > 0.001) {
      throw new BadRequestException(
        `matchCriteria.weights must total 100 when scoring is configured. Current total: ${totalWeight}.`,
      );
    }
  }

  calculateMatch(
    candidate: CandidateForScoring,
    jobOpening: JobOpeningForScoring,
  ): MatchResult {
    const criteria = this.normalizeMatchCriteria(jobOpening.matchCriteria);
    if (!criteria || !this.hasMatchCriteriaConfigured(criteria)) {
      return {
        matchScore: null,
        matchBreakdown: null,
      };
    }

    const breakdown: ApplicationMatchBreakdown = {};
    const componentScores = new Map<ScoreComponentKey, number>();

    const candidateSkills = normalizeStringList(candidate.skills);
    const requiredSkills = normalizeStringList(criteria.requiredSkills);
    const preferredSkills = normalizeStringList(criteria.preferredSkills);
    const requiredSkillsSet = new Set(requiredSkills.map(normalizeToken));
    const preferredSkillsSet = new Set(preferredSkills.map(normalizeToken));
    const candidateSkillsSet = new Set(
      candidateSkills.map(normalizeSkillToken),
    );

    let requiredSkillMatchCount = 0;
    const matchedRequiredSkills: string[] = [];
    const missingRequiredSkills: string[] = [];

    for (const skill of requiredSkills) {
      if (candidateSkillsSet.has(normalizeSkillToken(skill))) {
        requiredSkillMatchCount += 1;
        matchedRequiredSkills.push(skill);
      } else {
        missingRequiredSkills.push(skill);
      }
    }

    const matchedPreferredSkills = preferredSkills.filter((skill) =>
      candidateSkillsSet.has(normalizeSkillToken(skill)),
    );

    if (requiredSkills.length > 0 || preferredSkills.length > 0) {
      const requiredRatio =
        requiredSkills.length > 0
          ? requiredSkillMatchCount / requiredSkills.length
          : 1;
      const preferredRatio =
        preferredSkills.length > 0
          ? matchedPreferredSkills.length / preferredSkills.length
          : 0;

      const skillScore =
        requiredSkills.length > 0
          ? Math.round(requiredRatio * 80 + preferredRatio * 20)
          : Math.round(preferredRatio * 100);

      componentScores.set('skillMatch', clampScore(skillScore));
      breakdown.skillMatch = {
        score: clampScore(skillScore),
        matchedSkills: deduplicateStrings([
          ...matchedRequiredSkills,
          ...matchedPreferredSkills,
        ]),
        missingRequiredSkills,
        matchedPreferredSkills,
      };
    }

    if (
      criteria.minimumYearsExperience !== null &&
      criteria.minimumYearsExperience !== undefined
    ) {
      const candidateYears =
        candidate.totalYearsExperience === null ||
        candidate.totalYearsExperience === undefined
          ? null
          : Number(candidate.totalYearsExperience);
      const minimumYears = criteria.minimumYearsExperience;

      const experienceScore =
        candidateYears === null
          ? 0
          : candidateYears >= minimumYears
            ? 100
            : clampScore(
                Math.round(
                  (candidateYears / Math.max(minimumYears, 0.1)) * 100,
                ),
              );

      componentScores.set('experienceFit', experienceScore);
      breakdown.experienceFit = {
        score: experienceScore,
        candidateYearsExperience: candidateYears,
        minimumYearsExperience: minimumYears,
      };
    }

    if ((criteria.educationLevels?.length ?? 0) > 0) {
      const candidateLevels = extractCandidateEducationLevels(
        candidate.educationRecords,
      );
      const configuredLevels = normalizeStringList(
        criteria.educationLevels ?? [],
      );

      const matchedEducationLevels = configuredLevels.filter((level) =>
        candidateLevels.has(normalizeToken(level)),
      );

      const educationScore =
        configuredLevels.length > 0
          ? clampScore(
              Math.round(
                (matchedEducationLevels.length / configuredLevels.length) * 100,
              ),
            )
          : 0;

      componentScores.set('educationFit', educationScore);
      breakdown.educationFit = {
        score: educationScore,
        matchedEducationLevels,
      };
    }

    const allowedLocations = normalizeStringList(
      criteria.allowedLocations ?? [],
    );
    const allowedWorkModes = normalizeStringList(
      criteria.allowedWorkModes ?? [],
    );
    const candidateLocation = [
      candidate.preferredLocation,
      candidate.currentCity,
      candidate.currentCountry,
    ]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      )
      .join(', ');

    const locationConfigured =
      allowedLocations.length > 0 || allowedWorkModes.length > 0;
    let locationMatchedValue: string | null = null;
    let locationScore = 100;

    if (locationConfigured) {
      let locationMatchRatio = 1;
      if (allowedLocations.length > 0) {
        const normalizedCandidateLocation = normalizeToken(candidateLocation);
        const matchedLocation = allowedLocations.find((location) =>
          normalizedCandidateLocation.includes(normalizeToken(location)),
        );
        locationMatchedValue = matchedLocation ?? null;
        locationMatchRatio = matchedLocation
          ? 1
          : candidate.willingToRelocate
            ? 0.5
            : 0;
      }

      let workModeMatchRatio = 1;
      if (allowedWorkModes.length > 0) {
        const candidateMode = normalizeToken(candidate.preferredWorkMode ?? '');
        workModeMatchRatio =
          candidateMode.length > 0 &&
          allowedWorkModes.some(
            (mode) => normalizeToken(mode) === candidateMode,
          )
            ? 1
            : 0;
      }

      const locationSubCriteriaCount =
        (allowedLocations.length > 0 ? 1 : 0) +
        (allowedWorkModes.length > 0 ? 1 : 0);

      const rawLocationScore =
        locationSubCriteriaCount > 0
          ? ((locationMatchRatio + workModeMatchRatio) /
              locationSubCriteriaCount) *
            100
          : 100;

      locationScore = clampScore(Math.round(rawLocationScore));
      componentScores.set('locationFit', locationScore);
      breakdown.locationFit = {
        score: locationScore,
        candidateLocation: candidateLocation || null,
        matchedLocation: locationMatchedValue,
      };
    }

    if (
      criteria.noticePeriodDays !== null &&
      criteria.noticePeriodDays !== undefined
    ) {
      const allowedNotice = criteria.noticePeriodDays;
      const candidateNotice =
        candidate.noticePeriodDays === null ||
        candidate.noticePeriodDays === undefined
          ? null
          : Number(candidate.noticePeriodDays);

      const availabilityScore =
        candidateNotice === null
          ? 0
          : candidateNotice <= allowedNotice
            ? 100
            : clampScore(
                Math.max(0, 100 - (candidateNotice - allowedNotice) * 3),
              );

      componentScores.set('availabilityFit', availabilityScore);
      breakdown.availabilityFit = {
        score: availabilityScore,
        candidateNoticePeriodDays: candidateNotice,
        allowedNoticePeriodDays: allowedNotice,
      };
    }

    const failedRules: string[] = [];
    if (
      criteria.knockoutRules?.requireAllMandatorySkills &&
      requiredSkillsSet.size > 0 &&
      missingRequiredSkills.length > 0
    ) {
      failedRules.push('Missing required skills');
    }

    if (
      criteria.knockoutRules?.rejectIfExperienceBelowMinimum &&
      criteria.minimumYearsExperience !== null &&
      criteria.minimumYearsExperience !== undefined
    ) {
      const candidateYears = candidate.totalYearsExperience ?? null;
      if (
        candidateYears === null ||
        Number(candidateYears) < Number(criteria.minimumYearsExperience)
      ) {
        failedRules.push('Experience below minimum requirement');
      }
    }

    if (
      criteria.knockoutRules?.rejectIfWorkModeMismatch &&
      allowedWorkModes.length > 0
    ) {
      const candidateMode = normalizeToken(candidate.preferredWorkMode ?? '');
      const matches = allowedWorkModes.some(
        (mode) => normalizeToken(mode) === candidateMode,
      );
      if (!matches) {
        failedRules.push('Work mode mismatch');
      }
    }

    if (
      criteria.knockoutRules?.rejectIfLocationMismatch &&
      allowedLocations.length > 0
    ) {
      const normalizedCandidateLocation = normalizeToken(candidateLocation);
      const matches = allowedLocations.some((location) =>
        normalizedCandidateLocation.includes(normalizeToken(location)),
      );
      if (!matches) {
        failedRules.push('Location mismatch');
      }
    }

    const knockoutPassed = failedRules.length === 0;
    breakdown.knockoutSummary = {
      failedRules,
      passed: knockoutPassed,
    };

    const activeWeightedKeys = SCORE_COMPONENT_KEYS.filter((key) =>
      componentScores.has(key),
    );

    if (activeWeightedKeys.length === 0) {
      return {
        matchScore: null,
        matchBreakdown: null,
      };
    }

    const totalActiveWeight = activeWeightedKeys.reduce(
      (total, key) => total + criteria.weights[key],
      0,
    );

    if (totalActiveWeight <= 0) {
      return {
        matchScore: null,
        matchBreakdown: null,
      };
    }

    const weightedScore = activeWeightedKeys.reduce((total, key) => {
      const criterionScore = componentScores.get(key) ?? 0;
      const weight = criteria.weights[key];
      return total + criterionScore * weight;
    }, 0);

    const calculatedScore = Math.round(weightedScore / totalActiveWeight);

    // Hard knockout failures force score to zero while still returning the full breakdown.
    const finalScore = knockoutPassed ? calculatedScore : 0;

    return {
      matchScore: clampScore(finalScore),
      matchBreakdown: breakdown,
    };
  }
}

function normalizeWeights(value: unknown): NumericWeights | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const skillMatch = normalizeNumber(value.skillMatch, 0);
  const experienceFit = normalizeNumber(value.experienceFit, 0);
  const educationFit = normalizeNumber(value.educationFit, 0);
  const locationFit = normalizeNumber(value.locationFit, 0);
  const availabilityFit = normalizeNumber(value.availabilityFit, 0);

  if (
    [
      skillMatch,
      experienceFit,
      educationFit,
      locationFit,
      availabilityFit,
    ].some((weight) => weight < 0 || weight > 100)
  ) {
    return null;
  }

  return {
    skillMatch,
    experienceFit,
    educationFit,
    locationFit,
    availabilityFit,
  };
}

function normalizeKnockoutRules(value: unknown) {
  if (!isPlainObject(value)) {
    return undefined;
  }

  return {
    requireAllMandatorySkills: Boolean(value.requireAllMandatorySkills),
    rejectIfExperienceBelowMinimum: Boolean(
      value.rejectIfExperienceBelowMinimum,
    ),
    rejectIfWorkModeMismatch: Boolean(value.rejectIfWorkModeMismatch),
    rejectIfLocationMismatch: Boolean(value.rejectIfLocationMismatch),
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return deduplicateStrings(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  );
}

function deduplicateStrings(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeNullableNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeNullableNonNegativeInteger(value: unknown) {
  const parsed = normalizeNullableNonNegativeNumber(value);
  if (parsed === null) {
    return null;
  }
  return Number.isInteger(parsed) ? parsed : Math.round(parsed);
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSkillToken(value: string) {
  const token = normalizeToken(value)
    .replace(/[().]/g, '')
    .replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    nextjs: 'next.js',
    'next js': 'next.js',
    nodejs: 'node.js',
    'node js': 'node.js',
    typescript: 'ts',
    javascript: 'js',
    reactjs: 'react',
    'react js': 'react',
    postgres: 'postgresql',
  };
  return aliases[token] ?? token;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function extractCandidateEducationLevels(
  educationRecords: CandidateEducationForScoring[],
) {
  const levels = new Set<string>();

  for (const record of educationRecords) {
    const combined =
      `${record.degreeTitle ?? ''} ${record.fieldOfStudy ?? ''}`.toLowerCase();

    if (!combined.trim()) {
      continue;
    }

    if (combined.includes('phd') || combined.includes('doctor')) {
      levels.add(normalizeToken('PhD'));
    }
    if (combined.includes('mphil') || combined.includes('m.phil')) {
      levels.add(normalizeToken('MPhil'));
    }
    if (
      combined.includes('master') ||
      combined.includes('msc') ||
      combined.includes('mba')
    ) {
      levels.add(normalizeToken("Master's"));
    }
    if (
      combined.includes('bachelor') ||
      combined.includes('bsc') ||
      combined.includes('bs ')
    ) {
      levels.add(normalizeToken("Bachelor's"));
    }
    if (combined.includes('diploma')) {
      levels.add(normalizeToken('Diploma'));
    }
    if (combined.includes('high school') || combined.includes('intermediate')) {
      levels.add(normalizeToken('High School'));
    }
  }

  return levels;
}
