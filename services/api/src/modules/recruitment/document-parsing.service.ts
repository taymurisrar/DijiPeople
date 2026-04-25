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

type ResumeSectionKey =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'languages'
  | 'projects';

type SectionMap = Partial<Record<ResumeSectionKey, string>>;

type FieldConfidenceMap = {
  fullName: number;
  email: number;
  phone: number;
  skills: number;
  education: number;
  experience: number;
  location: number;
  designation: number;
  employer: number;
  totalExperience: number;
};

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

    const draft = parseCandidateDraftFromText(
      normalizedText,
      file.originalname,
    );
    const fieldConfidence = estimateFieldConfidence(draft);
    const warnings = buildDraftWarnings(draft, fieldConfidence);
    const confidence = estimateDraftConfidence(fieldConfidence, warnings);
    const pages = splitTextIntoPreviewPages(normalizedText);

    return {
      fileName: file.originalname,
      fileType,
      extractedTextPreview: createTextPreview(normalizedText),
      extractedTextFull: normalizedText,
      extractedTextPages: pages,
      warnings,
      parserMetadata: {
        parserVersion: 'resume-parser-v4',
        extractionConfidence: confidence,
        fieldConfidence,
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
    };
  }

  buildParsedCandidateResult(seed: ParsingResultSeed) {
    const normalizedFileName = seed.fileName.replace(/\.[^.]+$/, '');
    const inferredSkills = extractSkillsFromText(normalizedFileName);

    return {
      parserVersion: 'provider-agnostic-v4',
      extractionConfidence: 55,
      candidateDraft: {
        firstName: seed.candidate.firstName,
        middleName: seed.candidate.middleName ?? null,
        lastName: seed.candidate.lastName,
        fullName: [
          seed.candidate.firstName,
          seed.candidate.middleName,
          seed.candidate.lastName,
        ]
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

    if (mime === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf';

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
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[•●▪◦]/g, '•')
    .trim();
}

function isReadableResumeText(value: string) {
  if (value.length < 40) return false;
  if (/(^|\s)PK[\x03-\x08]/.test(value)) return false;
  if (
    /\[Content_Types\]\.xml/i.test(value) ||
    /word\/document\.xml/i.test(value)
  )
    return false;

  const totalChars = value.length;
  const controlChars = (value.match(/[\x00-\x08\x0E-\x1F\x7F]/g) ?? []).length;
  const replacementChars = (value.match(/\uFFFD/g) ?? []).length;
  const letterChars = (value.match(/[a-zA-Z]/g) ?? []).length;

  return (
    (controlChars + replacementChars) / totalChars < 0.02 &&
    letterChars / totalChars > 0.15
  );
}

function parseCandidateDraftFromText(
  text: string,
  fileName: string,
): ResumeParseDraft {
  const lines = getCleanLines(text);
  const sections = extractSections(text);

  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const links = extractLinks(text);

  const [firstName, middleName, lastName] = inferNameFromResume(
    lines,
    fileName,
  );
  const fullName = [firstName, middleName, lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  const skillList = extractSkillsFromText(
    [
      sections.skills,
      sections.summary,
      sections.experience,
      sections.education,
      text,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  const educationEntries = extractEducationEntries(sections.education ?? text);
  const experienceEntries = extractExperienceEntries(
    sections.experience ?? text,
  );
  const certifications = extractCertifications(sections.certifications ?? text);
  const languages = extractLanguages(sections.languages ?? text);

  const currentDesignation = inferCurrentDesignation(lines, sections);
  const currentEmployer = inferCurrentEmployer(lines, sections);
  const location = inferLocation(text, lines);
  const totalYearsExperience = inferTotalYearsExperience(text);

  return {
    firstName,
    middleName: middleName || '',
    lastName,
    fullName,
    email: emails[0] ?? '',
    emails,
    phone: phones[0] ?? '',
    phones,
    linkedInUrl: links.linkedInUrl,
    portfolioUrl: links.portfolioUrl,
    githubUrl: links.githubUrl,
    city: location.city,
    stateProvince: location.stateProvince,
    country: location.country,
    currentEmployer,
    currentDesignation,
    totalYearsExperience,
    skills: skillList.join(', '),
    skillList,
    education: createSectionSummary(sections.education ?? '', 1200),
    educationEntries,
    experience: createSectionSummary(sections.experience ?? '', 1600),
    experienceEntries,
    certifications,
    languages,
    expectedSalaryHint: inferValue(text, [
      'expected salary',
      'salary expectation',
      'desired salary',
      'current salary',
    ]),
    noticePeriodHint: inferValue(text, [
      'notice period',
      'availability',
      'available from',
    ]),
    workModeHint: inferWorkMode(text),
    relocationHint: inferRelocation(text),
  };
}

function getCleanLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(page\s+\d+|\d+\s*\/\s*\d+)$/i.test(line));
}

function extractSections(text: string): SectionMap {
  const headingMap: Array<{ key: ResumeSectionKey; patterns: RegExp[] }> = [
    {
      key: 'summary',
      patterns: [
        /^summary$/i,
        /^profile summary$/i,
        /^professional summary$/i,
        /^profile$/i,
        /^objective$/i,
        /^about me$/i,
      ],
    },
    {
      key: 'skills',
      patterns: [
        /^skills$/i,
        /^technical skills$/i,
        /^core skills$/i,
        /^key skills$/i,
        /^competencies$/i,
        /^areas of expertise$/i,
      ],
    },
    {
      key: 'experience',
      patterns: [
        /^experience$/i,
        /^professional experience$/i,
        /^work experience$/i,
        /^employment history$/i,
        /^career history$/i,
      ],
    },
    {
      key: 'education',
      patterns: [
        /^education$/i,
        /^academic background$/i,
        /^academic qualification/i,
        /^qualifications$/i,
        /^degrees?$/i,
      ],
    },
    {
      key: 'certifications',
      patterns: [
        /^certifications?$/i,
        /^licenses?$/i,
        /^courses$/i,
        /^training$/i,
      ],
    },
    { key: 'languages', patterns: [/^languages?$/i] },
    {
      key: 'projects',
      patterns: [/^projects?$/i, /^key projects$/i, /^selected projects$/i],
    },
  ];

  const lines = text.split('\n');
  const foundHeadings: Array<{ index: number; key: ResumeSectionKey }> = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine
      .trim()
      .replace(/[:\-–—]+$/, '')
      .trim();
    if (line.length > 55) return;

    for (const heading of headingMap) {
      if (heading.patterns.some((pattern) => pattern.test(line))) {
        foundHeadings.push({ index, key: heading.key });
        return;
      }
    }
  });

  const sections: SectionMap = {};

  foundHeadings.forEach((heading, cursor) => {
    const nextHeading = foundHeadings[cursor + 1];
    const start = heading.index + 1;
    const end = nextHeading?.index ?? lines.length;
    const content = lines.slice(start, end).join('\n').trim();

    if (content.length > 0) {
      sections[heading.key] = content;
    }
  });

  return sections;
}

function extractEmails(text: string) {
  return dedupe(
    (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter((item) => !item.endsWith('.png') && !item.endsWith('.jpg')),
  );
}

function extractPhones(text: string) {
  return dedupe(
    (text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [])
      .map((item) => item.trim().replace(/\s{2,}/g, ' '))
      .filter((item) => {
        const digits = item.replace(/[^\d]/g, '');
        return digits.length >= 7 && digits.length <= 16;
      }),
  );
}

function extractLinks(text: string) {
  const urls = dedupe(text.match(/https?:\/\/[^\s)>\]]+/gi) ?? []);

  const linkedInUrl =
    urls.find((item) => /linkedin\.com/i.test(item)) ??
    text.match(/(?:www\.)?linkedin\.com\/[^\s)>\]]+/i)?.[0] ??
    '';

  const githubUrl =
    urls.find((item) => /github\.com/i.test(item)) ??
    text.match(/(?:www\.)?github\.com\/[^\s)>\]]+/i)?.[0] ??
    '';

  const portfolioUrl =
    urls.find((item) => !/linkedin\.com|github\.com/i.test(item)) ?? '';

  return {
    linkedInUrl: ensureUrl(linkedInUrl),
    githubUrl: ensureUrl(githubUrl),
    portfolioUrl: ensureUrl(portfolioUrl),
  };
}

