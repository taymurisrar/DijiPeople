"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SectionCard } from "@/app/components/ui/section-card";
import { AccessUserRecord, BusinessUnitRecord } from "../types";

type UserFormProps = {
  businessUnits: BusinessUnitRecord[];
  user?: AccessUserRecord;
};

export function UserForm({ businessUnits, user }: UserFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState(user?.businessUnitId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(user ? `/api/users/${user.userId}` : "/api/users", {
        method: user ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          businessUnitId,
          ...(user ? {} : { password }),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | AccessUserRecord
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("userId" in payload)) {
        setError(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Unable to save user.",
        );
        return;
      }

      router.push(`/dashboard/settings/access/users/${payload.userId}`);
      router.refresh();
    } catch {
      setError("User save failed. Check that the API is running.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      description="Create the tenant account first, then link it to an employee and assign roles from the access page."
      title={user ? "Edit User" : "Create User"}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="First name">
          <input
            className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setFirstName(event.target.value)}
            value={firstName}
          />
        </FormField>
        <FormField label="Last name">
          <input
            className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setLastName(event.target.value)}
            value={lastName}
          />
        </FormField>
        <FormField label="Work email">
          <input
            className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </FormField>
        {!user ? (
          <FormField label="Temporary password">
            <input
              className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </FormField>
        ) : null}
        <FormField label="Business unit">
          <select
            className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setBusinessUnitId(event.target.value)}
            value={businessUnitId}
          >
            <option value="">Select business unit</option>
            {businessUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
                {unit.organization?.name ? ` (${unit.organization.name})` : ""}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={saving}
          onClick={save}
          type="button"
        >
          {saving ? "Saving..." : user ? "Save user" : "Create user"}
        </button>
        <button
          className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground"
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
      </div>
    </SectionCard>
  );
}

function FormField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
