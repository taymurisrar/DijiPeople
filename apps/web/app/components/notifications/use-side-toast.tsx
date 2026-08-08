"use client";

import { useCallback, useState } from "react";
import { SideToast, type SideToastProps } from "./side-toast";

type Notice = {
  title: string;
  description?: string;
  variant?: SideToastProps["variant"];
};

/**
 * Local toast state plus the element that renders it.
 *
 * Every caller was repeating the same `useState` and conditional `SideToast`,
 * which is easy to omit on a new action. Returning the element keeps that
 * boilerplate in one place while leaving `SideToast` itself unchanged.
 */
export function useSideToast(defaults?: Pick<SideToastProps, "placement">) {
  const [notice, setNotice] = useState<Notice | null>(null);

  const notify = useCallback((next: Notice) => setNotice(next), []);

  const notifySuccess = useCallback(
    (title: string, description?: string) =>
      setNotice({ title, description, variant: "success" }),
    [],
  );

  const notifyError = useCallback(
    (title: string, description?: string) =>
      setNotice({ title, description, variant: "error" }),
    [],
  );

  const toast = notice ? (
    <SideToast
      description={notice.description}
      isOpen
      onClose={() => setNotice(null)}
      placement={defaults?.placement}
      title={notice.title}
      variant={notice.variant ?? "info"}
    />
  ) : null;

  return { notify, notifySuccess, notifyError, toast };
}