function ensureUrl(value: string) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function inferNameFromResume(
  lines: string[],
  fileName: string,
): [string, string, string] {
  const ignored = [
    'resume',
    'curriculum vitae',
    'cv',
    'profile',
    'professional summary',
    'summary',
  ];

  const candidateLine = lines.slice(0, 12).find((line) => {
    const normalized = line.toLowerCase();

    if (ignored.includes(normalized)) return false;
    if (/@|https?:|www\.|linkedin|github|\d/.test(normalized)) return false;
    if (line.length < 3 || line.length > 60) return false;

    return /^[A-Za-z][A-Za-z\s.'-]+$/.test(line);
  });

  if (candidateLine) return splitName(candidateLine);

  const base = fileName
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/resume|cv|profile/gi, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  return base ? splitName(base) : ['Candidate', '', 'Profile'];
}

function splitName(value: string): [string, string, string] {
  const chunks = value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(mr|mrs|ms|miss|dr|eng|engineer)$/i.test(item));

  if (chunks.length >= 3) {
    return [
      capitalizeWords(chunks[0]),
      capitalizeWords(chunks.slice(1, chunks.length - 1).join(' ')),
      capitalizeWords(chunks[chunks.length - 1]),
    ];
  }

  if (chunks.length === 2)
    return [capitalizeWords(chunks[0]), '', capitalizeWords(chunks[1])];
  if (chunks.length === 1) return [capitalizeWords(chunks[0]), '', 'Profile'];

  return ['Candidate', '', 'Profile'];
}

function inferCurrentDesignation(lines: string[], sections: SectionMap) {
  const explicit = inferValue(lines.join('\n'), [
    'current designation',
    'current role',
    'job title',
    'title',
    'position',
    'designation',
  ]);

  if (explicit) return explicit;

  const searchLines = [
    ...lines.slice(0, 15),
    ...(sections.experience ? sections.experience.split('\n').slice(0, 8) : []),
  ];

  const match = searchLines.find((line) =>
    /(?:developer|engineer|consultant|specialist|manager|analyst|administrator|architect|designer|recruiter|accountant|hr|sales|marketing|teacher|nurse|doctor|assistant|coordinator|executive)/i.test(
      line,
    ),
  );

  return match ? cleanInlineValue(match) : '';
}

function inferCurrentEmployer(lines: string[], sections: SectionMap) {
  const explicit = inferValue(lines.join('\n'), [
    'current employer',
    'present company',
    'company',
    'employer',
    'organization',
  ]);

  if (explicit) return explicit;

  const experienceLines = sections.experience
    ? sections.experience
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  const employerLine = experienceLines.find((line) => {
    if (line.length > 110) return false;

    return /\bat\b|\bwith\b|\bcompany\b|\bpvt\b|\bltd\b|\bllc\b|\binc\b|\bbank\b|\bgroup\b|\btechnologies\b|\bsolutions\b/i.test(
      line,
    );
  });

  if (!employerLine) return '';

  const atMatch = employerLine.match(/\bat\s+(.+)$/i);
  if (atMatch?.[1]) return cleanInlineValue(atMatch[1]);

  return cleanInlineValue(employerLine);
}

