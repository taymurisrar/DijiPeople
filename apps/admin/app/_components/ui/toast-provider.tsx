"use client";

import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { ToastNotice, type ToastNoticeItem } from "./toast-notice";

type ToastContextValue = {
  showToast: (toast: Omit<ToastNoticeItem, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastNoticeItem[]>([]);
  const value = useMemo(
    () => ({
      showToast(input: Omit<ToastNoticeItem, "id">) {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setItems((current) => [...current, { ...input, id, durationMs: input.durationMs ?? 4000 }]);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[140] w-full max-w-sm space-y-3">
        {items.map((item) => (
          <div className="pointer-events-auto" key={item.id}>
            <ToastNotice item={item} onClose={(id) => setItems((current) => current.filter((entry) => entry.id !== id))} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToastNotice() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToastNotice must be used inside ToastProvider.");
  return context;
}
