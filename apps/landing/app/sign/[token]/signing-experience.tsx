"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type Session = {
  requestNumber: string;
  subject: string;
  message?: string;
  recipient: { name: string; email: string; role: string };
  contract: { contractNumber: string; title: string; counterpartyName: string };
  document: { title: string; contentHtml: string; sha256: string };
  canSign: boolean;
  allowRequestChanges: boolean;
  expiresAt: string;
  consentText: string;
  allowedSignatureMethods: Method[];
};
type Method = "TYPED" | "DRAWN" | "UPLOADED";

export function SigningExperience({ token }: { token: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("TYPED");
  const [typedName, setTypedName] = useState("");
  const [typedStyle, setTypedStyle] = useState<"serif" | "script" | "formal">(
    "serif",
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [resolution, setResolution] = useState<
    "signed" | "declined" | "changes" | null
  >(null);
  const [reasonMode, setReasonMode] = useState<"decline" | "changes" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const signingDocumentHtml = useMemo(
    () =>
      (session?.document.contentHtml ?? "").replace(
        /\{\{\s*(signature\.[a-zA-Z0-9_.-]+)\s*\}\}/g,
        (_token, key: string) =>
          `<span class="my-2 inline-block min-w-64 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-5 text-center text-xs font-semibold text-emerald-800" data-signature-target="${key}">Signature will be placed here</span>`,
      ),
    [session?.document.contentHtml],
  );
  useEffect(() => {
    fetch(`/api/signatures/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message);
        setSession(payload);
        setTypedName(payload.recipient.name);
        if (payload.allowedSignatureMethods?.length)
          setMethod(payload.allowedSignatureMethods[0]);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to open signing request.",
        ),
      );
  }, [token]);
  async function sign() {
    if (!session) return;
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/signatures/${encodeURIComponent(token)}/sign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          typedName: method === "TYPED" ? typedName : undefined,
          signatureDataUrl: method === "TYPED" ? undefined : signatureDataUrl,
          consentAccepted: consent,
          consentText: session.consentText,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.message ?? "Unable to record signature.");
      return;
    }
    setComplete(true);
    setResolution("signed");
  }
  async function resolveWithoutSigning(action: "decline" | "request-changes") {
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/signatures/${encodeURIComponent(token)}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.message ?? "Unable to submit your response.");
      return;
    }
    setComplete(true);
    setResolution(action === "decline" ? "declined" : "changes");
  }
  if (error && !session)
    return <State title="Signing request unavailable" description={error} />;
  if (!session)
    return (
      <State
        title="Opening secure document"
        description="Validating the signature request and document integrity."
      />
    );
  if (complete)
    return (
      <State
        title={
          resolution === "declined"
            ? "Signature declined"
            : resolution === "changes"
              ? "Changes requested"
              : "Signature recorded"
        }
        description={
          resolution === "declined"
            ? "Your decision and reason were recorded in the agreement audit trail."
            : resolution === "changes"
              ? "The contract owner has been notified to revise the document."
              : "Your signature and evidence were recorded. You may safely close this page."
        }
      />
    );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-[28px] border border-border bg-surface-muted shadow-sm">
        <header className="border-b border-border bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            {session.contract.contractNumber} / {session.requestNumber}
          </p>
          <h1 className="mt-2 text-xl font-semibold text-foreground">
            {session.contract.title}
          </h1>
          <p className="mt-1 text-xs text-muted">
            Document fingerprint {session.document.sha256.slice(0, 16)}...
          </p>
        </header>
        <article
          className="prose mx-auto my-4 min-h-[800px] max-w-[816px] bg-white px-5 py-7 text-sm leading-7 text-foreground shadow-md sm:my-6 sm:px-12 sm:py-10"
          dangerouslySetInnerHTML={{ __html: signingDocumentHtml }}
        />
      </section>
      <aside className="h-fit rounded-[28px] border border-border bg-white p-6 shadow-md lg:sticky lg:top-24">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Sign as
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          {session.recipient.name}
        </h2>
        <p className="text-sm text-muted">
          {session.recipient.role} / {session.recipient.email}
        </p>
        {!session.canSign ? (
          <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-warning">
            An earlier recipient must sign before your signature can be
            accepted.
          </p>
        ) : (
          <>
            <div
              className="mt-6 inline-flex w-full rounded-xl border border-border bg-surface-muted p-1"
              role="group"
            >
              {session.allowedSignatureMethods.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={method === item}
                  onClick={() => {
                    setMethod(item);
                    setSignatureDataUrl(null);
                  }}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${method === item ? "bg-accent text-white" : "text-muted"}`}
                >
                  {item === "TYPED"
                    ? "Type"
                    : item === "DRAWN"
                      ? "Draw"
                      : "Upload"}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {method === "TYPED" ? (
                <div className="space-y-2">
                  <input
                    value={typedName}
                    maxLength={200}
                    onChange={(event) => setTypedName(event.target.value)}
                    style={{
                      fontFamily:
                        typedStyle === "script"
                          ? "cursive"
                          : typedStyle === "formal"
                            ? "Georgia, serif"
                            : "ui-serif, Georgia, serif",
                    }}
                    className="h-16 w-full rounded-xl border border-border px-4 text-center text-2xl italic text-foreground"
                    aria-label="Typed legal signature name"
                  />
                  <select
                    aria-label="Signature style"
                    value={typedStyle}
                    onChange={(event) =>
                      setTypedStyle(event.target.value as typeof typedStyle)
                    }
                    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground"
                  >
                    <option value="serif">Classic</option>
                    <option value="script">Script</option>
                    <option value="formal">Formal</option>
                  </select>
                  <p className="text-xs text-muted">
                    The entered legal name is retained as text; the style is
                    presentation only.
                  </p>
                </div>
              ) : method === "DRAWN" ? (
                <SignatureCanvas onChange={setSignatureDataUrl} />
              ) : (
                <label className="grid cursor-pointer place-items-center gap-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
                  Upload PNG or JPEG signature
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    onChange={(event) =>
                      readFile(
                        event.target.files?.[0],
                        setSignatureDataUrl,
                        setError,
                      )
                    }
                  />
                  {signatureDataUrl ? (
                    <Image
                      unoptimized
                      src={signatureDataUrl}
                      alt="Uploaded signature preview"
                      width={320}
                      height={96}
                      className="h-24 max-w-full object-contain"
                    />
                  ) : null}
                </label>
              )}
            </div>
            <label className="mt-5 flex items-start gap-3 text-xs leading-5 text-muted">
              <input
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                type="checkbox"
                className="mt-1 h-4 w-4"
              />
              <span>{session.consentText}</span>
            </label>
            {error ? (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={
                busy ||
                !consent ||
                (method === "TYPED" ? !typedName.trim() : !signatureDataUrl)
              }
              onClick={() => void sign()}
              className="mt-5 w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Recording signature..." : "Agree and sign"}
            </button>
            <div
              className={`mt-3 grid gap-2 ${session.allowRequestChanges ? "grid-cols-2" : "grid-cols-1"}`}
              role="group"
              aria-label="Other signing responses"
            >
              {session.allowRequestChanges ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setReasonMode("changes")}
                  className="rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-foreground disabled:opacity-40"
                >
                  Request changes
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => setReasonMode("decline")}
                className="rounded-xl border border-red-200 px-3 py-2.5 text-xs font-semibold text-danger disabled:opacity-40"
              >
                Decline
              </button>
            </div>
            {reasonMode ? (
              <div className="mt-4 rounded-xl border border-border bg-surface-muted p-4">
                <label
                  className="text-xs font-semibold text-foreground"
                  htmlFor="signature-response-reason"
                >
                  {reasonMode === "decline"
                    ? "Reason for declining"
                    : "Changes required"}
                </label>
                <textarea
                  id="signature-response-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="mt-2 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm text-foreground"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReasonMode(null)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void resolveWithoutSigning(
                        reasonMode === "decline"
                          ? "decline"
                          : "request-changes",
                      )
                    }
                    className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? "Submitting..." : "Submit response"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </aside>
    </div>
  );
}

function SignatureCanvas({
  onChange,
}: {
  onChange: (value: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const value = point(event);
    ctx.beginPath();
    ctx.moveTo(value.x, value.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const value = point(event);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#10212b";
    ctx.lineTo(value.x, value.y);
    ctx.stroke();
  }
  function end() {
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        className="h-36 w-full touch-none rounded-xl border border-border bg-white"
        aria-label="Draw signature"
      />
      <button
        type="button"
        onClick={clear}
        className="mt-2 text-xs font-semibold text-muted"
      >
        Clear signature
      </button>
    </div>
  );
}
function readFile(
  file: File | undefined,
  onChange: (value: string | null) => void,
  onError: (value: string | null) => void,
) {
  if (!file) return;
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 2_000_000
  ) {
    onError("Signature must be a PNG or JPEG smaller than 2 MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onChange(String(reader.result));
  reader.readAsDataURL(file);
}
function State({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-[28px] border border-border bg-white p-10 text-center shadow-md">
      <h1 className="font-serif text-3xl text-foreground">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}
