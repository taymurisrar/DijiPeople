"use client";

import { useRouter } from "next/navigation";
import { DragEvent, useMemo, useRef, useState } from "react";
import { SharedLookupOption } from "@/app/(authenticated)/_components/documents/types";
import { LookupOption } from "@/app/(authenticated)/employees/types";
import { TopAlert } from "@/app/components/notifications/top-alert";
import { Button } from "@/app/components/ui/button";
import { LookupField } from "@/app/components/ui/form-control";

type ParsedDraft = {
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName?: string;
  email: string;
  emails?: string[];
  phone: string;
  phones?: string[];
  linkedInUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  city: string;
  stateProvince: string;
  country: string;
  currentEmployer: string;
  currentDesignation: string;
  totalYearsExperience: string;
  skills: string;
  skillList?: string[];
  education: string;
  educationEntries?: string[];
  experience: string;
  experienceEntries?: string[];
  certifications?: string[];
  languages?: string[];
  expectedSalaryHint?: string;
  noticePeriodHint?: string;
  workModeHint?: string;
  relocationHint?: string;
  preferredLocationHint?: string;
};

type ParseStatus =
  | "idle"
  | "uploading"
  | "extracting"
  | "parsing"
  | "success"
  | "error";

type FieldConfidence = {
  fullName?: number;
  email?: number;
  phone?: number;
  skills?: number;
  education?: number;
  experience?: number;
  location?: number;
  designation?: number;
  employer?: number;
  totalExperience?: number;
};

type ParseUploadResponse = {
  fileName: string;
  fileType: "pdf" | "docx";
  extractedTextPreview?: string;
  extractedTextFull?: string;
  extractedTextPages?: string[];
  warnings?: string[];
  parserMetadata?: {
    parserVersion?: string;
    extractionConfidence?: number;
    fieldConfidence?: FieldConfidence;
  };
  candidateDraft: ParsedDraft;
  message?: string;
};

const acceptedTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const acceptedExtensions = [".pdf", ".docx"];

const isParsingStatus = (status: ParseStatus) =>
  status === "uploading" || status === "extracting" || status === "parsing";

