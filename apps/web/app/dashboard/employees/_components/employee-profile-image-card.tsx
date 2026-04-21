"use client";

import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UserAvatar } from "../../_components/user-avatar";
import { EmployeeDocumentSummary } from "../types";

const CROP_PREVIEW_SIZE = 288;
const OUTPUT_SIZE = 512;
const MIN_SCALE = 1;
const MAX_SCALE = 3;

type EmployeeProfileImageCardProps = {
  employeeId: string;
  employeeName: string;
  profileImage: EmployeeDocumentSummary | null;
};

type ImageDraft = {
  file: File;
  previewUrl: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  imageWidth: number;
  imageHeight: number;
  baseScale: number;
};

export function EmployeeProfileImageCard({
  employeeId,
  employeeName,
  profileImage,
}: EmployeeProfileImageCardProps) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [avatarVersion, setAvatarVersion] = useState<string | null>(
    profileImage?.id ?? profileImage?.createdAt ?? null,
  );
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [firstName, lastName] = useMemo(() => {
    const parts = employeeName.split(" ").filter(Boolean);
    return [parts[0] ?? employeeName, parts.slice(1).join(" ")];
  }, [employeeName]);

  useEffect(() => {
    setAvatarVersion(profileImage?.id ?? profileImage?.createdAt ?? null);
  }, [profileImage?.createdAt, profileImage?.id]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Only PNG and JPEG profile images are supported.");
      event.target.value = "";
      return;
    }

    prepareDraft(file)
      .then((nextDraft) => {
        setDraft(nextDraft);
        setError(null);
      })
      .catch((draftError) => {
        setError(
          draftError instanceof Error
            ? draftError.message
            : "Unable to prepare the selected image.",
        );
      })
      .finally(() => {
        event.target.value = "";
      });
  }

  async function handleSaveCroppedImage() {
    if (!draft) return;

    setError(null);
    setIsUploading(true);

    try {
      const croppedBlob = await cropImageToBlob(draft);
      const formData = new FormData();
      formData.set(
        "file",
        new File([croppedBlob], normalizeFileName(draft.file.name), {
          type: "image/jpeg",
        }),
      );

      const response = await fetch(
        `/api/employees/${employeeId}/profile-image/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setError(data?.message ?? "Unable to upload profile image.");
        setIsUploading(false);
        return;
      }

      URL.revokeObjectURL(draft.previewUrl);
      setDraft(null);
      setAvatarVersion(`${Date.now()}`);
      setIsUploading(false);
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to process profile image.",
      );
      setIsUploading(false);
    }
  }

  function closeDraft() {
    if (draft) {
      URL.revokeObjectURL(draft.previewUrl);
    }
    setDraft(null);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!draft) return;

    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: draft.offsetX,
      originY: draft.offsetY,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draft || !dragState.current || dragState.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.current.startX;
    const deltaY = event.clientY - dragState.current.startY;

    setDraft((current) =>
      current
        ? clampDraftPosition({
            ...current,
            offsetX: dragState.current!.originX + deltaX,
            offsetY: dragState.current!.originY + deltaY,
          })
        : current,
    );
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Profile Image
        </p>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <UserAvatar
            cacheKey={avatarVersion}
            className="h-24 w-24 text-2xl"
            firstName={firstName}
            imageSrc={
              profileImage ? `/api/employees/${employeeId}/profile-image` : null
            }
            lastName={lastName}
            size="lg"
          />
          <div className="grid gap-3">
            <p className="text-sm text-muted">
              {profileImage
                ? `${profileImage.fileName} • ${formatBytes(profileImage.size)}`
                : "No profile image uploaded yet."}
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong">
                {profileImage ? "Change image" : "Upload image"}
                <input
                  accept="image/png,image/jpeg"
                  className="hidden"
                  disabled={isUploading}
                  onChange={handleFileChange}
                  type="file"
                />
              </label>
              {profileImage ? (
                <a
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  href={`/api/employees/${employeeId}/profile-image`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View image
                </a>
              ) : null}
            </div>
            {error ? (
              <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </article>

      {draft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Adjust profile image
                </h3>
                <p className="mt-2 text-sm text-muted">
                  Drag to position the image inside the circular frame. The saved
                  avatar now matches this preview exactly.
                </p>
              </div>
              <button
                className="rounded-full border border-border px-3 py-1 text-sm text-muted transition hover:text-foreground"
                onClick={closeDraft}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_240px]">
              <div className="flex justify-center">
                <div
                  className="relative h-72 w-72 cursor-grab overflow-hidden rounded-full border border-border bg-slate-100 active:cursor-grabbing"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <img
                    alt="Profile crop preview"
                    className="absolute left-0 top-0 max-w-none select-none"
                    draggable={false}
                    src={draft.previewUrl}
                    style={buildPreviewImageStyle(draft)}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-white/70" />
                </div>
              </div>

              <div className="grid gap-4">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">Zoom</span>
                  <input
                    className="w-full"
                    max={`${MAX_SCALE}`}
                    min={`${MIN_SCALE}`}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? clampDraftPosition({
                              ...current,
                              scale: Number(event.target.value),
                            })
                          : current,
                      )
                    }
                    step="0.05"
                    type="range"
                    value={draft.scale}
                  />
                </label>

                <p className="text-sm text-muted">
                  Tip: center the face in the circle. The final avatar updates
                  immediately across the profile shell after saving.
                </p>

                <div className="mt-auto flex flex-wrap gap-3">
                  <button
                    className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                    onClick={closeDraft}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
                    disabled={isUploading}
                    onClick={handleSaveCroppedImage}
                    type="button"
                  >
                    {isUploading ? "Saving..." : "Save image"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

async function cropImageToBlob(draft: ImageDraft) {
  const image = await loadImage(draft.previewUrl);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Your browser could not prepare the image crop.");
  }

  context.save();
  context.beginPath();
  context.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.scale(
    OUTPUT_SIZE / CROP_PREVIEW_SIZE,
    OUTPUT_SIZE / CROP_PREVIEW_SIZE,
  );

  const renderedWidth = image.width * draft.baseScale * draft.scale;
  const renderedHeight = image.height * draft.baseScale * draft.scale;
  const x = (CROP_PREVIEW_SIZE - renderedWidth) / 2 + draft.offsetX;
  const y = (CROP_PREVIEW_SIZE - renderedHeight) / 2 + draft.offsetY;
  context.drawImage(image, x, y, renderedWidth, renderedHeight);
  context.restore();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to finalize the cropped image."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.92,
    );
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load the selected image."));
    image.src = src;
  });
}

function normalizeFileName(originalName: string) {
  const baseName = originalName.replace(/\.[^.]+$/, "");
  return `${baseName || "profile-image"}.jpg`;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function prepareDraft(file: File): Promise<ImageDraft> {
  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(previewUrl);

    return {
      file,
      previewUrl,
      scale: 1.02,
      offsetX: 0,
      offsetY: 0,
      imageWidth: image.width,
      imageHeight: image.height,
      baseScale: Math.max(
        CROP_PREVIEW_SIZE / image.width,
        CROP_PREVIEW_SIZE / image.height,
      ),
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

function buildPreviewImageStyle(draft: ImageDraft) {
  const renderedWidth = draft.imageWidth * draft.baseScale * draft.scale;
  const renderedHeight = draft.imageHeight * draft.baseScale * draft.scale;
  const left = (CROP_PREVIEW_SIZE - renderedWidth) / 2 + draft.offsetX;
  const top = (CROP_PREVIEW_SIZE - renderedHeight) / 2 + draft.offsetY;

  return {
    width: `${renderedWidth}px`,
    height: `${renderedHeight}px`,
    transform: `translate(${left}px, ${top}px)`,
  };
}

function clampDraftPosition(draft: ImageDraft): ImageDraft {
  const renderedWidth = draft.imageWidth * draft.baseScale * draft.scale;
  const renderedHeight = draft.imageHeight * draft.baseScale * draft.scale;
  const maxOffsetX = Math.max(0, (renderedWidth - CROP_PREVIEW_SIZE) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - CROP_PREVIEW_SIZE) / 2);

  return {
    ...draft,
    scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, draft.scale)),
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, draft.offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, draft.offsetY)),
  };
}
