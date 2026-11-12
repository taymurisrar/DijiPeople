"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useReasonPrompt } from "@/app/_components/runtime/use-reason-prompt";
import {
  Notice,
  StatusChip,
  errorText,
  postJson,
  requestJson,
} from "./billing-client-utils";

type Readiness = { key: string; ok: boolean; detail: string };

type Method = {
  id: string;
  marketId: string;
  currency: string;
  methodKey: "BANK_TRANSFER" | "STRIPE_CARD" | "SAFEPAY_CARD";
  environment: "MANUAL" | "SANDBOX" | "PRODUCTION";
  displayName: string;
  enabled: boolean;
  approvalStatus: string;
  publicAvailable: boolean;
  readiness: Readiness[];
  market: { id: string; code: string; name: string };
};

type Market = {
  id: string;
  code: string;
  name: string;
  defaultCurrency: string;
  supportedCurrencies: string[];
};

type Account = {
  id: string;
  bankName: string;
  maskedAccountTitle: string;
  maskedIban: string | null;
  maskedAccountNumber: string | null;
  maskedRaastId: string | null;
  paymentInstructions: string | null;
  receiptContactEmail: string | null;
  receiptContactPhone: string | null;
  status: string;
  isActive: boolean;
  rejectionReason: string | null;
};

type Props = { initialMethods: Method[]; markets: Market[] };

const METHOD_LABEL: Record<Method["methodKey"], string> = {
  BANK_TRANSFER: "Bank transfer / Raast",
  STRIPE_CARD: "Card (Stripe)",
  SAFEPAY_CARD: "Card (Safepay)",
};

const BASE = "/api/super-admin/billing";

/**
 * Payment methods by market, and the receiving accounts behind a bank transfer.
 *
 * A method is publicly offered only when every gate passes, and the readiness
 * list says which one does not. Controls here are a convenience: each action is
 * authorised again by the API, where approving or enabling a method and
 * approving an account need the narrow billing-administration permission, and
 * an account cannot be approved by the operator who entered it.
 */
