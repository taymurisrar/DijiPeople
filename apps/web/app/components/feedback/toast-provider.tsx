"use client";

import * as React from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { ToastNotice, type ToastNoticeItem } from "./toast-notice";
import type { ToastPosition } from "./notice-types";

type ToastContextValue = {
  showToast: (input: Omit<ToastNoticeItem, "id">) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function getPositionClasses(position: ToastPosition) {
  switch (position) {
    case "top-left":
      return "left-4 top-4";
    case "bottom-left":
      return "bottom-4 left-4";
    case "bottom-right":
      return "bottom-4 right-4";
    case "top-right":
    default:
      return "right-4 top-4";
  }
}

type ToastProviderProps = {
  children: React.ReactNode;
  position?: ToastPosition;
};

export function ToastProvider({
  children,
  position = "top-right",
}: ToastProviderProps) {
  const [items, setItems] = useState<ToastNoticeItem[]>([]);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast(input) {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        setItems((current) => [
          ...current,
          {
            ...input,
            id,
            durationMs: input.durationMs ?? 4000,
          },
        ]);
      },
      dismissToast(id) {
        setItems((current) => current.filter((item) => item.id !== id));
      },
      clearToasts() {
        setItems([]);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className={`pointer-events-none fixed z-[100] w-full max-w-sm space-y-3 ${getPositionClasses(
          position,
        )}`}
      >
        {items.map((item) => (
          <div className="pointer-events-auto" key={item.id}>
            <ToastNotice
              item={item}
              onClose={(id) =>
                setItems((current) => current.filter((entry) => entry.id !== id))
              }
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToastNotice() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToastNotice must be used within ToastProvider.");
  }

  return context;
}