function inferLocation(text: string, lines: string[]) {
  const explicitLocation = inferValue(text, [
    'location',
    'address',
    'current location',
    'based in',
    'based at',
    'residing in',
    'residence',
  ]);

  const city = inferValue(text, ['city']);
  const stateProvince = inferValue(text, ['state', 'province', 'region']);
  const country = inferValue(text, ['country']);

  if (city || stateProvince || country) {
    return {
      city: city || '',
      stateProvince: stateProvince || '',
      country: normalizeCountryName(country || ''),
    };
  }

  if (explicitLocation) {
    const split = splitLocationValue(explicitLocation);

    if (
      isSupportedCountry(split.country) ||
      isKnownPakistanOrUSCity(split.city)
    ) {
      return {
        city: split.city,
        stateProvince: split.stateProvince,
        country: normalizeCountryName(split.country),
      };
    }
  }

  const knownLocations: Array<{
    city: string;
    stateProvince: string;
    country: 'Pakistan' | 'United States';
    aliases: string[];
  }> = [
    // Pakistan - Sindh
    {
      city: 'Karachi',
      stateProvince: 'Sindh',
      country: 'Pakistan',
      aliases: ['karachi', 'karachi pakistan', 'karachi sindh'],
    },
    {
      city: 'Hyderabad',
      stateProvince: 'Sindh',
      country: 'Pakistan',
      aliases: ['hyderabad sindh', 'hyderabad pakistan'],
    },
    {
      city: 'Sukkur',
      stateProvince: 'Sindh',
      country: 'Pakistan',
      aliases: ['sukkur', 'sukkur pakistan'],
    },
    {
      city: 'Larkana',
      stateProvince: 'Sindh',
      country: 'Pakistan',
      aliases: ['larkana', 'larkana pakistan'],
    },

    // Pakistan - Punjab
    {
      city: 'Lahore',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['lahore', 'lahore pakistan', 'lahore punjab'],
    },
    {
      city: 'Faisalabad',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['faisalabad', 'fsd', 'faisalabad pakistan'],
    },
    {
      city: 'Rawalpindi',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['rawalpindi', 'pindi', 'rawalpindi pakistan'],
    },
    {
      city: 'Multan',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['multan', 'multan pakistan'],
    },
    {
      city: 'Gujranwala',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['gujranwala', 'gujranwala pakistan'],
    },
    {
      city: 'Sialkot',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['sialkot', 'sialkot pakistan'],
    },
    {
      city: 'Bahawalpur',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['bahawalpur', 'bahawalpur pakistan'],
    },
    {
      city: 'Sargodha',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['sargodha', 'sargodha pakistan'],
    },
    {
      city: 'Gujrat',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['gujrat pakistan', 'gujrat punjab'],
    },
    {
      city: 'Sheikhupura',
      stateProvince: 'Punjab',
      country: 'Pakistan',
      aliases: ['sheikhupura', 'sheikhupura pakistan'],
    },

    // Pakistan - ICT
    {
      city: 'Islamabad',
      stateProvince: 'Islamabad Capital Territory',
      country: 'Pakistan',
      aliases: [
        'islamabad',
        'islamabad pakistan',
        'islamabad capital territory',
        'ict pakistan',
      ],
    },

    // Pakistan - KPK
    {
      city: 'Peshawar',
      stateProvince: 'Khyber Pakhtunkhwa',
      country: 'Pakistan',
      aliases: ['peshawar', 'peshawar pakistan'],
    },
    {
      city: 'Abbottabad',
      stateProvince: 'Khyber Pakhtunkhwa',
      country: 'Pakistan',
      aliases: ['abbottabad', 'abbottabad pakistan'],
    },
    {
      city: 'Mardan',
      stateProvince: 'Khyber Pakhtunkhwa',
      country: 'Pakistan',
      aliases: ['mardan', 'mardan pakistan'],
    },
    {
      city: 'Swat',
      stateProvince: 'Khyber Pakhtunkhwa',
      country: 'Pakistan',
      aliases: ['swat', 'swat pakistan', 'mingora'],
    },

    // Pakistan - Balochistan
    {
      city: 'Quetta',
      stateProvince: 'Balochistan',
      country: 'Pakistan',
      aliases: ['quetta', 'quetta pakistan'],
    },
    {
      city: 'Gwadar',
      stateProvince: 'Balochistan',
      country: 'Pakistan',
      aliases: ['gwadar', 'gwadar pakistan'],
    },

    // Pakistan - AJK / GB
    {
      city: 'Muzaffarabad',
      stateProvince: 'Azad Jammu and Kashmir',
      country: 'Pakistan',
      aliases: ['muzaffarabad', 'muzaffarabad pakistan'],
    },
    {
      city: 'Gilgit',
      stateProvince: 'Gilgit-Baltistan',
      country: 'Pakistan',
      aliases: ['gilgit', 'gilgit pakistan'],
    },

    // United States - Major cities
    {
      city: 'New York',
      stateProvince: 'New York',
      country: 'United States',
      aliases: [
        'new york',
        'new york city',
        'nyc',
        'new york usa',
        'new york us',
        'new york, ny',
      ],
    },
    {
      city: 'Los Angeles',
      stateProvince: 'California',
      country: 'United States',
      aliases: ['los angeles', 'la california', 'los angeles ca', 'la usa'],
    },
    {
      city: 'Chicago',
      stateProvince: 'Illinois',
      country: 'United States',
      aliases: ['chicago', 'chicago il', 'chicago illinois'],
    },
    {
      city: 'Houston',
      stateProvince: 'Texas',
      country: 'United States',
      aliases: ['houston', 'houston tx', 'houston texas'],
    },
    {
      city: 'Phoenix',
      stateProvince: 'Arizona',
      country: 'United States',
      aliases: ['phoenix', 'phoenix az', 'phoenix arizona'],
    },
    {
      city: 'Philadelphia',
      stateProvince: 'Pennsylvania',
      country: 'United States',
      aliases: ['philadelphia', 'philly', 'philadelphia pa'],
    },
    {
      city: 'San Antonio',
      stateProvince: 'Texas',
      country: 'United States',
      aliases: ['san antonio', 'san antonio tx'],
    },
    {
      city: 'San Diego',
      stateProvince: 'California',
      country: 'United States',
      aliases: ['san diego', 'san diego ca'],
    },
    {
      city: 'Dallas',
      stateProvince: 'Texas',
      country: 'United States',
      aliases: ['dallas', 'dallas tx', 'dallas texas'],
    },
    {
      city: 'Austin',
      stateProvince: 'Texas',
      country: 'United States',
      aliases: ['austin', 'austin tx', 'austin texas'],
    },
    {
      city: 'San Jose',
      stateProvince: 'California',
      country: 'United States',
      aliases: ['san jose', 'san jose ca'],
    },
    {
      city: 'Jacksonville',
      stateProvince: 'Florida',
      country: 'United States',
      aliases: ['jacksonville', 'jacksonville fl'],
    },
    {
      city: 'Fort Worth',
      stateProvince: 'Texas',
      country: 'United States',
      aliases: ['fort worth', 'fort worth tx'],
    },
    {
      city: 'Columbus',
      stateProvince: 'Ohio',
      country: 'United States',
      aliases: ['columbus ohio', 'columbus oh'],
    },
    {
      city: 'Charlotte',
      stateProvince: 'North Carolina',
      country: 'United States',
      aliases: ['charlotte', 'charlotte nc'],
    },
    {
      city: 'San Francisco',
      stateProvince: 'California',
      country: 'United States',
      aliases: ['san francisco', 'sf california', 'san francisco ca'],
    },
    {
      city: 'Seattle',
      stateProvince: 'Washington',
      country: 'United States',
      aliases: ['seattle', 'seattle wa', 'seattle washington'],
    },
    {
      city: 'Denver',
      stateProvince: 'Colorado',
      country: 'United States',
      aliases: ['denver', 'denver co', 'denver colorado'],
    },
    {
      city: 'Boston',
      stateProvince: 'Massachusetts',
      country: 'United States',
      aliases: ['boston', 'boston ma', 'boston massachusetts'],
    },
    {
      city: 'Miami',
      stateProvince: 'Florida',
      country: 'United States',
      aliases: ['miami', 'miami fl', 'miami florida'],
    },
    {
      city: 'Atlanta',
      stateProvince: 'Georgia',
      country: 'United States',
      aliases: ['atlanta', 'atlanta ga', 'atlanta georgia'],
    },
    {
      city: 'Washington',
      stateProvince: 'District of Columbia',
      country: 'United States',
      aliases: [
        'washington dc',
        'washington d c',
        'dc usa',
        'district of columbia',
      ],
    },
    {
      city: 'Las Vegas',
      stateProvince: 'Nevada',
      country: 'United States',
      aliases: ['las vegas', 'las vegas nv'],
    },
    {
      city: 'Orlando',
      stateProvince: 'Florida',
      country: 'United States',
      aliases: ['orlando', 'orlando fl'],
    },
    {
      city: 'Tampa',
      stateProvince: 'Florida',
      country: 'United States',
      aliases: ['tampa', 'tampa fl'],
    },
  ];

  const searchableText = [
    lines.slice(0, 18).join(' '),
    text.slice(0, 2500),
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s,.-]/g, ' ')
    .replace(/\s+/g, ' ');

  for (const location of knownLocations) {
    const matched = location.aliases.some((alias) => {
      const normalizedAlias = alias
        .toLowerCase()
        .replace(/[^\w\s,.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return new RegExp(
        `(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`,
        'i',
      ).test(searchableText);
    });

    if (matched) {
      return {
        city: location.city,
        stateProvince: location.stateProvince,
        country: location.country,
      };
    }
  }

  return { city: '', stateProvince: '', country: '' };
}

function normalizeCountryName(country: string) {
  const value = country.trim().toLowerCase();

  if (
    ['usa', 'us', 'u.s.', 'u.s.a.', 'america', 'united states'].includes(value)
  ) {
    return 'United States';
  }

  if (['pakistan', 'pk'].includes(value)) {
    return 'Pakistan';
  }

  return '';
}

function isSupportedCountry(country: string) {
  const normalized = normalizeCountryName(country);
  return normalized === 'Pakistan' || normalized === 'United States';
}

function isKnownPakistanOrUSCity(city: string) {
  const value = city.trim().toLowerCase();

  return [
    'karachi',
    'lahore',
    'islamabad',
    'rawalpindi',
    'faisalabad',
    'multan',
    'peshawar',
    'quetta',
    'sialkot',
    'hyderabad',
    'new york',
    'los angeles',
    'chicago',
    'houston',
    'phoenix',
    'philadelphia',
    'san antonio',
    'san diego',
    'dallas',
    'austin',
    'san jose',
    'seattle',
    'boston',
    'miami',
    'atlanta',
    'washington',
    'las vegas',
    'orlando',
    'tampa',
  ].includes(value);
}

function splitLocationValue(value: string) {
  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return { city: parts[0], stateProvince: parts[1], country: parts[2] };
  }

  if (parts.length === 2) {
    return { city: parts[0], stateProvince: '', country: parts[1] };
  }

  return { city: value, stateProvince: '', country: '' };
}