export function PaymentMethodsClient({ initialMethods, markets }: Props) {
  const [methods, setMethods] = useState(initialMethods);
  const [message, setMessage] = useState<{
    tone: "error" | "info";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [openAccounts, setOpenAccounts] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await requestJson<{ items: Method[] }>(
      `${BASE}/payment-methods`,
    );
    setMethods(next.items);
  }, []);

  async function run(
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      await reload();
      setMessage({ tone: "info", text: success });
    } catch (error) {
      setMessage({
        tone: "error",
        text: errorText(error, "The change was refused."),
      });
    } finally {
      setBusy(null);
    }
  }

  const patch = (id: string, part: string, body: unknown) =>
    requestJson(`${BASE}/payment-methods/${id}/${part}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        Customers are offered only methods that are{" "}
        <strong>approved, enabled and ready</strong> for their market and
        currency. Sandbox gateways are never offered in a production deployment.
        A bank transfer needs an approved, active receiving account that
        DijiPeople is legally permitted to use - nothing is pre-filled.
      </section>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowAdd((value) => !value)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add payment method
        </button>
      </div>

      {showAdd ? (
        <AddMethodForm
          markets={markets}
          onCreated={async () => {
            setShowAdd(false);
            await reload();
            setMessage({
              tone: "info",
              text: "Payment method added. It is not public until approved and enabled.",
            });
          }}
        />
      ) : null}

      <div className="grid gap-4">
        {methods.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No payment methods configured. Until one is approved, customers in
            Pakistan can only request a bank-transfer invoice from sales.
          </section>
        ) : null}
        {methods.map((method) => (
          <section
            key={method.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  {method.displayName}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {METHOD_LABEL[method.methodKey]} - {method.market.name} (
                  {method.market.code}) - {method.currency} -{" "}
                  {method.environment.toLowerCase()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip value={method.approvalStatus} />
                <StatusChip value={method.enabled ? "ENABLED" : "DISABLED"} />
                <StatusChip
                  value={method.publicAvailable ? "READY" : "NOT_READY"}
                />
              </div>
            </div>

            <ul className="mt-3 grid gap-1 text-sm md:grid-cols-2">
              {method.readiness.map((check) => (
                <li key={check.key} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={check.ok ? "text-emerald-600" : "text-rose-600"}
                  >
                    {check.ok ? "✓" : "✕"}
                  </span>
                  <span className="text-slate-700">
                    <span className="sr-only">
                      {check.ok ? "Passed: " : "Failed: "}
                    </span>
                    {check.detail}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              {method.approvalStatus !== "APPROVED" ? (
                <ActionButton
                  busy={busy === `${method.id}:approve`}
                  onClick={() =>
                    void run(
                      `${method.id}:approve`,
                      () =>
                        patch(method.id, "approval", { status: "APPROVED" }),
                      "Method approved.",
                    )
                  }
                >
                  Approve
                </ActionButton>
              ) : (
                <ActionButton
                  busy={busy === `${method.id}:suspend`}
                  onClick={() =>
                    void run(
                      `${method.id}:suspend`,
                      () =>
                        patch(method.id, "approval", { status: "SUSPENDED" }),
                      "Method suspended and withdrawn from checkout.",
                    )
                  }
                >
                  Suspend
                </ActionButton>
              )}
              <ActionButton
                busy={busy === `${method.id}:enable`}
                onClick={() =>
                  void run(
                    `${method.id}:enable`,
                    () =>
                      patch(method.id, "enabled", { enabled: !method.enabled }),
                    method.enabled
                      ? "Method disabled."
                      : "Method enabled for checkout.",
                  )
                }
              >
                {method.enabled ? "Disable" : "Enable"}
              </ActionButton>
              {method.methodKey === "BANK_TRANSFER" ? (
                <ActionButton
                  busy={false}
                  onClick={() =>
                    setOpenAccounts((current) =>
                      current === method.id ? null : method.id,
                    )
                  }
                >
                  {openAccounts === method.id
                    ? "Hide receiving accounts"
                    : "Receiving accounts"}
                </ActionButton>
              ) : null}
            </div>

            {openAccounts === method.id ? (
              <AccountsPanel
                methodId={method.id}
                onChanged={async (text) => {
                  await reload();
                  setMessage({ tone: "info", text });
                }}
                onError={(text) => setMessage({ tone: "error", text })}
              />
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

function AddMethodForm({
  markets,
  onCreated,
}: {
  markets: Market[];
  onCreated: () => Promise<void>;
}) {
  const [marketId, setMarketId] = useState(markets[0]?.id ?? "");
  const market = markets.find((m) => m.id === marketId);
  const [currency, setCurrency] = useState(
    markets[0]?.defaultCurrency ?? "PKR",
  );
  const [methodKey, setMethodKey] =
    useState<Method["methodKey"]>("BANK_TRANSFER");
  const [environment, setEnvironment] = useState("SANDBOX");
  const [displayName, setDisplayName] = useState("Bank transfer / Raast");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(`${BASE}/payment-methods`, {
        marketId,
        currency,
        methodKey,
        displayName,
        ...(methodKey === "BANK_TRANSFER" ? {} : { environment }),
      });
      await onCreated();
    } catch (e) {
      setError(errorText(e, "Could not add the method."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
    >
      <label className="text-sm font-medium text-slate-700">
        Market
        <select
          value={marketId}
          onChange={(event) => {
            setMarketId(event.target.value);
            const next = markets.find((m) => m.id === event.target.value);
            if (next) setCurrency(next.defaultCurrency);
          }}
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.code})
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Currency
        <select
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          {(market?.supportedCurrencies.length
            ? market.supportedCurrencies
            : [currency]
          ).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Method
        <select
          value={methodKey}
          onChange={(event) => {
            const key = event.target.value as Method["methodKey"];
            setMethodKey(key);
            setDisplayName(METHOD_LABEL[key]);
          }}
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          {(Object.keys(METHOD_LABEL) as Array<Method["methodKey"]>).map(
            (key) => (
              <option key={key} value={key}>
                {METHOD_LABEL[key]}
              </option>
            ),
          )}
        </select>
      </label>
      {methodKey !== "BANK_TRANSFER" ? (
        <label className="text-sm font-medium text-slate-700">
          Gateway environment
          <select
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="SANDBOX">
              Sandbox (never offered in production)
            </option>
            <option value="PRODUCTION">
              Production (merchant approval required)
            </option>
          </select>
        </label>
      ) : null}
      <label className="text-sm font-medium text-slate-700 md:col-span-2">
        Label shown to customers
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={80}
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </label>
      {error ? (
        <div className="md:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={busy || !marketId}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Add method
        </button>
      </div>
    </form>
  );
}

function AccountsPanel({
  methodId,
  onChanged,
  onError,
}: {
  methodId: string;
  onChanged: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const { requestReason, reasonDialog } = useReasonPrompt();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setAccounts(
      await requestJson<Account[]>(
        `${BASE}/payment-methods/${methodId}/accounts`,
      ),
    );
  }, [methodId]);

  useEffect(() => {
    void load().catch((e) => onError(errorText(e, "Could not load accounts.")));
    // onError is a stable inline closure of the parent; the load key is the method.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function decide(
    account: Account,
    action: "approve" | "reject" | "suspend" | "activate",
  ) {
    let reason: string | undefined;
    if (action === "reject" || action === "suspend") {
      const answer = await requestReason({
        title: `${action === "reject" ? "Reject" : "Suspend"} receiving account`,
        label: "Reason",
        confirmLabel: action === "reject" ? "Reject" : "Suspend",
        tone: "danger",
        minLength: 3,
      });
      if (!answer) return;
      reason = answer.trim();
    }
    setBusy(`${account.id}:${action}`);
    try {
      await postJson(
        `${BASE}/receiving-accounts/${account.id}/${action}`,
        reason ? { reason } : {},
      );
      await load();
      await onChanged(
        `Receiving account ${action === "activate" ? "activated" : action + "d"}.`,
      );
    } catch (e) {
      onError(errorText(e, "The change was refused."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {reasonDialog}
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">
          Receiving accounts
        </h4>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
        >
          {showForm ? "Cancel" : "Add account"}
        </button>
      </div>
      <p className="text-xs text-slate-600">
        Identifiers are stored encrypted and shown here masked. A different
        operator must approve an account you added.
      </p>

      {showForm ? (
        <AccountForm
          methodId={methodId}
          onCreated={async () => {
            setShowForm(false);
            await load();
            await onChanged(
              "Receiving account added. It needs approval by another operator.",
            );
          }}
        />
      ) : null}

      {accounts === null ? (
        <p className="text-sm text-slate-500" aria-busy="true">
          Loading...
        </p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-slate-600">No receiving account yet.</p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">
                    {account.bankName} - {account.maskedAccountTitle}
                  </p>
                  <p className="font-mono text-xs text-slate-600">
                    {[
                      account.maskedIban,
                      account.maskedAccountNumber,
                      account.maskedRaastId,
                    ]
                      .filter(Boolean)
                      .join("  ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip value={account.status} />
                  {account.isActive ? <StatusChip value="ACTIVE" /> : null}
                </div>
              </div>
              {account.rejectionReason ? (
                <p className="mt-1 text-xs text-slate-600">
                  Reason: {account.rejectionReason}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {account.status === "PENDING_APPROVAL" ? (
                  <>
                    <ActionButton
                      busy={busy === `${account.id}:approve`}
                      onClick={() => void decide(account, "approve")}
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      busy={busy === `${account.id}:reject`}
                      onClick={() => void decide(account, "reject")}
                    >
                      Reject
                    </ActionButton>
                  </>
                ) : null}
                {account.status === "APPROVED" && !account.isActive ? (
                  <ActionButton
                    busy={busy === `${account.id}:activate`}
                    onClick={() => void decide(account, "activate")}
                  >
                    Make active
                  </ActionButton>
                ) : null}
                {account.status === "APPROVED" ? (
                  <ActionButton
                    busy={busy === `${account.id}:suspend`}
                    onClick={() => void decide(account, "suspend")}
                  >
                    Suspend
                  </ActionButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountForm({
  methodId,
  onCreated,
}: {
  methodId: string;
  onCreated: () => Promise<void>;
}) {
  const [values, setValues] = useState({
    bankName: "",
    accountTitle: "",
    iban: "",
    accountNumber: "",
    raastId: "",
    paymentInstructions: "",
    receiptContactEmail: "",
    receiptContactPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (key: keyof typeof values) => (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Empty optional fields are omitted: the API rejects unknown or blank values.
      const body = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value.trim() !== ""),
      );
      await postJson(`${BASE}/payment-methods/${methodId}/accounts`, body);
      await onCreated();
    } catch (e) {
      setError(errorText(e, "Could not add the account."));
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm";
  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2"
    >
      <label className="text-sm font-medium text-slate-700">
        Bank name
        <input
          required
          value={values.bankName}
          onChange={set("bankName")}
          className={input}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Account title (as registered with the bank)
        <input
          required
          value={values.accountTitle}
          onChange={set("accountTitle")}
          className={input}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        IBAN
        <input
          value={values.iban}
          onChange={set("iban")}
          className={input}
          autoComplete="off"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Account number
        <input
          value={values.accountNumber}
          onChange={set("accountNumber")}
          className={input}
          autoComplete="off"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Raast ID
        <input
          value={values.raastId}
          onChange={set("raastId")}
          className={input}
          autoComplete="off"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Receipt email (payers send proof here)
        <input
          type="email"
          value={values.receiptContactEmail}
          onChange={set("receiptContactEmail")}
          maxLength={120}
          className={input}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Receipt WhatsApp / phone
        <input
          type="tel"
          value={values.receiptContactPhone}
          onChange={set("receiptContactPhone")}
          maxLength={20}
          className={input}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Instructions shown to the payer (optional)
        <input
          value={values.paymentInstructions}
          onChange={set("paymentInstructions")}
          maxLength={500}
          className={input}
        />
      </label>
      {error ? (
        <div className="md:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Save account
        </button>
      </div>
    </form>
  );
}
