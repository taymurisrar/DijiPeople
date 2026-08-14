"use client";

import { useMemo } from "react";
import { StandardModuleRecordPage } from "@/app/components/runtime";
import type { RuntimeTabContent } from "@/app/components/metadata/runtime-metadata-form-renderer";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import type { RuntimeRecordData } from "@/app/components/runtime/module-runtime-ui.types";
import type { WorkSiteReadinessPayload } from "../../_lib/work-site-configuration";
import { WORK_SITE_SECTION_IDS } from "../../_lib/work-site-form-sections";
import { WorkSiteAttendancePolicySection } from "./work-site-attendance-policy-section";
import {
  WorkSiteAccuracySection,
  WorkSiteGeofenceSection,
  WorkSiteTestLocationSection,
} from "./work-site-location-sections";
import {
  WorkSiteAdvancedSection,
  WorkSiteEffectivePeriodSection,
} from "./work-site-more-sections";
import { WorkSiteOverview, WorkSiteRelatedRecords } from "./work-site-overview";

/**
 * The Work Site record page.
 *
 * Deliberately NOT a second Work Site module: it renders the same runtime record
 * page every settings record uses, and only substitutes purpose-built bodies for
 * the sections a grid of fields cannot express. Those bodies read and write the
 * same draft values as the generic fields, so there is exactly one save, one
 * validation pass and one existing API endpoint behind the whole screen.
 *
 * THE SUMMARY IS A SECTION, NOT A BANNER. It used to be pinned above the tab
 * strip, which meant every tab carried the operational summary and the Summary
 * tab then showed the same facts a second time. It now lives on the Summary tab
 * like any other section, and appears exactly once.
 *
 * This component exists on the client because a server component cannot hand a
 * render function across the boundary, and the custom sections need the live
 * draft values rather than a snapshot.
 */
export function WorkSiteRecordPage({
  activeForm,
  mode,
  readiness,
  readinessError,
  record,
  recordId,
  runtime,
  spec,
  title,
}: {
  readonly activeForm: FormMetadata | null;
  readonly mode: "create" | "read" | "edit";
  readonly readiness: WorkSiteReadinessPayload | null;
  readonly readinessError?: string | null;
  readonly record: RuntimeRecordData;
  readonly recordId?: string;
  readonly runtime: ModuleRuntimeContext;
  readonly spec: StandardModuleRuntimeSpec;
  readonly title?: string;
}) {
  const workSiteName =
    typeof record.name === "string" ? record.name : (readiness?.workSite.name ?? "");

  const sectionContent = useMemo<Readonly<Record<string, RuntimeTabContent>>>(
    () => ({
      [WORK_SITE_SECTION_IDS.overview]: () =>
        mode === "create" ? (
          <p className="text-sm text-muted">
            The operational summary and readiness checks appear once this work
            site has been saved.
          </p>
        ) : (
          <WorkSiteOverview error={readinessError} readiness={readiness} />
        ),
      [WORK_SITE_SECTION_IDS.geofence]: (context) => (
        <WorkSiteGeofenceSection context={context} readiness={readiness} />
      ),
      [WORK_SITE_SECTION_IDS.accuracy]: (context) => (
        <WorkSiteAccuracySection context={context} readiness={readiness} />
      ),
      [WORK_SITE_SECTION_IDS.testLocation]: (context) => (
        <WorkSiteTestLocationSection context={context} readiness={readiness} />
      ),
      [WORK_SITE_SECTION_IDS.attendancePolicy]: (context) => (
        <WorkSiteAttendancePolicySection
          context={context}
          readiness={readiness}
          workSiteName={workSiteName}
        />
      ),
      [WORK_SITE_SECTION_IDS.related]: () => (
        <WorkSiteRelatedRecords readiness={readiness} />
      ),
      [WORK_SITE_SECTION_IDS.effectivePeriod]: (context) => (
        <WorkSiteEffectivePeriodSection context={context} />
      ),
      [WORK_SITE_SECTION_IDS.advanced]: (context) => (
        <WorkSiteAdvancedSection context={context} readiness={readiness} />
      ),
    }),
    [mode, readiness, readinessError, workSiteName],
  );

  return (
    <StandardModuleRecordPage
      activeForm={activeForm}
      mode={mode}
      record={record}
      recordId={recordId}
      runtime={runtime}
      sectionContent={sectionContent}
      spec={spec}
      title={title}
    />
  );
}
