"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  DraggableAttributes,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { JobOpeningStatusBadge } from "./job-opening-status-badge";
import { RecruitmentStageBadge } from "./recruitment-stage-badge";
import {
  hasMatchCriteriaConfigured,
  JobOpeningMatchCriteria,
  RecruitmentStage,
} from "../types";

const stageOrder: RecruitmentStage[] = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "FINAL_REVIEW",
  "OFFER",
  "APPROVED",
  "HIRED",
  "ON_HOLD",
  "REJECTED",
  "WITHDRAWN",
];

type ApplicationItem = {
  id: string;
  stage: RecruitmentStage;
  appliedAt: string;
  matchScore?: number | null;
  candidate: {
    fullName: string;
    email: string;
  };
  jobOpening: {
    id: string;
    title: string;
    status: string;
    matchCriteria?: JobOpeningMatchCriteria | null;
  };
};

type RecruitmentApplicationsBoardProps = {
  applications: ApplicationItem[];
};

type BoardState = Record<RecruitmentStage, ApplicationItem[]>;

function buildBoardState(applications: ApplicationItem[]): BoardState {
  return stageOrder.reduce((accumulator, stage) => {
    accumulator[stage] = applications.filter(
      (application) => application.stage === stage,
    );
    return accumulator;
  }, {} as BoardState);
}

function findApplicationStage(
  board: BoardState,
  applicationId: string,
): RecruitmentStage | null {
  for (const stage of stageOrder) {
    if (board[stage].some((application) => application.id === applicationId)) {
      return stage;
    }
  }

  return null;
}