function inferTotalYearsExperience(text: string) {
  const clean = text.replace(/\s+/g, ' ');

  const explicitPatterns = [
    /(?:total\s+)?(?:years\s+of\s+)?experience\s*[:\-–—]?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)/i,
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)\s+(?:of\s+)?(?:professional\s+)?experience/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return match[1];
  }

  const monthYearRanges = Array.from(
    clean.matchAll(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(present|current|now|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2})\b/gi,
    ),
  );

  const yearRanges = Array.from(
    clean.matchAll(
      /\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(present|current|now|(?:19|20)\d{2})\b/gi,
    ),
  );

  const ranges: Array<{ start: Date; end: Date }> = [];

  for (const match of monthYearRanges) {
    const startMonth = monthNameToIndex(match[1]);
    const startYear = Number(match[2]);
    const endValue = match[3];

    let endMonth = new Date().getMonth();
    let endYear = new Date().getFullYear();

    if (!/present|current|now/i.test(endValue)) {
      const endMatch = endValue.match(
        /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+((?:19|20)\d{2})/i,
      );

      if (endMatch) {
        endMonth = monthNameToIndex(endMatch[1]);
        endYear = Number(endMatch[2]);
      }
    }

    ranges.push({
      start: new Date(startYear, startMonth, 1),
      end: new Date(endYear, endMonth, 1),
    });
  }

  if (ranges.length === 0) {
    for (const match of yearRanges) {
      const startYear = Number(match[1]);
      const endYear = /present|current|now/i.test(match[2])
        ? new Date().getFullYear()
        : Number(match[2]);

      ranges.push({
        start: new Date(startYear, 0, 1),
        end: new Date(endYear, 11, 1),
      });
    }
  }

  if (ranges.length === 0) return '';

  const merged = mergeDateRanges(ranges);
  const totalMonths = merged.reduce((sum, range) => {
    const months =
      (range.end.getFullYear() - range.start.getFullYear()) * 12 +
      (range.end.getMonth() - range.start.getMonth()) +
      1;

    return sum + Math.max(0, months);
  }, 0);

  if (totalMonths <= 0) return '';

  const years = totalMonths / 12;
  return years < 1 ? years.toFixed(1) : String(Math.round(years * 10) / 10);
}

