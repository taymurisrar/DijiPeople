"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize, LineHeight, TextStyle } from "@tiptap/extension-text-style";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Eye,
  FileDown,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListChecks,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  TextCursorInput,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

type PlaceholderDefinition = {
  key: string;
  label: string;
  description?: string;
  dataType: string;
  sourceEntity: string;
  required?: boolean;
  exampleValue?: string;
};

const defaultPlaceholders: PlaceholderDefinition[] = [
  "contract.number",
  "contract.effectiveDate",
  "contract.expiryDate",
  "counterparty.name",
  "counterparty.email",
  "partner.name",
  "partner.commissionRate",
  "customer.name",
  "platform.legalName",
  "platform.reportingCurrency",
  "signer.name",
  "signature.platform.name",
  "signature.platform.date",
  "signature.counterparty.name",
  "signature.counterparty.date",
].map((key) => ({
  key,
  label: key.replaceAll(".", " "),
  dataType: key.startsWith("signature.") ? "SIGNATURE" : "TEXT",
  sourceEntity: key.split(".")[0],
}));

const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: 'hr[data-page-break="true"]' }],
  renderHTML: () => [
    "hr",
    { "data-page-break": "true", class: "contract-page-break" },
  ],
});

const Indent = Extension.create({
  name: "documentIndent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) =>
              Number.parseInt(element.style.marginLeft || "0", 10) / 24 || 0,
            renderHTML: (attributes) =>
              attributes.indent
                ? {
                    style: `margin-left: ${Math.min(Number(attributes.indent), 6) * 24}px`,
                  }
                : {},
          },
        },
      },
    ];
  },
});