export function CvUploadParseFlow({
  countries,
  documentTypes,
  documentCategories,
}: {
  countries: LookupOption[];
  documentTypes: SharedLookupOption[];
  documentCategories: SharedLookupOption[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [parserVersion, setParserVersion] = useState("");
  const [extractionConfidence, setExtractionConfidence] = useState<
    number | null
  >(null);
  const [fieldConfidence, setFieldConfidence] = useState<FieldConfidence>({});

  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parsedDraft, setParsedDraft] = useState<ParsedDraft | null>(null);

  const [rawPreview, setRawPreview] = useState("");
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [activePreviewPage, setActivePreviewPage] = useState(0);
  const [copySuccess, setCopySuccess] = useState("");

  const [source, setSource] = useState("LinkedIn");
  const [selectedCountryId, setSelectedCountryId] = useState("");

  const resumeDocumentTypeId = useMemo(() => {
    if (documentTypes.length === 0) {
      return "";
    }

    const resumeType = documentTypes.find(
      (item) =>
        item.name.toLowerCase().includes("resume") ||
        item.name.toLowerCase().includes("cv"),
    );

    return resumeType?.id ?? documentTypes[0].id;
  }, [documentTypes]);

  const resumeDocumentCategoryId = useMemo(() => {
    if (documentCategories.length === 0) {
      return "";
    }

    const resumeCategory = documentCategories.find((item) => {
      const name = item.name.toLowerCase();
      return (
        name.includes("resume") ||
        name.includes("cv") ||
        name.includes("candidate")
      );
    });

    return resumeCategory?.id ?? documentCategories[0].id;
  }, [documentCategories]);

  const parseStatusLabel = useMemo(() => {
    if (parseStatus === "uploading") return "Uploading resume...";
    if (parseStatus === "extracting") return "Extracting readable content...";
    if (parseStatus === "parsing") return "Parsing candidate fields...";
    if (parseStatus === "error") return "Resume parsing failed.";
    return null;
  }, [parseStatus]);

  const scoreLabel = useMemo(() => {
    if (extractionConfidence === null) {
      return "";
    }

    if (extractionConfidence >= 80) {
      return "Strong parse. Quick review should be enough.";
    }

    if (extractionConfidence >= 60) {
      return "Medium parse. Review weak fields before saving.";
    }

    return "Low parse. Manual review is recommended.";
  }, [extractionConfidence]);

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  function resetParseState() {
    setError(null);
    setSuccess(null);
    setWarnings([]);
    setParserVersion("");
    setExtractionConfidence(null);
    setFieldConfidence({});
    setParseStatus("idle");
    setParsedDraft(null);
    setRawPreview("");
    setPreviewPages([]);
    setActivePreviewPage(0);
    setCopySuccess("");
    setUploadProgress(0);
  }

  function setFile(file: File | null) {
    resetParseState();

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const isAllowedType =
      acceptedTypes.includes(file.type) ||
      acceptedExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext.toLowerCase()),
      );

    if (!isAllowedType) {
      setSelectedFile(null);
      setError("Unsupported file type. Please upload a PDF or DOCX resume.");
      return;
    }

    setSelectedFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    setFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function parseSelectedFile() {
    if (!selectedFile) {
      setError("Select a CV file first.");
      return;
    }

    setError(null);
    setSuccess(null);
    setWarnings([]);
    setFieldConfidence({});
    setCopySuccess("");
    setParseStatus("uploading");

    const progressStates: Array<ParseStatus> = [
      "uploading",
      "extracting",
      "parsing",
    ];
    let stateCursor = 0;

    const statusInterval = window.setInterval(() => {
      stateCursor = Math.min(stateCursor + 1, progressStates.length - 1);
      setParseStatus(progressStates[stateCursor]);
    }, 700);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);

      const response = await fetch("/api/candidates/parse-upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | ParseUploadResponse
        | { message?: string };

      if (!response.ok || !("candidateDraft" in payload)) {
        throw new Error(
          payload?.message ||
            "We couldn’t extract readable content from this file. Please upload a valid PDF or DOCX resume.",
        );
      }

      setParsedDraft({
        ...payload.candidateDraft,
        firstName: payload.candidateDraft.firstName || "",
        middleName: payload.candidateDraft.middleName || "",
        lastName: payload.candidateDraft.lastName || "",
        fullName: payload.candidateDraft.fullName || "",
        email: payload.candidateDraft.email || "",
        emails: payload.candidateDraft.emails ?? [],
        phone: payload.candidateDraft.phone || "",
        phones: payload.candidateDraft.phones ?? [],
        linkedInUrl: payload.candidateDraft.linkedInUrl || "",
        portfolioUrl: payload.candidateDraft.portfolioUrl || "",
        githubUrl: payload.candidateDraft.githubUrl || "",
        city: payload.candidateDraft.city || "",
        stateProvince: payload.candidateDraft.stateProvince || "",
        country: payload.candidateDraft.country || "",
        currentEmployer: payload.candidateDraft.currentEmployer || "",
        currentDesignation: payload.candidateDraft.currentDesignation || "",
        totalYearsExperience: payload.candidateDraft.totalYearsExperience || "",
        skills:
          payload.candidateDraft.skills ||
          payload.candidateDraft.skillList?.join(", ") ||
          "",
        skillList: payload.candidateDraft.skillList ?? [],
        education: payload.candidateDraft.education || "",
        educationEntries: payload.candidateDraft.educationEntries ?? [],
        experience: payload.candidateDraft.experience || "",
        experienceEntries: payload.candidateDraft.experienceEntries ?? [],
        certifications: payload.candidateDraft.certifications ?? [],
        languages: payload.candidateDraft.languages ?? [],
        expectedSalaryHint: payload.candidateDraft.expectedSalaryHint || "",
        noticePeriodHint: payload.candidateDraft.noticePeriodHint || "",
        workModeHint: payload.candidateDraft.workModeHint || "",
        relocationHint: payload.candidateDraft.relocationHint || "",
        preferredLocationHint:
          payload.candidateDraft.preferredLocationHint || "",
      });

      const parsedCountryId = findCountryIdByName(
        countries,
        payload.candidateDraft.country,
      );
      if (parsedCountryId) {
        setSelectedCountryId(parsedCountryId);
      }

      const fullPreview =
        payload.extractedTextFull ||
        payload.extractedTextPreview ||
        payload.extractedTextPages?.join("\n\n--- Page Break ---\n\n") ||
        "";

      setRawPreview(payload.extractedTextPreview ?? fullPreview);
      setPreviewPages(
        payload.extractedTextPages?.length
          ? payload.extractedTextPages
          : fullPreview
            ? [fullPreview]
            : [],
      );
      setActivePreviewPage(0);

      setWarnings(payload.warnings ?? []);
      setParserVersion(payload.parserMetadata?.parserVersion ?? "");
      setFieldConfidence(payload.parserMetadata?.fieldConfidence ?? {});
      setExtractionConfidence(
        typeof payload.parserMetadata?.extractionConfidence === "number"
          ? payload.parserMetadata.extractionConfidence
          : null,
      );

      setParseStatus("success");
      setSuccess(
        "CV parsed into a reviewable draft. Please confirm details before saving.",
      );
    } catch (parseError) {
      setParseStatus("error");
      setParsedDraft(null);
      setRawPreview("");
      setPreviewPages([]);
      setActivePreviewPage(0);
      setWarnings([]);
      setParserVersion("");
      setFieldConfidence({});
      setExtractionConfidence(null);
      setError(
        parseError instanceof Error
          ? parseError.message
          : "We couldn’t extract readable content from this file. Please upload a valid PDF or DOCX resume.",
      );
    } finally {
      window.clearInterval(statusInterval);
    }
  }

  async function copyCurrentPreviewPage() {
    const pageText = previewPages[activePreviewPage] ?? rawPreview;

    if (!pageText) {
      return;
    }

    await navigator.clipboard.writeText(pageText);
    setCopySuccess("Copied current CV page.");
    window.setTimeout(() => setCopySuccess(""), 1800);
  }

  async function copyFullPreview() {
    const fullText =
      previewPages.join("\n\n--- Page Break ---\n\n") || rawPreview;

    if (!fullText) {
      return;
    }

    await navigator.clipboard.writeText(fullText);
    setCopySuccess("Copied full CV text.");
    window.setTimeout(() => setCopySuccess(""), 1800);
  }

  async function saveCandidate() {
    if (!parsedDraft) {
      setError("Parse the CV first, then review fields before saving.");
      return;
    }

    if (!parsedDraft.firstName.trim() || !parsedDraft.lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }

    if (!parsedDraft.email.trim() || !parsedDraft.phone.trim()) {
      setError("Email and phone are required before saving candidate.");
      return;
    }

    if (!resumeDocumentTypeId) {
      setError("No document type is configured for resume upload.");
      return;
    }

    if (!resumeDocumentCategoryId && documentCategories.length > 0) {
      setError("No document category is configured for resume upload.");
      return;
    }

    if (!selectedFile) {
      setError("Please attach the CV file before saving.");
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSaving(true);
    setUploadProgress(0);

    try {
      const countryLookup = countries.find(
        (item) => item.id === selectedCountryId,
      );

      const createResponse = await fetch("/api/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: parsedDraft.firstName.trim(),
          lastName: parsedDraft.lastName.trim(),
          email: parsedDraft.email.trim(),
          phone: parsedDraft.phone.trim(),
          source,
          currentStatus: "APPLIED",
          currentCountryId: emptyToUndefined(selectedCountryId),
          addressArea: emptyToUndefined(
            [
              parsedDraft.city,
              parsedDraft.stateProvince,
              countryLookup?.name ?? parsedDraft.country,
            ]
              .filter((value) => Boolean(value && value.trim().length > 0))
              .join(", "),
          ),
          currentEmployer: emptyToUndefined(parsedDraft.currentEmployer),
          currentDesignation: emptyToUndefined(parsedDraft.currentDesignation),
          totalYearsExperience: toNumber(parsedDraft.totalYearsExperience),
          noticePeriodDays: parseNoticePeriodDays(parsedDraft.noticePeriodHint),
          preferredWorkMode: normalizeWorkMode(parsedDraft.workModeHint),
          preferredLocation: emptyToUndefined(
            parsedDraft.preferredLocationHint ||
              [parsedDraft.city, countryLookup?.name ?? parsedDraft.country]
                .filter((value) => Boolean(value && value.trim().length > 0))
                .join(", "),
          ),
          willingToRelocate: parseRelocation(parsedDraft.relocationHint),
          skills: csvToArray(parsedDraft.skills),
          certifications: parsedDraft.certifications ?? [],
          educationRecords: buildEducationRecords(parsedDraft),
          linkedInUrl: emptyToUndefined(parsedDraft.linkedInUrl ?? ""),
          portfolioUrl: emptyToUndefined(parsedDraft.portfolioUrl ?? ""),
          otherProfileUrl: emptyToUndefined(parsedDraft.githubUrl ?? ""),
          profileSummary: emptyToUndefined(
            [
              parsedDraft.experience,
              parsedDraft.education,
              parsedDraft.workModeHint
                ? `Preferred work mode: ${parsedDraft.workModeHint}`
                : "",
              parsedDraft.relocationHint
                ? `Relocation: ${parsedDraft.relocationHint}`
                : "",
              parsedDraft.preferredLocationHint
                ? `Preferred locations: ${parsedDraft.preferredLocationHint}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          ),
          recruiterNotes: emptyToUndefined(parsedDraft.experience),
          hrNotes: emptyToUndefined(parsedDraft.education),
        }),
      });

      const createdCandidate = (await createResponse.json()) as {
        id?: string;
        message?: string;
      } | null;

      if (!createResponse.ok || !createdCandidate?.id) {
        throw new Error(
          createdCandidate?.message ?? "Unable to create candidate.",
        );
      }

      const candidateId = createdCandidate.id;

      const uploadResult = await uploadResumeForCandidate({
        candidateId,
        documentTypeId: resumeDocumentTypeId,
        documentCategoryId: resumeDocumentCategoryId || undefined,
        file: selectedFile,
        onProgress: setUploadProgress,
      });

      const registerResponse = await fetch(
        `/api/candidates/${candidateId}/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Resume",
            kind: "resume",
            fileName: selectedFile.name,
            contentType: selectedFile.type || uploadResult.mimeType,
            fileSizeBytes: selectedFile.size,
            storageKey: uploadResult.storageKey,
            isPrimaryResume: true,
            sourceChannel: source,
            parserVersion: parserVersion || "resume-parser-v4",
            parsingStatus: "SUCCEEDED",
            extractionConfidence:
              extractionConfidence !== null
                ? extractionConfidence.toFixed(2)
                : undefined,
            parsingWarnings: warnings,
          }),
        },
      );

      const registeredCandidate = (await registerResponse.json()) as {
        message?: string;
        documents?: Array<{
          id: string;
          fileName: string;
          storageKey?: string | null;
          createdAt?: string;
        }>;
      } | null;

      if (!registerResponse.ok) {
        throw new Error(
          registeredCandidate?.message ??
            "Candidate saved but resume link failed.",
        );
      }

      const linkedDocumentId =
        registeredCandidate?.documents?.find(
          (item) =>
            item.storageKey === uploadResult.storageKey ||
            item.fileName === selectedFile.name,
        )?.id ?? registeredCandidate?.documents?.[0]?.id;

      if (linkedDocumentId) {
        await fetch(
          `/api/candidates/${candidateId}/documents/${linkedDocumentId}/parse`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parserKey: "provider-neutral" }),
          },
        );
      }

      router.push(`/recruitment/candidates/${candidateId}`);
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message.includes("already in use")
            ? "A matching candidate already exists. The resume was attached to the resolved profile instead of creating a duplicate."
            : saveError.message
          : "Unable to save candidate from CV.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <h4 className="text-2xl font-semibold text-foreground">
          Upload resume
        </h4>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Choose a file, parse it, then review the draft.
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted">
          Accepted file types: PDF, DOCX
        </p>

        <div
          className={`mt-5 grid gap-4 rounded-[20px] border-2 border-dashed p-6 transition ${
            isDragging
              ? "border-accent bg-accent-soft/50"
              : "border-border bg-white/70"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={handleDrop}
          /*
           * Drag-and-drop is a mouse convenience layered over the file picker
           * button inside this zone — the copy above even says so. The zone
           * itself activates nothing, so it is presentation; the accessible
           * route is the button, which is already reachable. BUG-0043.
           */
          role="presentation"
        >
          <div>
            <p className="font-medium text-foreground">
              {selectedFile ? selectedFile.name : "Drag and drop CV here"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {selectedFile
                ? `${Math.round(selectedFile.size / 1024)} KB`
                : "or use the file picker button below"}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={triggerFilePicker}
              type="button"
            >
              Choose file
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={
                !selectedFile || isSaving || isParsingStatus(parseStatus)
              }
              loading={isParsingStatus(parseStatus)}
              loadingText="Parsing..."
              onClick={parseSelectedFile}
              type="button"
            >
              Parse CV
            </Button>
          </div>

          <input
            ref={fileInputRef}
            accept=".pdf,.docx"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </div>

        {parseStatusLabel ? (
          <p className="mt-4 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-muted">
            {parseStatusLabel}
          </p>
        ) : null}

        {isSaving ? (
          <div className="mt-4 rounded-2xl border border-border bg-white px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              Uploading resume...
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.min(100, uploadProgress)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              {Math.round(uploadProgress)}%
            </p>
          </div>
        ) : null}
      </div>

      {parsedDraft ? (
        <div className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2">
          <h4 className="text-2xl font-semibold text-foreground md:col-span-2">
            Review Parsed Candidate Data
          </h4>
          <p className="text-sm text-muted md:col-span-2">
            Correct any fields before final save. Parsing is a draft, not a
            final truth.
          </p>

          {extractionConfidence !== null ? (
            <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 md:col-span-2 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  Parsing Score
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  {Math.round(extractionConfidence)}%
                </p>
                <p className="mt-1 text-xs text-muted">{scoreLabel}</p>
                {parserVersion ? (
                  <p className="mt-2 text-[11px] text-muted">
                    Parser: {parserVersion}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
                <ConfidencePill label="Name" value={fieldConfidence.fullName} />
                <ConfidencePill label="Email" value={fieldConfidence.email} />
                <ConfidencePill label="Phone" value={fieldConfidence.phone} />
                <ConfidencePill
                  label="Location"
                  value={fieldConfidence.location}
                />
                <ConfidencePill
                  label="Experience"
                  value={fieldConfidence.totalExperience}
                />
                <ConfidencePill label="Skills" value={fieldConfidence.skills} />
              </div>
            </div>
          ) : null}

          <Field
            label="Source"
            value={source}
            onChange={setSource}
            asSelect
            options={[
              "LinkedIn",
              "WhatsApp",
              "Referral / Contact",
              "Email",
              "Careers Page",
              "Recruitment Agency",
              "Walk-in",
              "Other",
            ]}
          />

          <Field
            label="Country"
            value={selectedCountryId}
            onChange={setSelectedCountryId}
            asLookup
            lookupOptions={countries.map((country) => ({
              id: country.id,
              name: country.name,
            }))}
          />

          <Field
            label="First name"
            value={parsedDraft.firstName}
            confidence={fieldConfidence.fullName}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, firstName: value } : current,
              )
            }
          />

          <Field
            label="Last name"
            value={parsedDraft.lastName}
            confidence={fieldConfidence.fullName}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, lastName: value } : current,
              )
            }
          />

          <Field
            label="Email"
            value={parsedDraft.email}
            confidence={fieldConfidence.email}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, email: value } : current,
              )
            }
          />

          <Field
            label="Phone"
            value={parsedDraft.phone}
            confidence={fieldConfidence.phone}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, phone: value } : current,
              )
            }
          />

          <Field
            label="City"
            value={parsedDraft.city}
            confidence={fieldConfidence.location}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, city: value } : current,
              )
            }
          />

          <Field
            label="State / Province"
            value={parsedDraft.stateProvince}
            confidence={fieldConfidence.location}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, stateProvince: value } : current,
              )
            }
          />

          <Field
            label="Country (text)"
            value={parsedDraft.country}
            confidence={fieldConfidence.location}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, country: value } : current,
              )
            }
          />

          <Field
            label="Current Employer"
            value={parsedDraft.currentEmployer}
            confidence={fieldConfidence.employer}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, currentEmployer: value } : current,
              )
            }
          />

          <Field
            label="Current Designation"
            value={parsedDraft.currentDesignation}
            confidence={fieldConfidence.designation}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, currentDesignation: value } : current,
              )
            }
          />

          <Field
            label="Total Years of Experience"
            value={parsedDraft.totalYearsExperience}
            confidence={fieldConfidence.totalExperience}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, totalYearsExperience: value } : current,
              )
            }
          />

          <Field
            label="Preferred Work Mode"
            value={parsedDraft.workModeHint ?? ""}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, workModeHint: value } : current,
              )
            }
            asSelect
            options={["Hybrid", "Remote", "Onsite"]}
          />

          <Field
            label="Preferred Locations"
            value={parsedDraft.preferredLocationHint ?? ""}
            onChange={(value) =>
              setParsedDraft((current) =>
                current
                  ? { ...current, preferredLocationHint: value }
                  : current,
              )
            }
          />

          <Field
            label="Relocation"
            value={parsedDraft.relocationHint ?? ""}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, relocationHint: value } : current,
              )
            }
            asSelect
            options={["Open to relocate", "Not open to relocate"]}
          />

          <Field
            label="LinkedIn URL"
            value={parsedDraft.linkedInUrl ?? ""}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, linkedInUrl: value } : current,
              )
            }
          />

          <Field
            className="md:col-span-2"
            label="Skills (comma separated)"
            value={parsedDraft.skills}
            confidence={fieldConfidence.skills}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, skills: value } : current,
              )
            }
            asTextarea
          />

          <Field
            className="md:col-span-2"
            label="Education"
            value={parsedDraft.education}
            confidence={fieldConfidence.education}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, education: value } : current,
              )
            }
            asTextarea
          />

          <Field
            className="md:col-span-2"
            label="Experience"
            value={parsedDraft.experience}
            confidence={fieldConfidence.experience}
            onChange={(value) =>
              setParsedDraft((current) =>
                current ? { ...current, experience: value } : current,
              )
            }
            asTextarea
          />

          {parsedDraft.certifications?.length ? (
            <ReadonlyList
              title="Detected Certifications"
              items={parsedDraft.certifications}
            />
          ) : null}

          {parsedDraft.languages?.length ? (
            <ReadonlyList
              title="Detected Languages"
              items={parsedDraft.languages}
            />
          ) : null}

          {warnings.length > 0 ? (
            <div className="md:col-span-2">
              <TopAlert
                description={warnings.join(" ")}
                title="Review parser warnings"
                variant="warning"
              />
            </div>
          ) : null}

          {previewPages.length > 0 ? (
            <div className="rounded-2xl border border-border bg-white/90 p-4 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">
                    Full Copyable CV Preview
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Page {activePreviewPage + 1} of {previewPages.length}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActivePreviewPage((page) => Math.max(0, page - 1))
                    }
                    disabled={activePreviewPage === 0}
                    className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-foreground disabled:opacity-50"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setActivePreviewPage((page) =>
                        Math.min(previewPages.length - 1, page + 1),
                      )
                    }
                    disabled={activePreviewPage >= previewPages.length - 1}
                    className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-foreground disabled:opacity-50"
                  >
                    Next
                  </button>

                  <button
                    type="button"
                    onClick={copyCurrentPreviewPage}
                    className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-foreground"
                  >
                    Copy Page
                  </button>

                  <button
                    type="button"
                    onClick={copyFullPreview}
                    className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white"
                  >
                    Copy Full CV
                  </button>
                </div>
              </div>

              {copySuccess ? (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {copySuccess}
                </p>
              ) : null}

              <textarea
                readOnly
                value={previewPages[activePreviewPage] ?? ""}
                className="mt-4 min-h-[420px] w-full rounded-2xl border border-border bg-slate-50 px-4 py-3 font-mono text-xs leading-6 text-slate-700 outline-none"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-white/90 p-4 text-sm text-muted md:col-span-2">
              No readable preview is available for this file, but parsed fields
              can still be reviewed and edited.
            </div>
          )}

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <button
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
              disabled={isSaving}
              onClick={saveCandidate}
              type="button"
            >
              {isSaving ? "Saving..." : "Save Candidate"}
            </button>
          </div>
        </div>
      ) : null}

      {success ? (
        <TopAlert title="CV parsed" description={success} variant="success" />
      ) : null}

      {error ? (
        <TopAlert
          title="CV upload needs attention"
          description={error}
          variant="error"
        />
      ) : null}
    </section>
  );
}

async function uploadResumeForCandidate({
  candidateId,
  documentTypeId,
  documentCategoryId,
  file,
  onProgress,
}: {
  candidateId: string;
  documentTypeId: string;
  documentCategoryId?: string;
  file: File;
  onProgress: (value: number) => void;
}) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("entityType", "CANDIDATE");
  formData.set("entityId", candidateId);
  formData.set("documentTypeId", documentTypeId);

  if (documentCategoryId) {
    formData.set("documentCategoryId", documentCategoryId);
  }

  formData.set("title", "Resume");
  formData.set("description", "Uploaded through CV intake flow");

  return new Promise<{ storageKey?: string | null; mimeType?: string | null }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/documents/upload");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        onProgress((event.loaded / event.total) * 100);
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          return;
        }

        let data: {
          message?: string;
          storageKey?: string | null;
          mimeType?: string | null;
        } | null = null;

        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve({
            storageKey: data?.storageKey ?? null,
            mimeType: data?.mimeType ?? null,
          });
          return;
        }

        reject(new Error(data?.message ?? "Resume upload failed."));
      };

      xhr.onerror = () => reject(new Error("Resume upload failed."));
      xhr.send(formData);
    },
  );
}

function csvToArray(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : undefined;
}

function parseNoticePeriodDays(value?: string) {
  if (!value) return undefined;
  const match = value.match(/\d+/);
  return match?.[0] ? Number(match[0]) : undefined;
}

function normalizeWorkMode(value?: string) {
  if (!value) return undefined;
  if (/hybrid/i.test(value)) return "HYBRID";
  if (/remote|work from home|wfh/i.test(value)) return "REMOTE";
  if (/onsite|on-site|office/i.test(value)) return "OFFICE";
  return undefined;
}

function parseRelocation(value?: string) {
  if (!value) return undefined;
  if (/not|no/i.test(value)) return false;
  if (/open|yes|willing/i.test(value)) return true;
  return undefined;
}

function findCountryIdByName(countries: LookupOption[], countryName?: string) {
  const normalized = normalizeCountryName(countryName ?? "");
  if (!normalized) return "";

  return (
    countries.find(
      (country) => normalizeCountryName(country.name) === normalized,
    )?.id ?? ""
  );
}

function normalizeCountryName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (
    ["uae", "u.a.e.", "emirates", "united arab emirates"].includes(normalized)
  ) {
    return "united arab emirates";
  }
  if (["usa", "us", "u.s.", "u.s.a.", "america"].includes(normalized)) {
    return "united states";
  }
  return normalized;
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildEducationRecords(parsedDraft: ParsedDraft) {
  const entries =
    parsedDraft.educationEntries?.length
      ? parsedDraft.educationEntries
      : parsedDraft.education
          .split(/\n+/)
          .map((entry) => entry.trim())
          .filter(Boolean);

  return entries.flatMap((entry) => {
    const degreeTitle = extractDegreeTitle(entry);
    if (!degreeTitle) return [];

    return [
      {
        institutionName: extractInstitutionName(entry, degreeTitle),
        degreeTitle,
        fieldOfStudy: extractFieldOfStudy(entry),
        country: extractEducationCountry(entry),
        notes: entry,
      },
    ];
  });
}

function extractDegreeTitle(value: string) {
  const match = value.match(
    /(ph\.?d|doctorate|m\.?phil|master(?:'s)?|msc|mba|bachelor(?:'s)?|b\.?s\.?|bsc|diploma|high school|intermediate)(?:\s+(?:of|in)\s+[^,;\n\d]+)?/i,
  );
  if (!match) return "";

  const normalized = match[0].trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  if (lower.includes("ph") || lower.includes("doctor")) return "PhD";
  if (lower.includes("mphil") || lower.includes("m.phil")) return "MPhil";
  if (lower.includes("b.s") || lower.includes("bsc")) return "Bachelor's";
  if (lower.includes("diploma")) return "Diploma";
  if (lower.includes("high school") || lower.includes("intermediate")) {
    return "High School";
  }

  return normalized;
}

function extractInstitutionName(value: string, degreeTitle: string) {
  const degreeIndex = value.toLowerCase().indexOf(degreeTitle.toLowerCase());
  const institution =
    degreeIndex > 0 ? value.slice(0, degreeIndex).trim().replace(/[-,]+$/, "") : "";

  return institution || "Not captured";
}

function extractFieldOfStudy(value: string) {
  const match = value.match(/\b(?:in|of)\s+([^,;\n\d]+)/i);
  return match?.[1]?.trim() || undefined;
}

function extractEducationCountry(value: string) {
  for (const country of ["Pakistan", "United Arab Emirates", "UAE"]) {
    if (value.toLowerCase().includes(country.toLowerCase())) {
      return country === "UAE" ? "United Arab Emirates" : country;
    }
  }

  return undefined;
}

function Field({
  asLookup = false,
  asSelect = false,
  asTextarea = false,
  className = "",
  confidence,
  label,
  lookupOptions = [],
  onChange,
  optionFormatter,
  optionValueFormatter,
  options = [],
  value,
}: {
  asLookup?: boolean;
  asSelect?: boolean;
  asTextarea?: boolean;
  className?: string;
  confidence?: number;
  label: string;
  lookupOptions?: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
  optionFormatter?: (value: string) => string;
  optionValueFormatter?: (value: string) => string;
  options?: string[];
  value: string;
}) {
  if (asLookup) {
    return (
      <LookupField
        className={className}
        label={label}
        onChange={onChange}
        options={lookupOptions}
        placeholder="Select record"
        value={value}
      />
    );
  }

  return (
    <label className={`space-y-2 text-sm ${className}`}>
      <span className="flex items-center justify-between gap-2 font-medium text-foreground">
        <span>{label}</span>
        {typeof confidence === "number" ? (
          <ConfidenceBadge value={confidence} />
        ) : null}
      </span>

      {asSelect ? (
        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select</option>
          {options.map((option) => (
            <option
              key={option}
              value={
                optionValueFormatter ? optionValueFormatter(option) : option
              }
            >
              {optionFormatter ? optionFormatter(option) : option}
            </option>
          ))}
        </select>
      ) : asTextarea ? (
        <textarea
          className="min-h-24 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        value >= 80
          ? "bg-emerald-100 text-emerald-700"
          : value >= 60
            ? "bg-amber-100 text-amber-700"
            : "bg-red-100 text-red-700"
      }`}
    >
      {value}%
    </span>
  );
}

function ConfidencePill({ label, value }: { label: string; value?: number }) {
  const score = typeof value === "number" ? value : 0;

  return (
    <div className="rounded-xl border border-border bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          score >= 80
            ? "text-emerald-700"
            : score >= 60
              ? "text-amber-700"
              : "text-red-700"
        }`}
      >
        {score}%
      </p>
    </div>
  );
}

function ReadonlyList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 md:col-span-2">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-border bg-slate-50 px-3 py-1 text-xs text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