export function RecruitmentApplicationsBoard({
  applications,
}: RecruitmentApplicationsBoardProps) {
  const router = useRouter();
  const [board, setBoard] = useState<BoardState>(() => buildBoardState(applications));
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(null);
  const [savingApplicationId, setSavingApplicationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 6,
      },
    }),
  );

  const activeApplication = useMemo(() => {
    if (!activeApplicationId) {
      return null;
    }

    for (const stage of stageOrder) {
      const application = board[stage].find(
        (item) => item.id === activeApplicationId,
      );

      if (application) {
        return application;
      }
    }

    return null;
  }, [activeApplicationId, board]);

  function moveApplicationInBoard(
    currentBoard: BoardState,
    applicationId: string,
    targetStage: RecruitmentStage,
  ): BoardState {
    const sourceStage = findApplicationStage(currentBoard, applicationId);

    if (!sourceStage || sourceStage === targetStage) {
      return currentBoard;
    }

    const application = currentBoard[sourceStage].find(
      (item) => item.id === applicationId,
    );

    if (!application) {
      return currentBoard;
    }

    return {
      ...currentBoard,
      [sourceStage]: currentBoard[sourceStage].filter(
        (item) => item.id !== applicationId,
      ),
      [targetStage]: [
        { ...application, stage: targetStage },
        ...currentBoard[targetStage],
      ],
    };
  }

  async function persistStageChange(
    applicationId: string,
    stage: RecruitmentStage,
    previousBoard: BoardState,
  ) {
    try {
      setSavingApplicationId(applicationId);
      setError(null);

      const response = await fetch(`/api/applications/${applicationId}/stage`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setBoard(previousBoard);
        setError(data?.message ?? "Unable to move application stage.");
        return;
      }

      router.refresh();
    } catch {
      setBoard(previousBoard);
      setError("Unable to move application stage.");
    } finally {
      setSavingApplicationId(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveApplicationId(String(event.active.id));
    setError(null);
  }

  function handleDragCancel() {
    setActiveApplicationId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const applicationId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    setActiveApplicationId(null);

    if (!overId) {
      return;
    }

    const previousBoard = board;
    const sourceStage = findApplicationStage(previousBoard, applicationId);

    if (!sourceStage) {
      return;
    }

    const targetStage = stageOrder.includes(overId as RecruitmentStage)
      ? (overId as RecruitmentStage)
      : findApplicationStage(previousBoard, overId);

    if (!targetStage || sourceStage === targetStage) {
      return;
    }

    const nextBoard = moveApplicationInBoard(previousBoard, applicationId, targetStage);
    setBoard(nextBoard);
    void persistStageChange(applicationId, targetStage, previousBoard);
  }

  return (
    <section className="grid gap-4">
      {error ? (
        <div className="rounded-[24px] border border-danger/20 bg-danger/5 px-5 py-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <DndContext
        collisionDetection={closestCenter}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-start gap-4">
            {stageOrder.map((stage) => (
              <StageColumn
                key={stage}
                applications={board[stage]}
                isSaving={Boolean(
                  savingApplicationId &&
                    board[stage].some(
                      (application) => application.id === savingApplicationId,
                    ),
                )}
                stage={stage}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeApplication ? (
            <div className="w-[320px] rotate-[1deg] opacity-95">
              <ApplicationCard application={activeApplication} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function StageColumn({
  applications,
  isSaving,
  stage,
}: {
  applications: ApplicationItem[];
  isSaving: boolean;
  stage: RecruitmentStage;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: stage,
  });

  return (
    <article
      ref={setNodeRef}
      className={`flex h-[calc(100vh-240px)] w-[320px] shrink-0 flex-col rounded-[28px] border border-border bg-surface/95 shadow-sm transition ${
        isOver ? "border-accent/40 ring-2 ring-accent/15" : ""
      }`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-[28px] border-b border-border bg-surface/95 px-4 py-4 backdrop-blur">
        <RecruitmentStageBadge stage={stage} />
        <div className="flex items-center gap-2">
          {isSaving ? (
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Saving
            </span>
          ) : null}
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-muted shadow-sm">
            {applications.length}
          </span>
        </div>
      </div>

      <SortableContext
        items={applications.map((application) => application.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {applications.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border bg-white/60 px-4 py-8 text-center text-sm text-muted">
              Drop applications here
            </div>
          ) : (
            applications.map((application) => (
              <SortableApplicationCard
                key={application.id}
                application={application}
              />
            ))
          )}
        </div>
      </SortableContext>
    </article>
  );
}

function SortableApplicationCard({
  application,
}: {
  application: ApplicationItem;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <ApplicationCard
        application={application}
        attributes={attributes}
        dragging={isDragging}
        listeners={listeners}
      />
    </div>
  );
}

function ApplicationCard({
  application,
  attributes,
  dragging = false,
  listeners,
}: {
  application: ApplicationItem;
  attributes?: DraggableAttributes;
  dragging?: boolean;
  listeners?: any;
}) {
  const appliedDate = new Date(application.appliedAt).toLocaleDateString();

  return (
    <article
      className={`group grid gap-4 rounded-[24px] border border-border bg-white p-4 shadow-sm transition-all duration-200 ${
        dragging
          ? "scale-[1.01] cursor-grabbing shadow-xl ring-2 ring-accent/20"
          : "hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted transition ${
            dragging
              ? "cursor-grabbing"
              : "cursor-grab hover:border-accent/30 hover:bg-accent-soft/40 hover:text-foreground"
          }`}
          aria-label={`Drag ${application.candidate.fullName}`}
          {...attributes}
          {...listeners}
        >
          <span className="text-sm leading-none tracking-[-0.2em]">•••</span>
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <Link
            className="block truncate text-base font-semibold text-foreground transition hover:text-accent"
            href={`/dashboard/recruitment/applications/${application.id}`}
          >
            {application.candidate.fullName}
          </Link>
          <p className="truncate text-sm text-muted">
            {application.candidate.email}
          </p>
        </div>
      </div>

      <div className="grid gap-3 rounded-[20px] border border-border bg-surface/55 p-3">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Job opening
          </p>
          <Link
            className="block truncate text-sm font-medium text-foreground transition hover:text-accent"
            href={`/dashboard/recruitment/jobs/${application.jobOpening.id}`}
          >
            {application.jobOpening.title}
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Status
          </p>
          <JobOpeningStatusBadge status={application.jobOpening.status} />
        </div>
      </div>

      <div className="grid gap-2 rounded-[20px] border border-border bg-white/80 p-3">
        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-muted">
          <span>Applied</span>
          <span className="font-medium text-foreground">{appliedDate}</span>
        </div>

        {hasMatchCriteriaConfigured(application.jobOpening.matchCriteria) ? (
          <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-muted">
            <span>Match score</span>
            <span className="font-semibold text-foreground">
              {application.matchScore !== null &&
              application.matchScore !== undefined
                ? `${application.matchScore}%`
                : "Unavailable"}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-muted">
            <span>Match score</span>
            <span className="font-semibold text-muted">Not configured</span>
          </div>
        )}
      </div>
    </article>
  );
}
