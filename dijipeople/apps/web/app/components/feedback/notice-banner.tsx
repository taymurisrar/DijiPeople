import * as React from "react";
import type { ReactNode } from "react";
import type { NoticeAction, NoticeTone } from "./notice-types";

type NoticeBannerProps = {
  title: string;
  description?: string;
  tone?: NoticeTone;
  icon?: ReactNode;
  borderColorClassName?: string;
  actions?: NoticeAction[];
  onDismiss?: () => void;
  className?: string;
};

function getToneClasses(tone: NoticeTone) {
  switch (tone) {
    case "info":
      return {
        container:
          "border-sky-200 bg-sky-50 text-sky-900",
        description: "text-sky-800/90",
        iconWrap: "bg-sky-100 text-sky-700",
      };
    case "success":
      return {
        container:
          "border-emerald-200 bg-emerald-50 text-emerald-900",
        description: "text-emerald-800/90",
        iconWrap: "bg-emerald-100 text-emerald-700",
      };
    case "warning":
      return {
        container:
          "border-amber-200 bg-amber-50 text-amber-900",
        description: "text-amber-800/90",
        iconWrap: "bg-amber-100 text-amber-700",
      };
    case "danger":
      return {
        container:
          "border-red-200 bg-red-50 text-red-900",
        description: "text-red-800/90",
        iconWrap: "bg-red-100 text-red-700",
      };
    case "neutral":
    default:
      return {
        container:
          "border-border bg-white text-foreground",
        description: "text-muted",
        iconWrap: "bg-surface text-foreground",
      };
  }
}

function ActionButton({
  label,
  onClick,
  variant = "secondary",
}: NoticeAction) {
  const className =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-strong"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-700"
        : variant === "ghost"
          ? "bg-transparent text-foreground hover:bg-surface"
          : "bg-white text-foreground border border-border hover:bg-surface";

  return (
    <button
      className={`inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium transition ${className}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function NoticeBanner({
  title,
  description,
  tone = "neutral",
  icon,
  borderColorClassName,
  actions,
  onDismiss,
  className,
}: NoticeBannerProps) {
  const toneClasses = getToneClasses(tone);

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-4 shadow-sm",
        toneClasses.container,
        borderColorClassName ? `border-l-4 ${borderColorClassName}` : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              toneClasses.iconWrap,
            ].join(" ")}
          >
            {icon}
          </div>
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-6">{title}</h3>
              {description ? (
                <p className={`mt-1 text-sm leading-6 ${toneClasses.description}`}>
                  {description}
                </p>
              ) : null}
            </div>

            {onDismiss ? (
              <button
                aria-label="Dismiss message"
                className="rounded-xl px-2 py-1 text-sm text-muted transition hover:bg-black/5 hover:text-foreground"
                onClick={onDismiss}
                type="button"
              >
                ✕
              </button>
            ) : null}
          </div>

          {actions?.length ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {actions.map((action) => (
                <ActionButton
                  key={action.label}
                  label={action.label}
                  onClick={action.onClick}
                  variant={action.variant}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}