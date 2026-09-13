"use client";

import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Button } from "@/app/components/ui/button";
import { inputClassName } from "./notification-ui";

/*
 * ITEM-0181. The formatted message editor for email templates.
 *
 * Built on the browser's own editing surface instead of an editor library:
 * `apps/web` does not depend on one (`@tiptap` is an `apps/admin` dependency),
 * adding one needs a lockfile change, and the formatting an email body needs
 * is short — bold, italic, underline, a heading, lists, links. `execCommand`
 * is marked obsolete in the spec but is implemented by every evergreen browser,
 * and nothing here trusts its output: the API sanitises every body it stores
 * (`sanitizeEmailTemplateHtml`), and the preview renders what the API returns.
 *
 * Pasting inserts plain text. A rich paste from a word processor or a web page
 * carries markup the sanitiser would strip anyway, and stripping it here keeps
 * what the editor shows equal to what gets saved.
 */

export type RichTextEditorHandle = {
  insertText: (text: string) => void;
};

type ToolbarCommand = {
  command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList";
  label: string;
  icon: LucideIcon;
};

const TOOLBAR_COMMANDS: ToolbarCommand[] = [
  { command: "bold", label: "Bold", icon: Bold },
  { command: "italic", label: "Italic", icon: Italic },
  { command: "underline", label: "Underline", icon: Underline },
  { command: "insertUnorderedList", label: "Bulleted list", icon: List },
  { command: "insertOrderedList", label: "Numbered list", icon: ListOrdered },
];

const toolbarButtonClassName =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-foreground transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 aria-pressed:border-border aria-pressed:bg-surface";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function EmailTemplateRichTextEditor({
  label,
  onChange,
  onFocus,
  ref,
  toolbarEnd,
  value,
}: {
  label: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  ref?: Ref<RichTextEditorHandle>;
  toolbarEnd?: ReactNode;
  value: string;
}) {
  const labelId = useId();
  const linkInputId = useId();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkAddress, setLinkAddress] = useState("");

  /*
   * Only a value that did not come from this editor is written back into the
   * DOM. Rewriting innerHTML on every keystroke would move the caret to the
   * start of the message.
   */
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastEmitted.current) return;
    editor.innerHTML = value;
    lastEmitted.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    lastEmitted.current = editor.innerHTML;
    onChange(editor.innerHTML);
  }, [onChange]);

  const rememberSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedRange.current = range.cloneRange();
    setActiveFormats(
      Object.fromEntries(
        TOOLBAR_COMMANDS.map(({ command }) => [
          command,
          document.queryCommandState(command),
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, [rememberSelection]);

  function restoreSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;
    editor.focus();
    selection.removeAllRanges();
    if (savedRange.current) {
      selection.addRange(savedRange.current);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  }

  function run(command: string, argument?: string) {
    restoreSelection();
    document.execCommand(command, false, argument);
    emit();
    rememberSelection();
  }

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => run("insertText", text),
  }));

  function toggleHeading() {
    restoreSelection();
    const block = String(document.queryCommandValue("formatBlock")).toLowerCase();
    run("formatBlock", block === "h2" ? "<p>" : "<h2>");
  }

  function applyLink() {
    const address = linkAddress.trim();
    if (!address) return;
    const selection = window.getSelection();
    const hasSelection =
      savedRange.current !== null && !savedRange.current.collapsed;
    if (hasSelection) {
      run("createLink", address);
    } else {
      run(
        "insertHTML",
        `<a href="${escapeHtml(address)}">${escapeHtml(address)}</a>`,
      );
    }
    selection?.collapseToEnd();
    setLinkAddress("");
    setLinkOpen(false);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    run("insertText", event.clipboardData.getData("text/plain"));
  }

  return (
    <div className="space-y-2 text-sm">
      <span className="block font-medium text-foreground" id={labelId}>
        {label}
        <span className="ml-1 text-danger">*</span>
      </span>
      <div className="overflow-hidden rounded-2xl border border-border bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <div
          aria-label={`${label} formatting`}
          className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-muted/40 px-2 py-1.5"
          role="toolbar"
        >
          {TOOLBAR_COMMANDS.map(({ command, icon: Icon, label: commandLabel }) => (
            <button
              aria-label={commandLabel}
              aria-pressed={Boolean(activeFormats[command])}
              className={toolbarButtonClassName}
              key={command}
              onClick={() => run(command)}
              onMouseDown={(event) => event.preventDefault()}
              title={commandLabel}
              type="button"
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </button>
          ))}
          <button
            aria-label="Heading"
            className={toolbarButtonClassName}
            onClick={toggleHeading}
            onMouseDown={(event) => event.preventDefault()}
            title="Heading"
            type="button"
          >
            <Heading2 aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            aria-expanded={linkOpen}
            aria-label="Link"
            className={toolbarButtonClassName}
            onClick={() => setLinkOpen((open) => !open)}
            onMouseDown={(event) => event.preventDefault()}
            title="Link"
            type="button"
          >
            <Link2 aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            aria-label="Remove link"
            className={toolbarButtonClassName}
            onClick={() => run("unlink")}
            onMouseDown={(event) => event.preventDefault()}
            title="Remove link"
            type="button"
          >
            <Unlink aria-hidden="true" className="h-4 w-4" />
          </button>
          {toolbarEnd ? <div className="ml-auto">{toolbarEnd}</div> : null}
        </div>

        {linkOpen ? (
          <div className="flex flex-wrap items-end gap-2 border-b border-border px-3 py-2">
            <label className="min-w-0 flex-1 space-y-1" htmlFor={linkInputId}>
              <span className="text-xs font-medium text-foreground">
                Link address
              </span>
              <input
                className={inputClassName}
                id={linkInputId}
                onChange={(event) => setLinkAddress(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setLinkOpen(false);
                  }
                }}
                value={linkAddress}
              />
            </label>
            <Button onClick={applyLink} size="sm" type="button">
              Apply
            </Button>
            <Button
              onClick={() => setLinkOpen(false)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </div>
        ) : null}

        <div
          aria-labelledby={labelId}
          aria-multiline="true"
          className="min-h-[320px] max-w-none overflow-x-auto px-4 py-3 text-sm leading-6 text-foreground outline-none [&_a]:text-accent [&_a]:underline [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          contentEditable
          onBlur={rememberSelection}
          onFocus={onFocus}
          onInput={emit}
          onPaste={handlePaste}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}
