import type { LookupOption } from "@/app/components/ui/form-control";
import type { RuntimeRecordData } from "@/app/components/runtime";
import type { CandidateRecord } from "../types";

export function mapCandidateRuntimeRecord(
  candidate: CandidateRecord,
): RuntimeRecordData {
  return {
    ...candidate,
    applicationCount: candidate.applications.length,
    lastApplicationAt: latestApplicationDate(candidate),
    skills: listText(candidate.skills),
    certifications: listText(candidate.certifications),
    interests: listText(candidate.interests),
    hobbies: listText(candidate.hobbies),
    strengths: listText(candidate.strengths),
  };
}

export function candidateLookupDisplayValues(candidate: CandidateRecord) {
  return {
    nationalityCountryId: candidate.nationality ?? "",
    currentCountryId: candidate.currentCountry ?? "",
    currentStateProvinceId: candidate.currentStateProvince ?? "",
    currentCityId: candidate.currentCity ?? "",
  };
}

export function candidateLookupOptions(candidate: CandidateRecord) {
  return {
    nationalityCountryId: lookupOption(
      candidate.nationalityCountryId,
      candidate.nationality,
    ),
    currentCountryId: lookupOption(
      candidate.currentCountryId,
      candidate.currentCountry,
    ),
    currentStateProvinceId: lookupOption(
      candidate.currentStateProvinceId,
      candidate.currentStateProvince,
    ),
    currentCityId: lookupOption(candidate.currentCityId, candidate.currentCity),
  };
}

function listText(values?: readonly string[] | null) {
  return values?.filter(Boolean).join(", ") ?? "";
}

function latestApplicationDate(candidate: CandidateRecord) {
  const timestamps = candidate.applications
    .map((application) => application.appliedAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (!timestamps.length) return "";

  return new Date(Math.max(...timestamps)).toISOString();
}

function lookupOption(id?: string | null, name?: string | null): LookupOption[] {
  if (!id || !name) return [];

  return [{ id, name }];
}
