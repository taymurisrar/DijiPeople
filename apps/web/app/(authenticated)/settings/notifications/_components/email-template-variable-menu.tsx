"use client";

import { Braces } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import type { EmailTemplateVariable } from "../templates/_lib/email-template-editing";

/*
 * ITEM-0181. Lists the variables the template's event supplies and inserts the
 * chosen one where the caret was. The list comes from the API's event catalog,
 * so an administrator can only place a token the email will actually fill.
 *
 * Every control here prevents mousedown from taking focus, so the subject
 * input or message editor keeps its selection while the menu is used.
 */
export function EmailTemplateVariableMenu({
  label = "Variable",
  onPick,
  variables,
}: {
  label?: string;
  onPick: (key: string) => void;
  variables: readonly EmailTemplateVariable[];
}) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={variables.length === 0}
        leftIcon={<Braces aria-hidden="true" className="h-4 w-4" />}
        onClick={() => setOpen((current) => !current)}
        onMouseDown={(event) => event.preventDefault()}
        size="sm"
        type="button"
        variant="secondary"
      >
        {label}
      </Button>
      {open ? (
        <div
          aria-label="Variables"
          className="absolute right-0 z-30 mt-2 max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-white p-1 shadow-xl"
          id={menuId}
          role="menu"
        >
          {variables.map((variable) => (
            <button
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-surface focus:bg-surface focus:outline-none"
              key={variable.key}
              onClick={() => {
                onPick(variable.key);
                setOpen(false);
              }}
              onMouseDown={(event) => event.preventDefault()}
              role="menuitem"
              type="button"
            >
              <span className="text-sm text-foreground">{variable.label}</span>
              <span className="font-mono text-xs text-muted">{`{{${variable.key}}}`}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