function monthNameToIndex(value: string) {
  const key = value.slice(0, 3).toLowerCase();
  const map: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  return map[key] ?? 0;
}

function mergeDateRanges(ranges: Array<{ start: Date; end: Date }>) {
  const sorted = ranges
    .filter((range) => range.end >= range.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Array<{ start: Date; end: Date }> = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];

    if (!last) {
      merged.push(range);
      continue;
    }

    if (
      range.start <=
      new Date(last.end.getFullYear(), last.end.getMonth() + 1, 1)
    ) {
      if (range.end > last.end) {
        last.end = range.end;
      }
    } else {
      merged.push(range);
    }
  }

  return merged;
}

function extractSkillsFromText(text: string) {
  const skillAliases: Record<string, string[]> = {
    // Frontend
    JavaScript: ['javascript', 'java script', 'js', 'ecmascript', 'es6', 'es 6'],
    TypeScript: ['typescript', 'type script', 'ts'],
    React: ['react', 'react.js', 'reactjs', 'react js'],
    'Next.js': ['next.js', 'nextjs', 'next js', 'next'],
    Vue: ['vue', 'vue.js', 'vuejs', 'vue js'],
    Angular: ['angular', 'angularjs', 'angular js'],
    HTML: ['html', 'html5', 'html 5'],
    CSS: ['css', 'css3', 'css 3'],
    Sass: ['sass', 'scss'],
    Bootstrap: [
      'bootstrap',
      'bootstrap 5',
      'bootstrap5',
      'bootstap',
      'boot strap',
      'bootstrp',
      'boostrap',
    ],
    Tailwind: [
      'tailwind',
      'tailwindcss',
      'tailwind css',
      'tail wind',
      'tailwind ui',
    ],
    MaterialUI: [
      'material ui',
      'material-ui',
      'mui',
      'material design',
    ],
    Redux: ['redux', 'redux toolkit', 'rtk'],
    Zustand: ['zustand'],
    jQuery: ['jquery', 'j query'],

    // Backend
    'Node.js': ['node.js', 'nodejs', 'node js', 'node'],
    Express: ['express', 'express.js', 'expressjs', 'express js'],
    NestJS: ['nestjs', 'nest.js', 'nest js', 'nest'],
    Laravel: ['laravel'],
    Django: ['django'],
    Flask: ['flask'],
    SpringBoot: ['spring boot', 'springboot'],
    '.NET': ['.net', 'dotnet', 'dot net', 'asp.net', 'asp net'],
    'ASP.NET Web API': [
      'asp.net web api',
      'asp net web api',
      'web api',
      'dotnet web api',
      '.net web api',
    ],
    PHP: ['php'],
    Python: ['python', 'py'],
    Java: ['java'],
    'C#': ['c#', 'c sharp', 'csharp'],
    'C++': ['c++', 'cpp', 'c plus plus'],
    C: ['c language', 'programming c'],
    Go: ['go', 'golang'],
    Ruby: ['ruby', 'ruby on rails', 'rails'],

    // APIs / Integrations
    'REST API': [
      'rest api',
      'restful api',
      'restful services',
      'rest services',
      'rest',
    ],
    GraphQL: ['graphql', 'graph ql'],
    SOAP: ['soap', 'soap api', 'soap service'],
    JSON: ['json'],
    XML: ['xml'],
    Postman: ['postman'],
    Swagger: ['swagger', 'openapi', 'open api'],
    OAuth: ['oauth', 'oauth2', 'oauth 2', 'openid connect', 'oidc'],
    JWT: ['jwt', 'json web token'],

    // Database
    SQL: ['sql', 'structured query language'],
    MySQL: ['mysql', 'my sql'],
    PostgreSQL: ['postgresql', 'postgres', 'postgre sql', 'pgsql'],
    MongoDB: ['mongodb', 'mongo db', 'mongo'],
    SQLite: ['sqlite', 'sql lite'],
    Oracle: ['oracle', 'oracle db', 'oracle database'],
    'SQL Server': [
      'sql server',
      'mssql',
      'ms sql',
      'microsoft sql server',
    ],
    Redis: ['redis'],
    Prisma: ['prisma', 'prisma orm'],
    Sequelize: ['sequelize'],
    Mongoose: ['mongoose'],

    // Cloud / DevOps
    Azure: ['azure', 'microsoft azure', 'ms azure'],
    AWS: ['aws', 'amazon web services'],
    GCP: ['gcp', 'google cloud', 'google cloud platform'],
    Docker: ['docker', 'docker compose', 'docker-compose'],
    Kubernetes: ['kubernetes', 'k8s'],
    Git: ['git', 'github', 'gitlab', 'bitbucket'],
    GitHubActions: ['github actions', 'github action'],
    AzureDevOps: ['azure devops', 'azure dev ops', 'ado'],
    CI_CD: ['ci/cd', 'cicd', 'ci cd', 'continuous integration'],
    Vercel: ['vercel'],
    Render: ['render'],
    Netlify: ['netlify'],
    Jenkins: ['jenkins'],
    Linux: ['linux', 'ubuntu'],
    Nginx: ['nginx'],
    IIS: ['iis', 'internet information services'],

    // Microsoft Business Apps
    'Dynamics 365': [
      'dynamics 365',
      'd365',
      'microsoft dynamics',
      'ms dynamics',
      'dynamics crm',
      'crm dynamics',
      'd365 crm',
      'd365 ce',
      'customer engagement',
    ],
    'Power Platform': ['power platform', 'microsoft power platform'],
    'Power Apps': ['power apps', 'powerapps', 'canvas app', 'model driven app'],
    'Power Automate': [
      'power automate',
      'powerautomate',
      'ms flow',
      'microsoft flow',
      'cloud flow',
      'flow',
    ],
    Dataverse: [
      'dataverse',
      'data verse',
      'common data service',
      'cds',
    ],
    PowerBI: ['power bi', 'powerbi', 'pbi'],
    SharePoint: ['sharepoint', 'share point'],
    'Microsoft 365': ['microsoft 365', 'm365', 'office 365', 'o365'],

    // CRM / ERP / Business Systems
    CRM: ['crm', 'customer relationship management'],
    ERP: ['erp', 'enterprise resource planning'],
    Salesforce: ['salesforce', 'sales force'],
    HubSpot: ['hubspot', 'hub spot'],
    Zoho: ['zoho', 'zoho crm'],
    SAP: ['sap'],
    OracleERP: ['oracle erp'],
    Workday: ['workday'],

    // Design / Product
    UIUX: [
      'ui ux',
      'ui/ux',
      'user interface',
      'user experience',
      'ux design',
      'ui design',
    ],
    Figma: ['figma'],
    AdobeXD: ['adobe xd', 'xd'],
    Photoshop: ['photoshop', 'adobe photoshop'],
    Illustrator: ['illustrator', 'adobe illustrator'],
    Canva: ['canva'],
    Wireframing: ['wireframing', 'wireframe', 'wire frames'],
    Prototyping: ['prototyping', 'prototype'],
    ProductManagement: ['product management', 'product manager'],
    BusinessAnalysis: [
      'business analysis',
      'business analyst',
      'ba',
      'requirement gathering',
      'requirements gathering',
      'brd',
      'frd',
      'user stories',
    ],

    // Testing / QA
    Testing: ['testing', 'software testing'],
    QA: ['qa', 'quality assurance'],
    ManualTesting: ['manual testing'],
    AutomationTesting: ['automation testing', 'test automation'],
    Selenium: ['selenium'],
    Cypress: ['cypress'],
    Jest: ['jest'],
    Playwright: ['playwright'],
    UnitTesting: ['unit testing', 'unit test'],
    UAT: ['uat', 'user acceptance testing'],

    // Project / Delivery
    Agile: ['agile', 'agile methodology'],
    Scrum: ['scrum'],
    Kanban: ['kanban'],
    Jira: ['jira'],
    Trello: ['trello'],
    Asana: ['asana'],
    ProjectManagement: [
      'project management',
      'project manager',
      'project coordination',
      'project coordinator',
    ],
    StakeholderManagement: [
      'stakeholder management',
      'stakeholder communication',
      'client management',
    ],

    // HR / Recruitment
    HR: ['hr', 'human resources', 'human resource'],
    Recruitment: [
      'recruitment',
      'recruiting',
      'recruiter',
      'talent acquisition',
      'hiring',
      'sourcing',
      'candidate sourcing',
    ],
    Onboarding: [
      'onboarding',
      'employee onboarding',
      'staff onboarding',
      'new hire onboarding',
    ],
    Payroll: [
      'payroll',
      'salary processing',
      'wages',
      'compensation',
      'payroll processing',
    ],
    Attendance: ['attendance', 'time attendance', 'time & attendance'],
    Timesheets: ['timesheet', 'timesheets', 'time sheet', 'time sheets'],
    EmployeeRelations: [
      'employee relations',
      'staff relations',
      'grievance handling',
    ],
    TrainingDevelopment: [
      'training',
      'training and development',
      'learning and development',
      'l&d',
      'staff training',
    ],
    PerformanceManagement: [
      'performance management',
      'performance appraisal',
      'appraisal',
      'kpi',
      'kpis',
    ],
    Staffing: ['staffing', 'manpower planning', 'workforce planning'],

    // Finance / Accounting
    Accounting: [
      'accounting',
      'bookkeeping',
      'book keeping',
      'accounts payable',
      'account payable',
      'ap',
      'accounts receivable',
      'account receivable',
      'ar',
    ],
    Finance: [
      'finance',
      'financial reporting',
      'financial analysis',
      'financial management',
    ],
    Budgeting: ['budgeting', 'budget management', 'budget planning'],
    Forecasting: ['forecasting', 'financial forecasting'],
    Auditing: ['auditing', 'audit', 'internal audit', 'external audit'],
    Taxation: ['tax', 'taxation', 'tax filing', 'vat', 'gst'],
    Invoicing: ['invoicing', 'invoice processing', 'billing'],

    // Sales / Marketing / Customer Support
    Sales: [
      'sales',
      'business development',
      'bd',
      'lead generation',
      'cold calling',
      'inside sales',
      'field sales',
    ],
    Marketing: [
      'marketing',
      'digital marketing',
      'social media marketing',
      'seo',
      'sem',
      'content marketing',
      'email marketing',
    ],
    CustomerService: [
      'customer service',
      'customer support',
      'client support',
      'customer care',
      'call center',
      'contact center',
      'helpdesk',
      'help desk',
    ],
    CRMManagement: ['crm management', 'customer management'],
    AccountManagement: [
      'account management',
      'key account management',
      'client relationship management',
    ],

    // Admin / Operations
    Administration: [
      'administration',
      'admin work',
      'office administration',
      'office admin',
      'administrative support',
    ],
    Operations: [
      'operations',
      'operations management',
      'business operations',
      'ops',
    ],
    DataEntry: [
      'data entry',
      'data typing',
      'typing',
      'record keeping',
      'records management',
    ],
    Documentation: [
      'documentation',
      'document control',
      'document management',
      'filing',
    ],
    Procurement: ['procurement', 'purchasing', 'vendor management'],
    InventoryManagement: [
      'inventory',
      'inventory management',
      'stock management',
      'warehouse management',
    ],
    Logistics: ['logistics', 'supply chain', 'shipping', 'dispatch'],
    Scheduling: ['scheduling', 'calendar management', 'appointment setting'],

    // Healthcare / Education / General
    Healthcare: ['healthcare', 'health care', 'medical', 'clinical'],
    Nursing: ['nursing', 'nurse'],
    Teaching: ['teaching', 'teacher', 'education', 'tutoring', 'trainer'],
    Research: ['research', 'market research', 'academic research'],
    Legal: ['legal', 'law', 'compliance', 'contract management'],

    // Office / Tools
    Excel: [
      'excel',
      'microsoft excel',
      'ms excel',
      'spreadsheets',
      'spreadsheet',
      'pivot table',
      'pivot tables',
      'vlookup',
      'xlookup',
    ],
    Word: ['word', 'microsoft word', 'ms word'],
    PowerPoint: [
      'powerpoint',
      'power point',
      'microsoft powerpoint',
      'ms powerpoint',
      'presentation',
      'presentations',
    ],
    Outlook: ['outlook', 'microsoft outlook', 'ms outlook'],
    MicrosoftOffice: [
      'microsoft office',
      'ms office',
      'office suite',
      'word excel powerpoint',
    ],
    GoogleWorkspace: [
      'google workspace',
      'g suite',
      'google docs',
      'google sheets',
      'google slides',
      'gmail',
    ],

    // Soft Skills
    Communication: [
      'communication',
      'communication skills',
      'written communication',
      'verbal communication',
      'oral communication',
      'presentation skills',
    ],
    Leadership: [
      'leadership',
      'team leadership',
      'team management',
      'people management',
      'supervision',
      'supervisory skills',
    ],
    Teamwork: [
      'teamwork',
      'team player',
      'collaboration',
      'collaborative',
      'cross functional collaboration',
    ],
    ProblemSolving: [
      'problem solving',
      'problem-solving',
      'troubleshooting',
      'analytical thinking',
      'critical thinking',
    ],
    TimeManagement: [
      'time management',
      'prioritization',
      'multi tasking',
      'multitasking',
      'deadline management',
    ],
    Adaptability: ['adaptability', 'flexibility', 'quick learner'],
    AttentionToDetail: [
      'attention to detail',
      'detail oriented',
      'detail-oriented',
      'accuracy',
    ],
    Creativity: ['creativity', 'creative thinking'],
    DecisionMaking: ['decision making', 'decision-making'],
    ConflictResolution: ['conflict resolution', 'conflict management'],
    Negotiation: ['negotiation', 'negotiation skills'],
  };

  const normalized = normalizeSkillText(text);
  const detected: string[] = [];

  for (const [canonical, aliases] of Object.entries(skillAliases)) {
    const matched = aliases.some((alias) => {
      const normalizedAlias = normalizeSkillText(alias).trim();
      const escaped = escapeRegExp(normalizedAlias);

      return new RegExp(
        `(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`,
        'i',
      ).test(normalized);
    });

    if (matched) {
      detected.push(canonical);
    }
  }

  return dedupe(detected).slice(0, 80);
}