export function ContractDocumentEditor({
  value,
  onChange,
  readOnly = false,
  placeholders,
}: {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholders?: Array<string | PlaceholderDefinition>;
}) {
  const [preview, setPreview] = useState(readOnly);
  const [placeholderOpen, setPlaceholderOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [placeholderQuery, setPlaceholderQuery] = useState("");
  const [placeholderRegistry, setPlaceholderRegistry] =
    useState<PlaceholderDefinition[]>(defaultPlaceholders);
  useEffect(() => {
    if (placeholders !== undefined) return;
    const controller = new AbortController();
    fetch("/api/contracts/placeholder-definitions", {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { items?: PlaceholderDefinition[] } | null) => {
        if (payload?.items?.length) setPlaceholderRegistry(payload.items);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [placeholders]);
  const normalizedPlaceholders = useMemo(
    () =>
      placeholders === undefined
        ? placeholderRegistry
        : placeholders.map((item) =>
            typeof item === "string"
              ? {
                  key: item,
                  label: item.replaceAll(".", " "),
                  dataType: "TEXT",
                  sourceEntity: item.split(".")[0],
                }
              : item,
          ),
    [placeholderRegistry, placeholders],
  );
  const visiblePlaceholders = useMemo(
    () =>
      normalizedPlaceholders.filter((definition) =>
        `${definition.key} ${definition.label} ${definition.dataType}`
          .toLowerCase()
          .includes(placeholderQuery.toLowerCase()),
      ),
    [placeholderQuery, normalizedPlaceholders],
  );
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      TableKit.configure({
        table: { resizable: true },
        tableCell: {},
        tableHeader: {},
        tableRow: {},
      }),
      TextStyle,
      FontSize,
      LineHeight.configure({ types: ["paragraph", "heading"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      PageBreak,
      Indent,
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "contract-editor-content min-h-[520px] px-5 py-7 text-[15px] leading-7 text-slate-800 focus:outline-none sm:px-12 sm:py-10",
        spellcheck: "true",
      },
      transformPastedHTML(html) {
        return html
          .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
          .replace(/<(meta|link|style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
          .replace(/\s(?:class|lang|dir)=("[^"]*"|'[^']*')/gi, "")
          .replace(/(?:expression|javascript:|mso-[a-z-]+)\s*:[^;"']*;?/gi, "");
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || editor.getHTML() === (value || "<p></p>")) return;
    editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
  }, [editor, value]);

  if (!editor)
    return (
      <div className="min-h-[520px] animate-pulse rounded-xl bg-slate-100" />
    );

  function setLink() {
    const currentEditor = editor!;
    const previous = currentEditor.getAttributes("link").href as
      | string
      | undefined;
    const href = window.prompt("Link URL", previous ?? "https://");
    if (href === null) return;
    if (!href.trim())
      currentEditor.chain().focus().extendMarkRange("link").unsetLink().run();
    else
      currentEditor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: href.trim() })
        .run();
  }

  function insertPlaceholder(key: string) {
    editor!.chain().focus().insertContent(`{{${key}}}`).run();
    setPlaceholderOpen(false);
  }

  function changeIndent(delta: number) {
    const currentEditor = editor!;
    const type = currentEditor.isActive("heading") ? "heading" : "paragraph";
    const current = Number(currentEditor.getAttributes(type).indent ?? 0);
    currentEditor
      .chain()
      .focus()
      .updateAttributes(type, {
        indent: Math.max(0, Math.min(6, current + delta)),
      })
      .run();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      {!readOnly ? (
        <div
          className="sticky top-0 z-20 flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white p-2"
          role="toolbar"
          aria-label="Document formatting"
        >
          <Tool
            label="Undo"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <Undo2 />
          </Tool>
          <Tool
            label="Redo"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          >
            <Redo2 />
          </Tool>
          <select
            aria-label="Font size"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value)
                editor.chain().focus().setFontSize(event.target.value).run();
              else editor.chain().focus().unsetFontSize().run();
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
          >
            <option value="">Size</option>
            {["10px", "12px", "14px", "16px", "18px", "24px", "32px"].map(
              (size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ),
            )}
          </select>
          <select
            aria-label="Line spacing"
            defaultValue=""
            onChange={(event) =>
              event.target.value &&
              editor.chain().focus().setLineHeight(event.target.value).run()
            }
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
          >
            <option value="">Spacing</option>
            {["1", "1.15", "1.5", "2"].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <Separator />
          <Tool
            label="Paragraph"
            active={editor.isActive("paragraph")}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            <Pilcrow />
          </Tool>
          <Tool
            label="Heading 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Heading1 />
          </Tool>
          <Tool
            label="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 />
          </Tool>
          <Tool
            label="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft />
          </Tool>
          <Tool
            label="Align center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter />
          </Tool>
          <Tool
            label="Align right"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight />
          </Tool>
          <Tool label="Decrease indent" onClick={() => changeIndent(-1)}>
            <TextCursorInput className="rotate-180" />
          </Tool>
          <Tool label="Increase indent" onClick={() => changeIndent(1)}>
            <TextCursorInput />
          </Tool>
          <Separator />
          <Tool
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold />
          </Tool>
          <Tool
            label="Checklist"
            active={editor.isActive("taskList")}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListChecks />
          </Tool>
          <Tool
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </Tool>
          <Tool
            label="Page break"
            onClick={() =>
              editor.chain().focus().insertContent({ type: "pageBreak" }).run()
            }
          >
            <FileDown />
          </Tool>
          <Tool
            label="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon />
          </Tool>
          <Tool
            label="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </Tool>
          <Separator />
          <Tool
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List />
          </Tool>
          <Tool
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </Tool>
          <Tool
            label="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </Tool>
          <Tool
            label="Horizontal rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus />
          </Tool>
          <Tool label="Link" active={editor.isActive("link")} onClick={setLink}>
            <Link2 />
          </Tool>
          <Tool
            label="Insert table"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <Table2 />
          </Tool>
          {editor.isActive("table") ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setTableOpen((current) => !current)}
                className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Table actions
              </button>
              {tableOpen ? (
                <div className="absolute left-0 top-11 z-40 grid w-48 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <TableAction label="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()} />
                  <TableAction label="Remove row" onClick={() => editor.chain().focus().deleteRow().run()} />
                  <TableAction label="Add column right" onClick={() => editor.chain().focus().addColumnAfter().run()} />
                  <TableAction label="Remove column" onClick={() => editor.chain().focus().deleteColumn().run()} />
                  <TableAction label="Merge selected cells" disabled={!editor.can().mergeCells()} onClick={() => editor.chain().focus().mergeCells().run()} />
                  <TableAction label="Split cell" disabled={!editor.can().splitCell()} onClick={() => editor.chain().focus().splitCell().run()} />
                  <TableAction label="Toggle header row" onClick={() => editor.chain().focus().toggleHeaderRow().run()} />
                  <TableAction label="Remove table" destructive onClick={() => { editor.chain().focus().deleteTable().run(); setTableOpen(false); }} />
                </div>
              ) : null}
            </div>
          ) : null}
          <Separator />
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlaceholderOpen((current) => !current)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              <Braces className="h-4 w-4" />
              Placeholder
            </button>
            {placeholderOpen ? (
              <div className="absolute left-0 top-11 z-40 max-h-72 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <input
                  value={placeholderQuery}
                  onChange={(event) => setPlaceholderQuery(event.target.value)}
                  placeholder="Search typed fields"
                  className="mb-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs"
                />
                {visiblePlaceholders.map((definition) => (
                  <button
                    type="button"
                    key={definition.key}
                    onClick={() => insertPlaceholder(definition.key)}
                    title={definition.description}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      <span>{definition.label}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                        {definition.dataType.replaceAll("_", " ")}
                      </span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{`{{${definition.key}}}`}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview((current) => !current)}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4" />
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
      ) : null}
      <div className="mx-auto my-3 min-h-[700px] max-w-[816px] overflow-x-auto bg-white shadow-[0_10px_35px_rgba(15,23,42,0.10)] sm:my-6">
        {preview || readOnly ? (
          <article
            className="contract-editor-content px-5 py-7 text-[15px] leading-7 text-slate-800 sm:px-12 sm:py-10"
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
      {!readOnly ? (
        <div className="flex justify-between border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500">
          <span>
            Paste from Microsoft Word or Google Docs; server sanitization is
            applied on save.
          </span>
          <span>{editor.getText().length} characters</span>
        </div>
      ) : null}
    </div>
  );
}

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4 ${active ? "bg-[var(--admin-primary)] text-white" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />;
}

function TableAction({ label, onClick, disabled, destructive = false }: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-lg px-3 py-2 text-left text-xs font-semibold disabled:opacity-35 ${destructive ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"}`}>{label}</button>;
}
