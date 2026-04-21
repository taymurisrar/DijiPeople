import type { ReactNode } from "react";

export type NoticeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type NoticeAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export type NoticeVisual = {
  icon?: ReactNode;
  borderColorClassName?: string;
};

export type ToastPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";