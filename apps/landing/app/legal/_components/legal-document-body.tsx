import { Fragment } from "react";

/**
 * Renders a legal document's Markdown.
 *
 * A deliberately small renderer rather than a Markdown library. Legal documents
 * are the one place on this site where **what is displayed must be exactly what
 * was stored and acknowledged** — an acknowledgement names a version, and if the
 * renderer can transform the text then what the reader agreed to and what the
 * database holds are two different things.
 *
 * So this handles the constructs the documents actually use, escapes nothing it
 * does not understand, and never renders raw HTML. A dependency that supported
 * inline HTML would turn stored document text into an injection surface on a
 * public page.
 */
export function LegalDocumentBody({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);

  return (
    <div className="mt-8 space-y-4 text-base leading-7 text-muted">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;

        switch (block.kind) {
          case "h1":
            // The page already renders the document title as its <h1>, so the
            // document's own leading heading is dropped rather than producing a
            // second one — two h1s is an accessibility defect, not a style
            // preference.
            return null;
          case "h2":
            return (
              <h2
                key={key}
                className="pt-4 font-serif text-2xl text-foreground"
              >
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={key}
                className="pt-2 text-lg font-semibold text-foreground"
              >
                {block.text}
              </h3>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="rounded-2xl border-l-4 border-accent bg-white/70 p-4 text-sm"
              >
                {block.lines.map((line, lineIndex) => (
                  <p key={lineIndex} className={lineIndex > 0 ? "mt-2" : ""}>
                    <Inline text={line} />
                  </p>
                ))}
              </blockquote>
            );
          case "list":
            return (
              <ul key={key} className="ml-5 list-disc space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case "paragraph":
            return (
              <p key={key}>
                <Inline text={block.text} />
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; lines: string[] };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push({ kind: "quote", lines: quote });
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      blocks.push({
        kind: level === 1 ? "h1" : level === 2 ? "h2" : "h3",
        text: heading[2].trim(),
      });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      const text = line.replace(/^>\s?/, "").trim();
      // A blank quote line separates paragraphs inside the block quote.
      if (text !== "") {
        quote.push(text);
      }
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushQuote();
      list.push(bullet[1].trim());
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

/**
 * Bold and inline code only.
 *
 * Everything else is rendered as literal text. React escapes it, so a document
 * containing markup is displayed rather than executed — which is the required
 * behaviour for text that an operator authors and the public reads.
 */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={index}
              className="rounded bg-black/5 px-1 py-0.5 text-[0.9em]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
