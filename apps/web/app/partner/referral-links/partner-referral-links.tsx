"use client";

import { useEffect, useState } from "react";
import { Loading, PageHeader } from "../partner-overview";

type ReferralLink = {
  id: string;
  name: string;
  code: string;
  targetPath: string;
  campaignName?: string | null;
  isDefault: boolean;
  status: string;
  submissionCount: number;
};

export function PartnerReferralLinks() {
  const [items, setItems] = useState<ReferralLink[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/partner/portal/referral-links")
      .then((response) => response.json())
      .then((payload) => setItems(payload.items ?? []));
  }, []);

  function refreshLinks() {
    return fetch("/api/partner/portal/referral-links")
      .then((response) => response.json())
      .then((payload) => setItems(payload.items ?? []));
  }

  if (!items) return <Loading />;
  const landingBase =
    process.env.NEXT_PUBLIC_LANDING_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");

  function href(item: ReferralLink) {
    const target = item.targetPath.startsWith("/") ? item.targetPath : "/request-demo";
    return `${landingBase.replace(/\/$/, "")}${target}?ref=${encodeURIComponent(item.code)}`;
  }

  async function copy(item: ReferralLink) {
    await navigator.clipboard.writeText(href(item));
    setCopied(item.id);
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/partner/portal/referral-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, campaignName: campaignName || undefined }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = Array.isArray(payload.message)
        ? payload.message.join(" ")
        : payload.message;
      setError(message || "The referral link could not be created.");
      setBusy(false);
      return;
    }
    await refreshLinks();
    setName("");
    setCampaignName("");
    setShowCreate(false);
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Attribution"
        title="Referral links"
        description="Share these links. Valid submissions are attributed automatically and appear in My referred leads."
        action={
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {showCreate ? "Cancel" : "New campaign link"}
          </button>
        }
      />
      {showCreate ? (
        <form onSubmit={createLink} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Link name
            <input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Campaign name (optional)
            <input maxLength={160} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </label>
          {error ? <p className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
          <div className="sm:col-span-2">
            <button disabled={busy} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Creating..." : "Create referral link"}
            </button>
          </div>
        </form>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-950">{item.name}</h2>
                  {item.isDefault ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">Default</span> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.campaignName || item.code}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {item.status.toLowerCase()}
              </span>
            </div>
            <div className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{href(item)}</div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{item.submissionCount} submission{item.submissionCount === 1 ? "" : "s"}</p>
              <div className="flex gap-2">
                <button disabled={item.status !== "ACTIVE"} onClick={() => copy(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                  {copied === item.id ? "Copied" : "Copy link"}
                </button>
                <a href={href(item)} target="_blank" rel="noreferrer" className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Open</a>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!items.length ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Your partner manager will provision a referral link after your agreement and account are active.</p> : null}
    </div>
  );
}
