import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentParsingStatus } from '@prisma/client';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

export type ParsingJobSeed = {
  tenantId: string;
  documentReferenceId: string;
  candidateId?: string;
  parserKey?: string;
  requestedById: string;
};

export type ParsingResultSeed = {
  fileName: string;
  candidate: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    email: string;
    phone: string;
    source?: string | null;
  };
};

type UploadedResumeFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type ResumeFileType = 'pdf' | 'docx';

export type ResumeParseDraft = {
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  email: string;
  emails: string[];
  phone: string;
  phones: string[];
  linkedInUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  city: string;
  stateProvince: string;
  country: string;
  currentEmployer: string;
  currentDesignation: string;
  totalYearsExperience: string;
  skills: string;
  skillList: string[];
  education: string;
  educationEntries: string[];
  experience: string;
  experienceEntries: string[];
  certifications: string[];
  languages: string[];
  expectedSalaryHint: string;
  noticePeriodHint: string;
  workModeHint: string;
  relocationHint: string;
};

@Injectable()
export class DocumentParsingService {
  async extractAndParseUploadedResume(file: UploadedResumeFile) {
    const fileType = this.detectResumeFileType(file);
    const extractedText = await this.extractReadableText(file, fileType);
    const normalizedText = normalizeExtractedText(extractedText);

    if (!isReadableResumeText(normalizedText)) {
      throw new BadRequestException(
        'We could not extract readable content from this file. Please upload a valid PDF or DOCX resume.',
      );
    }

    const draft = parseCandidateDraftFromText(normalizedText, file.originalname);
    const warnings = buildDraftWarnings(draft);
    const confidence = estimateDraftConfidence(draft, warnings);

    return {
      fileName: file.originalname,
      fileType,
      extractedTextPreview: createTextPreview(normalizedText),
      warnings,
      parserMetadata: {
        parserVersion: 'resume-parser-v2',
        extractionConfidence: confidence,
      },
      candidateDraft: draft,
    };
  }

  buildQueuedJob(seed: ParsingJobSeed) {
    return {
      tenantId: seed.tenantId,
      documentReferenceId: seed.documentReferenceId,
      candidateId: seed.candidateId,
      parserKey: seed.parserKey ?? 'provider-pending',
      status: 'PENDING' as DocumentParsingStatus,
      requestedAt: new Date(),
      createdById: seed.requestedById,
      updatedById: seed.requestedById,
      // TODO: integrate async provider parser queue when enabled in env.
    };
  }

  buildParsedCandidateResult(seed: ParsingResultSeed) {
    const normalizedFileName = seed.fileName.replace(/\.[^.]+$/, '');
    const inferredSkills = extractSkills(normalizedFileName);

    return {
      parserVersion: 'provider-agnostic-v2',
      extractionConfidence: 55,
      candidateDraft: {
        firstName: seed.candidate.firstName,
        middleName: seed.candidate.middleName ?? null,
        lastName: seed.candidate.lastName,
        fullName: [seed.candidate.firstName, seed.candidate.middleName, seed.candidate.lastName]
          .filter(Boolean)
          .join(' '),
        email: seed.candidate.email,
        emails: [seed.candidate.email],
        phone: seed.candidate.phone,
        phones: [seed.candidate.phone],
        source: seed.candidate.source ?? null,
        currentEmployer: null,
        currentDesignation: null,
        skills: inferredSkills.join(', '),
        skillList: inferredSkills,
      },
      warnings: [
        'This environment is using provider-neutral placeholder parsing for async parse requests.',
      ],
    };
  }

  private detectResumeFileType(file: UploadedResumeFile): ResumeFileType {
    const fileName = file.originalname.toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (mime === 'application/pdf' || fileName.endsWith('.pdf')) {
      return 'pdf';
    }

    if (
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      return 'docx';
    }

    if (mime === 'application/msword' || fileName.endsWith('.doc')) {
      throw new BadRequestException(
        'DOC files are not supported yet. Please upload a PDF or DOCX resume.',
      );
    }

    throw new BadRequestException(
      'Unsupported file type. Please upload a valid PDF or DOCX resume.',
    );
  }