function normalizeSkillText(value: string) {
  return ` ${value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, '+')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/[./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function extractEducationEntries(text: string) {
  return extractEntryLines(text)
    .filter((line) =>
      /bachelor|master|bs|ms|bsc|msc|mba|phd|degree|diploma|university|college|school|certificate|hsc|ssc|intermediate|matric/i.test(
        line,
      ),
    )
    .slice(0, 12);
}

function extractExperienceEntries(text: string) {
  return extractEntryLines(text)
    .filter(
      (line) =>
        /experience|engineer|developer|consultant|manager|analyst|specialist|administrator|architect|company|worked|responsible|present|current|intern|executive|officer|coordinator|assistant|bank|llc|ltd|pvt/i.test(
          line,
        ) || /(?:19|20)\d{2}/.test(line),
    )
    .slice(0, 16);
}

function extractCertifications(text: string) {
  return extractEntryLines(text)
    .filter((line) =>
      /certified|certification|certificate|course|training|microsoft|aws|azure|google|scrum|pmp/i.test(
        line,
      ),
    )
    .slice(0, 12);
}

function extractLanguages(text: string) {
  const knownLanguages = [
    'English',
    'Urdu',
    'Arabic',
    'Hindi',
    'Punjabi',
    'Sindhi',
    'French',
    'German',
    'Spanish',
  ];

  const detected = knownLanguages.filter((language) =>
    new RegExp(`\\b${escapeRegExp(language)}\\b`, 'i').test(text),
  );

  const inline = splitInlineList(
    findLineValue(text, ['languages', 'language']),
  );

  return dedupe([...inline, ...detected]).slice(0, 10);
}

function extractEntryLines(text: string) {
  return dedupe(
    text
      .split(/\n|•/)
      .map((line) => cleanInlineValue(line))
      .filter((line) => line.length >= 5)
      .filter((line) => line.length <= 220),
  );
}

function inferValue(text: string, cues: string[]) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const cue of cues) {
      const pattern = new RegExp(
        `\\b${escapeRegExp(cue)}\\b\\s*[:\\-–—]\\s*(.+)$`,
        'i',
      );
      const match = line.match(pattern);

      if (match?.[1]) return cleanInlineValue(match[1]);
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
      if (value && value.trim().length > 0) return value.trim();
    }
  }

  return '';
}

function splitInlineList(value: string) {
  if (!value) return [];

  return dedupe(
    value
      .split(/,|\/|\||•/)
      .map((item) => cleanInlineValue(item))
      .filter(Boolean),
  );
}

function inferWorkMode(text: string) {
  if (/\bhybrid\b/i.test(text)) return 'Hybrid';
  if (/\bremote\b|\bwork from home\b|\bwfh\b/i.test(text)) return 'Remote';
  if (/\bonsite\b|\bon-site\b|\boffice based\b/i.test(text)) return 'Onsite';
  return '';
}

function inferRelocation(text: string) {
  if (/willing to relocate|open to relocate|relocation\s*:\s*yes/i.test(text)) {
    return 'Open to relocate';
  }

  if (/not willing to relocate|relocation\s*:\s*no/i.test(text)) {
    return 'Not open to relocate';
  }

  return inferValue(text, ['relocation', 'relocate']);
}

function createSectionSummary(text: string, maxLength: number) {
  const value = text.trim();
  if (!value) return '';
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength).trimEnd()}...`;
}

