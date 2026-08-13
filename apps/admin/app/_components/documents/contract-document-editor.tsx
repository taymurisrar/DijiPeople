"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize, LineHeight, TextStyle } from "@tiptap/extension-text-style";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Eye,
  FileDown,
  FileUp,
  Heading1,
  Heading2,
  Italic,
  ImagePlus,
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
  group?: string;
  deprecatedFor?: string;
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
  "signature.party.primary.name",
  "signature.party.primary.date",
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

const DocumentRole = Extension.create({
  name: "documentRole",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "table"],
        attributes: {
          documentRole: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-document-role"),
            renderHTML: (attributes) =>
              attributes.documentRole
                ? { "data-document-role": attributes.documentRole }
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
  const [importing, setImporting] = useState(false);
  const [documentMessage, setDocumentMessage] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [placeholderRegistry, setPlaceholderRegistry] =
    useState<PlaceholderDefinition[]>(defaultPlaceholders);
  const [placeholderGroupOrder, setPlaceholderGroupOrder] = useState<string[]>(
    [],
  );
  useEffect(() => {
    if (placeholders !== undefined) return;
    const controller = new AbortController();
    fetch("/api/contracts/placeholder-definitions", {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            items?: PlaceholderDefinition[];
            groups?: string[];
          } | null,
        ) => {
          if (payload?.items?.length) setPlaceholderRegistry(payload.items);
          if (payload?.groups?.length)
            setPlaceholderGroupOrder(payload.groups);
        },
      )
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
  /*
   * Superseded keys stay resolvable for agreements that already use them, but
   * are never offered when authoring, so the picker only shows the canonical
   * namespace. Grouping follows the order the API publishes.
   */
  const placeholderGroups = useMemo(() => {
    const matching = normalizedPlaceholders.filter(
      (definition) =>
        !definition.deprecatedFor &&
        `${definition.key} ${definition.label} ${definition.dataType}`
          .toLowerCase()
          .includes(placeholderQuery.toLowerCase()),
    );
    const byGroup = new Map<string, PlaceholderDefinition[]>();
    for (const definition of matching) {
      const group = definition.group ?? "Other";
      byGroup.set(group, [...(byGroup.get(group) ?? []), definition]);
    }
    const ordered = [...byGroup.keys()].sort(
      (first, second) =>
        groupRank(first, placeholderGroupOrder) -
        groupRank(second, placeholderGroupOrder),
    );
    return ordered.map((group) => ({
      group,
      items: byGroup.get(group) ?? [],
    }));
  }, [placeholderQuery, normalizedPlaceholders, placeholderGroupOrder]);
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
      Color,
      Highlight.configure({ multicolor: true }),
      LineHeight.configure({ types: ["paragraph", "heading"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: true, inline: false }),
      PageBreak,
      Indent,
      DocumentRole,
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "contract-editor-content min-h-[520px] px-5 py-7 text-[15px] leading-7 text-slate-800 focus:outline-none sm:px-12 sm:py-10",
        spellcheck: "true",
      },
      transformPastedHTML(html) {
        return normalizePastedDocumentHtml(html);
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

  async function importDocument(file?: File) {
    if (!file) return;
    if (!/\.(docx|pdf|txt|html?)$/i.test(file.name)) {
      setDocumentMessage({
        tone: "error",
        text: "Choose a DOCX, PDF, TXT, or HTML document.",
      });
      return;
    }
    if (
      !editor!.isEmpty &&
      !window.confirm(
        "Importing this document will replace the current editor content. Continue?",
      )
    )
      return;
    setImporting(true);
    setDocumentMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/contracts/import-document", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        html?: string;
        warnings?: string[];
        message?: string | string[];
      } | null;
      if (!response.ok || !payload?.html) {
        const message = Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message;
        throw new Error(message || "The document could not be imported.");
      }
      editor!.commands.setContent(payload.html, { emitUpdate: true });
      const warning = payload.warnings?.filter(Boolean).join(" ");
      setDocumentMessage({
        tone: warning ? "warning" : "success",
        text: warning
          ? `${file.name} was imported. ${warning}`
          : `${file.name} was imported with editable headings, lists, tables, page breaks, colors, and images.`,
      });
    } catch (error) {
      setDocumentMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The document could not be imported.",
      });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function insertImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setDocumentMessage({
        tone: "error",
        text: "Choose a PNG, JPEG, GIF, or WebP image.",
      });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setDocumentMessage({
        tone: "error",
        text: "Images must be 3 MB or smaller.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      editor!
        .chain()
        .focus()
        .setImage({ src: reader.result, alt: file.name })
        .run();
      setDocumentMessage({
        tone: "success",
        text: `${file.name} was inserted.`,
      });
      if (imageInputRef.current) imageInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="overflow-visible rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      {!readOnly ? (
        <div
          className="sticky top-2 z-30 flex flex-wrap items-center gap-1 rounded-t-2xl border-b border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur"
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
          <input
            ref={importInputRef}
            type="file"
            accept=".docx,.pdf,.txt,.html,.htm,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain,text/html"
            className="sr-only"
            onChange={(event) => void importDocument(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            <FileUp className="h-4 w-4" />
            {importing ? "Importing…" : "Import file"}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(event) => insertImage(event.target.files?.[0])}
          />
          <Tool
            label="Insert image"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImagePlus />
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
          <label
            className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            title="Text color"
          >
            <span className="text-base font-bold underline decoration-2">
              A
            </span>
            <input
              type="color"
              aria-label="Text color"
              defaultValue="#1e293b"
              onChange={(event) =>
                editor.chain().focus().setColor(event.target.value).run()
              }
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <label
            className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            title="Highlight color"
          >
            <span className="rounded bg-amber-200 px-1 text-xs font-bold">
              A
            </span>
            <input
              type="color"
              aria-label="Highlight color"
              defaultValue="#fef3c7"
              onChange={(event) =>
                editor
                  .chain()
                  .focus()
                  .setHighlight({ color: event.target.value })
                  .run()
              }
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
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
                  <TableAction
                    label="Add row below"
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                  />
                  <TableAction
                    label="Remove row"
                    onClick={() => editor.chain().focus().deleteRow().run()}
                  />
                  <TableAction
                    label="Add column right"
                    onClick={() =>
                      editor.chain().focus().addColumnAfter().run()
                    }
                  />
                  <TableAction
                    label="Remove column"
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                  />
                  <TableAction
                    label="Merge selected cells"
                    disabled={!editor.can().mergeCells()}
                    onClick={() => editor.chain().focus().mergeCells().run()}
                  />
                  <TableAction
                    label="Split cell"
                    disabled={!editor.can().splitCell()}
                    onClick={() => editor.chain().focus().splitCell().run()}
                  />
                  <TableAction
                    label="Toggle header row"
                    onClick={() =>
                      editor.chain().focus().toggleHeaderRow().run()
                    }
                  />
                  <TableAction
                    label="Remove table"
                    destructive
                    onClick={() => {
                      editor.chain().focus().deleteTable().run();
                      setTableOpen(false);
                    }}
                  />
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
              Fields & signatures
            </button>
            {placeholderOpen ? (
              <div className="absolute left-0 top-11 z-40 max-h-72 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <input
                  value={placeholderQuery}
                  onChange={(event) => setPlaceholderQuery(event.target.value)}
                  placeholder="Search typed fields"
                  className="mb-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs"
                />
                {placeholderGroups.map(({ group, items }) => (
                  <div key={group}>
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {group}
                    </p>
                    {items.map((definition) => (
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
                ))}
                {placeholderGroups.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">
                    No fields match this search.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => printContractDocument(editor.getHTML())}
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
      {documentMessage ? (
        <div
          role={documentMessage.tone === "error" ? "alert" : "status"}
          className={`border-b px-4 py-2.5 text-xs ${
            documentMessage.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : documentMessage.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {documentMessage.text}
        </div>
      ) : null}
      <div className="contract-document-sheet mx-auto my-3 min-h-[700px] max-w-[816px] overflow-x-auto bg-white shadow-[0_10px_35px_rgba(15,23,42,0.10)] sm:my-6">
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
            Import DOCX for best fidelity. Pasting from Word or Google Docs is
            normalized automatically.
          </span>
          <span>{editor.getText().length} characters</span>
        </div>
      ) : null}
      <DocumentEditorStyles />
    </div>
  );
}

function printContractDocument(contentHtml: string) {
  const printWindow = window.open(
    "",
    "contract-document-print",
    "width=1000,height=800",
  );
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>Agreement document</title><style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font: 11pt/1.55 Arial, sans-serif; }
    h1 { font-size: 24pt; line-height: 1.1; } h2 { font-size: 17pt; } h3 { font-size: 13pt; }
    table { width: 100%; border-collapse: collapse; margin: 12pt 0; break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 7pt; text-align: left; vertical-align: top; }
    th { background: #eaf8f5; font-weight: 700; }
    img { max-width: 100%; height: auto; }
    hr[data-page-break="true"] { height: 0; margin: 0; border: 0; break-after: page; page-break-after: always; }
    [data-signature-metadata="true"] { display: inline-block; min-width: 240px; padding: 10pt; border: 1px solid #94a3b8; border-radius: 4pt; }
  </style></head><body>${contentHtml}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 150);
}

function normalizePastedDocumentHtml(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const pageBreak = () => {
    const element = document.createElement("hr");
    element.setAttribute("data-page-break", "true");
    element.className = "contract-page-break";
    return element;
  };

  document.querySelectorAll<HTMLElement>("p, div").forEach((element) => {
    const style = element.getAttribute("style") ?? "";
    if (/page-break-before\s*:\s*(always|page)/i.test(style))
      element.before(pageBreak());
    if (/page-break-after\s*:\s*(always|page)/i.test(style))
      element.after(pageBreak());
  });

  const wordListParagraphs = Array.from(
    document.querySelectorAll<HTMLParagraphElement>("p"),
  ).filter(
    (paragraph) =>
      /MsoListParagraph/i.test(paragraph.className) ||
      /mso-list\s*:/i.test(paragraph.getAttribute("style") ?? ""),
  );
  for (const paragraph of wordListParagraphs) {
    const marker = Array.from(
      paragraph.querySelectorAll<HTMLElement>("span"),
    ).find((span) =>
      /mso-list\s*:\s*ignore/i.test(span.getAttribute("style") ?? ""),
    );
    const markerText = marker?.textContent?.trim() ?? "";
    const tagName = /^\(?\d+[.)]?/.test(markerText) ? "ol" : "ul";
    marker?.remove();
    const item = document.createElement("li");
    while (paragraph.firstChild) item.appendChild(paragraph.firstChild);
    const previous = paragraph.previousElementSibling;
    const list =
      previous?.tagName.toLowerCase() === tagName
        ? previous
        : document.createElement(tagName);
    if (list !== previous) paragraph.before(list);
    list.appendChild(item);
    paragraph.remove();
  }

  document
    .querySelectorAll("meta, link, style, script, title, xml")
    .forEach((element) => element.remove());
  document.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (
        /^on/i.test(attribute.name) ||
        ["class", "lang", "dir", "id"].includes(attribute.name.toLowerCase())
      )
        element.removeAttribute(attribute.name);
    }
    const safeDeclarations = (element.getAttribute("style") ?? "")
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        if (separator < 1) return "";
        let property = declaration.slice(0, separator).trim().toLowerCase();
        let value = declaration.slice(separator + 1).trim();
        if (property === "background" && /^(#|rgb|[a-z])/i.test(value))
          property = "background-color";
        if (
          ![
            "text-align",
            "font-size",
            "font-family",
            "font-weight",
            "color",
            "background-color",
            "line-height",
            "margin-left",
          ].includes(property) ||
          /(expression|javascript:|url\s*\()/i.test(value)
        )
          return "";
        value = value.replace(/(\d+)\.0(px|pt)\b/gi, "$1$2");
        return `${property}:${value}`;
      })
      .filter(Boolean);
    if (safeDeclarations.length)
      element.setAttribute("style", safeDeclarations.join(";"));
    else element.removeAttribute("style");
  });
  return document.body.innerHTML;
}

function DocumentEditorStyles() {
  return (
    <style jsx global>{`
      .contract-document-sheet {
        width: min(816px, calc(100% - 24px));
      }
      .contract-editor-content {
        min-height: 1056px;
        padding: 58px 64px !important;
        color: #243247;
        font-family: Inter, Aptos, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }
      .contract-editor-content > :first-child {
        margin-top: 0;
      }
      .contract-editor-content p {
        margin: 0 0 0.72em;
      }
      .contract-editor-content h1,
      .contract-editor-content h2,
      .contract-editor-content h3,
      .contract-editor-content h4 {
        break-after: avoid;
        color: #14213d;
        font-weight: 750;
        line-height: 1.18;
      }
      .contract-editor-content h1 {
        margin: 1.45em 0 0.55em;
        font-size: 23px;
      }
      .contract-editor-content h2 {
        margin: 1.25em 0 0.45em;
        color: #078b91;
        font-size: 17px;
      }
      .contract-editor-content h3 {
        margin: 1.1em 0 0.4em;
        font-size: 15px;
      }
      .contract-editor-content h4 {
        margin: 1em 0 0.35em;
        font-size: 14px;
      }
      .contract-editor-content h1[data-document-role="cover-title"] {
        max-width: 650px;
        margin: 28px 0 8px;
        font-size: 34px;
        letter-spacing: -0.025em;
      }
      .contract-editor-content [data-document-role="cover-subtitle"] {
        margin-bottom: 20px;
        color: #078b91;
        font-size: 16px;
      }
      .contract-editor-content ul,
      .contract-editor-content ol {
        margin: 0.55em 0 1em;
        padding-left: 1.55rem;
      }
      .contract-editor-content li {
        margin: 0.22em 0;
        padding-left: 0.18rem;
      }
      .contract-editor-content li::marker {
        color: #079a83;
        font-weight: 700;
      }
      .contract-editor-content blockquote {
        margin: 1rem 0;
        border-left: 4px solid #15b897;
        background: #eefaf6;
        padding: 0.85rem 1rem;
        color: #334155;
      }
      .contract-editor-content table {
        width: 100%;
        margin: 0.85rem 0 1.15rem;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
        line-height: 1.35;
      }
      .contract-editor-content th,
      .contract-editor-content td {
        min-width: 1px;
        border: 1px solid #d9e2ec;
        padding: 7px 8px;
        vertical-align: middle;
        text-align: left;
      }
      .contract-editor-content th {
        background: #14213d;
        color: #fff;
        font-weight: 700;
      }
      .contract-editor-content
        table[data-document-role="data"]
        tbody
        tr:nth-child(even)
        td,
      .contract-editor-content
        table[data-document-role="data"]
        > tr:nth-child(even)
        td {
        background: #f4f7fa;
      }
      .contract-editor-content table[data-document-role="brand"] {
        margin: 0 0 24px;
      }
      .contract-editor-content table[data-document-role="brand"] td {
        border: 0;
        background: #14213d;
        padding: 16px 18px;
        color: #fff;
      }
      .contract-editor-content table[data-document-role="brand"] p {
        margin: 0.15rem 0;
      }
      .contract-editor-content
        table[data-document-role="metadata"]
        td:first-child {
        width: 26%;
        background: #f1f5f8;
        color: #14213d;
        font-weight: 700;
      }
      .contract-editor-content table[data-document-role="metrics"] td {
        border-color: #d8ebe8;
        background: #edf9f7;
        text-align: center;
      }
      .contract-editor-content table[data-document-role="metrics"] strong {
        display: block;
        color: #14213d;
        font-size: 17px;
      }
      .contract-editor-content table[data-document-role="callout"] td {
        border: 0;
        border-left: 4px solid #16b898;
        background: #eefaf6;
        padding: 10px 12px;
      }
      .contract-editor-content table[data-document-role="map-row"] {
        margin: 0 0 3px;
      }
      .contract-editor-content table[data-document-role="map-row"] td {
        border: 0;
        background: #f3f6f8;
        padding: 7px 10px;
      }
      .contract-editor-content
        table[data-document-role="map-row"]
        td:first-child {
        width: 42px;
        background: #078b91;
        color: #fff;
        text-align: center;
      }
      .contract-editor-content [data-document-role="small-note"] {
        color: #64748b;
        font-size: 11px;
        font-style: italic;
      }
      .contract-editor-content img {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 1rem auto;
        border-radius: 4px;
      }
      .contract-editor-content hr:not([data-page-break="true"]) {
        margin: 1.5rem 0;
        border: 0;
        border-top: 1px solid #cbd5e1;
      }
      .contract-editor-content hr[data-page-break="true"] {
        position: relative;
        height: 34px;
        margin: 42px -64px;
        border: 0;
        border-top: 1px dashed #94a3b8;
        border-bottom: 1px dashed #94a3b8;
        background: #eef2f6;
      }
      .contract-editor-content hr[data-page-break="true"]::after {
        position: absolute;
        top: 8px;
        left: 50%;
        padding: 0 8px;
        transform: translateX(-50%);
        background: #eef2f6;
        color: #64748b;
        content: "Page break";
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      @media (max-width: 640px) {
        .contract-editor-content {
          min-height: 720px;
          padding: 28px 24px !important;
        }
        .contract-editor-content h1[data-document-role="cover-title"] {
          font-size: 27px;
        }
        .contract-editor-content hr[data-page-break="true"] {
          margin-right: -24px;
          margin-left: -24px;
        }
      }
      @media print {
        .contract-document-sheet {
          width: 100%;
          max-width: none;
          box-shadow: none;
        }
        .contract-editor-content {
          min-height: 0;
          padding: 0 !important;
        }
        .contract-editor-content hr[data-page-break="true"] {
          height: 0;
          margin: 0;
          border: 0;
          break-after: page;
        }
        .contract-editor-content hr[data-page-break="true"]::after {
          content: none;
        }
      }
    `}</style>
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

function TableAction({
  label,
  onClick,
  disabled,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-left text-xs font-semibold disabled:opacity-35 ${destructive ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );
}

function groupRank(group: string, order: string[]) {
  const index = order.indexOf(group);
  return index === -1 ? order.length : index;
}