  private async extractReadableText(
    file: UploadedResumeFile,
    fileType: ResumeFileType,
  ) {
    if (fileType === 'pdf') {
      const result = await pdfParse(file.buffer);
      return result.text ?? '';
    }

    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value ?? '';
  }
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isReadableResumeText(value: string) {
  if (value.length < 40) {
    return false;
  }

  if (/(^|\s)PK[\x03-\x08]/.test(value)) {
    return false;
  }

  if (/\[Content_Types\]\.xml/i.test(value) || /word\/document\.xml/i.test(value)) {
    return false;
  }

  const totalChars = value.length;
  const controlChars = (value.match(/[\x00-\x08\x0E-\x1F\x7F]/g) ?? []).length;
  const replacementChars = (value.match(/\uFFFD/g) ?? []).length;
  const letterChars = (value.match(/[a-zA-Z]/g) ?? []).length;

  const noisyRatio = (controlChars + replacementChars) / totalChars;
  const letterRatio = letterChars / totalChars;

  return noisyRatio < 0.02 && letterRatio > 0.15;
}

function parseCandidateDraftFromText(text: string, fileName: string): ResumeParseDraft {
  const emails = dedupe((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((item) => item.trim().toLowerCase()));
  const phones = dedupe(
    (text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [])
      .map((item) => item.trim())
      .filter((item) => item.replace(/[^\d]/g, '').length >= 7),
  );
  const linkedInUrl =
    text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0] ??
    '';
  const githubUrl =
    text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s)]+/i)?.[0] ??
    '';
  const portfolioUrl =
    text.match(/https?:\/\/[^\s)]+/gi)?.find(
      (item) => !/linkedin\.com|github\.com/i.test(item),
    ) ?? '';

  const [firstName, middleName, lastName] = inferNameFromResume(text, fileName);
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
  const yearsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years|year|yrs|yr)/i);

  const skillList = extractSkillCatalog(text);
  const educationEntries = splitSectionToEntries(text, ['education', 'qualifications', 'degree']);
  const experienceEntries = splitSectionToEntries(text, ['experience', 'employment', 'work history']);
  const certifications = splitInlineList(findLineValue(text, ['certification', 'certifications']));
  const languages = splitInlineList(findLineValue(text, ['languages', 'language']));

  return {
    firstName,
    middleName: middleName || '',
    lastName,
    fullName,
    email: emails[0] ?? '',
    emails,
    phone: phones[0] ?? '',
    phones,
    linkedInUrl,
    portfolioUrl,
    githubUrl,
    city: inferValue(text, ['city', 'location', 'based in']),
    stateProvince: inferValue(text, ['state', 'province']),
    country: inferValue(text, ['country', 'nationality']),
    currentEmployer: inferValue(text, ['current employer', 'present company', 'employer']),
    currentDesignation: inferValue(text, ['current designation', 'current role', 'title', 'position']),
    totalYearsExperience: yearsMatch?.[1] ?? '',
    skills: skillList.join(', '),
    skillList,
    education: summarizeSection(text, ['education', 'degree', 'university']),
    educationEntries,
    experience: summarizeSection(text, ['experience', 'worked', 'employment']),
    experienceEntries,
    certifications,
    languages,
    expectedSalaryHint: inferValue(text, ['expected salary', 'salary expectation', 'desired salary']),
    noticePeriodHint: inferValue(text, ['notice period', 'availability']),
    workModeHint: inferValue(text, ['work mode', 'remote', 'hybrid', 'onsite']),
    relocationHint: inferValue(text, ['relocate', 'relocation']),
  };
}