function createTextPreview(text: string) {
  return createSectionSummary(text, 1600);
}

function splitTextIntoPreviewPages(text: string) {
  const hardPages = text
    .split(/\f|\n\s*page\s+\d+\s*\n/i)
    .map((page) => page.trim())
    .filter(Boolean);

  if (hardPages.length > 1) return hardPages;

  const maxPageLength = 2800;
  const pages: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const slice = text.slice(cursor, cursor + maxPageLength);
    const breakPoint = slice.lastIndexOf('\n\n');
    const end =
      breakPoint > 1200 ? cursor + breakPoint : cursor + maxPageLength;

    pages.push(text.slice(cursor, end).trim());
    cursor = end;
  }

  return pages.filter(Boolean);
}

function buildDraftWarnings(
  draft: ResumeParseDraft,
  fieldConfidence: FieldConfidenceMap,
) {
  const warnings: string[] = [];

  if (!draft.email)
    warnings.push('Email could not be confidently extracted. Please review.');
  if (!draft.phone)
    warnings.push(
      'Phone number could not be confidently extracted. Please review.',
    );
  if (fieldConfidence.fullName < 70)
    warnings.push('Full name confidence is low. Verify first and last name.');
  if (fieldConfidence.location < 50)
    warnings.push(
      'Location confidence is low. Please confirm city and country.',
    );
  if (fieldConfidence.totalExperience < 50)
    warnings.push('Total experience could not be confidently calculated.');
  if (draft.phones.length > 2)
    warnings.push(
      'Multiple phone numbers detected. Confirm primary contact number.',
    );
  if (draft.emails.length > 2)
    warnings.push('Multiple emails detected. Confirm preferred email.');
  if (draft.skillList.length === 0)
    warnings.push(
      'Skills were not confidently detected. Please add key skills.',
    );
  if (fieldConfidence.education < 50)
    warnings.push('Education details look incomplete. Please review.');
  if (fieldConfidence.experience < 50)
    warnings.push('Experience details look incomplete. Please review.');
  if (fieldConfidence.designation < 40)
    warnings.push('Current designation could not be confidently detected.');

  return warnings;
}