function inferNameFromResume(text: string, fileName: string): [string, string, string] {
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^[A-Za-z][A-Za-z\s.'-]{2,60}$/.test(line));

  if (firstLine) {
    const chunks = firstLine.split(/\s+/).filter(Boolean);
    if (chunks.length >= 3) {
      return [capitalize(chunks[0]), capitalize(chunks[1]), capitalize(chunks[chunks.length - 1])];
    }
    if (chunks.length >= 2) {
      return [capitalize(chunks[0]), '', capitalize(chunks[chunks.length - 1])];
    }
  }

  const base = fileName
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  const chunks = base.split(/\s+/).filter(Boolean);
  if (chunks.length >= 3) {
    return [capitalize(chunks[0]), capitalize(chunks[1]), capitalize(chunks[chunks.length - 1])];
  }
  if (chunks.length >= 2) {
    return [capitalize(chunks[0]), '', capitalize(chunks[chunks.length - 1])];
  }
  if (chunks.length === 1) {
    return [capitalize(chunks[0]), '', 'Profile'];
  }

  return ['Candidate', '', 'Profile'];
}

function summarizeSection(text: string, cues: string[]) {
  const lower = text.toLowerCase();
  const cue = cues.find((item) => lower.includes(item));
  if (!cue) {
    return '';
  }
  const start = lower.indexOf(cue);
  return text.slice(start, start + 350).trim();
}

function splitSectionToEntries(text: string, cues: string[]) {
  const section = summarizeSection(text, cues);
  if (!section) {
    return [];
  }
  return dedupe(
    section
      .split(/\n|•|-/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8)
      .slice(0, 8),
  );
}

function inferValue(text: string, cues: string[]) {
  const lower = text.toLowerCase();
  for (const cue of cues) {
    const index = lower.indexOf(cue.toLowerCase());
    if (index === -1) {
      continue;
    }
    const slice = text.slice(index, index + 160);
    const parts = slice.split(/[:,-]/);
    if (parts.length > 1) {
      const value = parts[1].split(/[.\n]/)[0].trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return '';
}

function findLineValue(text: string, cues: string[]) {
  const lines = text.split('\n').map((line) => line.trim());
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (cues.some((cue) => lower.includes(cue))) {
      const [, value] = line.split(':');
      if (value && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return '';
}

function splitInlineList(value: string) {
  if (!value) {
    return [];
  }
  return dedupe(
    value
      .split(/,|\/|\|/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function extractSkillCatalog(text: string) {
  const catalog = [
    'javascript',
    'typescript',
    'react',
    'next.js',
    'node.js',
    'python',
    'java',
    'sql',
    'docker',
    'aws',
    'kubernetes',
    'excel',
    'hr',
    'recruitment',
    'payroll',
    'staffing',
    'power bi',
    'tableau',
    'nestjs',
    'postgresql',
  ];
  const lower = text.toLowerCase();
  return catalog.filter((skill) => lower.includes(skill)).slice(0, 20);
}

function createTextPreview(text: string) {
  const maxLength = 1600;
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function buildDraftWarnings(draft: ResumeParseDraft) {
  const warnings: string[] = [];
  if (!draft.email && draft.emails.length === 0) {
    warnings.push('Email could not be confidently extracted. Please review.');
  }
  if (!draft.phone && draft.phones.length === 0) {
    warnings.push('Phone number could not be confidently extracted. Please review.');
  }
  if (!draft.fullName || draft.fullName.split(' ').length < 2) {
    warnings.push('Full name confidence is low. Verify first and last name.');
  }
  if (draft.phones.length > 2) {
    warnings.push('Multiple phone numbers detected. Confirm primary contact number.');
  }
  if (draft.emails.length > 2) {
    warnings.push('Multiple emails detected. Confirm preferred email.');
  }
  if (draft.skillList.length === 0) {
    warnings.push('Skills were not confidently detected. Please add key skills.');
  }
  return warnings;
}

function estimateDraftConfidence(draft: ResumeParseDraft, warnings: string[]) {
  let score = 40;
  if (draft.fullName) score += 15;
  if (draft.email || draft.emails.length > 0) score += 15;
  if (draft.phone || draft.phones.length > 0) score += 15;
  if (draft.skillList.length > 0) score += 10;
  if (draft.educationEntries.length > 0) score += 5;
  if (draft.experienceEntries.length > 0) score += 5;
  score -= warnings.length * 4;
  return Math.max(0, Math.min(100, score));
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function extractSkills(fileName: string) {
  const tokens = fileName
    .split(/[^a-zA-Z0-9+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const canonicalSkills = [
    'react',
    'next.js',
    'node.js',
    'python',
    'java',
    'c#',
    'php',
    'sql',
    'aws',
    'azure',
    'docker',
    'kubernetes',
    'excel',
    'recruitment',
    'hr',
    'staffing',
  ];

  return canonicalSkills.filter((skill) =>
    tokens.some((token) => token.toLowerCase() === skill.toLowerCase()),
  );
}