function estimateFieldConfidence(draft: ResumeParseDraft): FieldConfidenceMap {
  return {
    fullName:
      draft.fullName &&
      draft.firstName &&
      draft.lastName &&
      draft.lastName !== 'Profile'
        ? 90
        : draft.fullName
          ? 55
          : 0,
    email: draft.email ? 95 : 0,
    phone: draft.phone ? 90 : 0,
    skills:
      draft.skillList.length >= 10
        ? 95
        : draft.skillList.length >= 5
          ? 80
          : draft.skillList.length > 0
            ? 60
            : 0,
    education:
      draft.educationEntries.length >= 2
        ? 85
        : draft.educationEntries.length === 1
          ? 65
          : draft.education
            ? 45
            : 0,
    experience:
      draft.experienceEntries.length >= 3
        ? 85
        : draft.experienceEntries.length >= 1
          ? 65
          : draft.experience
            ? 45
            : 0,
    location:
      draft.city && draft.country ? 90 : draft.city || draft.country ? 60 : 0,
    designation: draft.currentDesignation ? 70 : 0,
    employer: draft.currentEmployer ? 65 : 0,
    totalExperience: draft.totalYearsExperience ? 85 : 0,
  };
}

function estimateDraftConfidence(
  fieldConfidence: FieldConfidenceMap,
  warnings: string[],
) {
  const weightedScore =
    fieldConfidence.fullName * 0.13 +
    fieldConfidence.email * 0.14 +
    fieldConfidence.phone * 0.12 +
    fieldConfidence.skills * 0.14 +
    fieldConfidence.education * 0.09 +
    fieldConfidence.experience * 0.13 +
    fieldConfidence.location * 0.1 +
    fieldConfidence.designation * 0.05 +
    fieldConfidence.employer * 0.04 +
    fieldConfidence.totalExperience * 0.06;

  return Math.max(
    0,
    Math.min(100, Math.round(weightedScore - warnings.length * 2)),
  );
}

function cleanInlineValue(value: string) {
  return value
    .replace(/^[•\-–—|:]+/, '')
    .replace(/[|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function capitalizeWords(value: string) {
  return value
    .split(/\s+/)
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join(' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
