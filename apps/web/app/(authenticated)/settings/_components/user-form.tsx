"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { LookupField, TextField } from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { AccessUserRecord, BusinessUnitRecord } from "../types";

type UserFormProps = {
  businessUnits: BusinessUnitRecord[];
  employees?: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    workEmail?: string | null;
    userId?: string | null;
  }>;
  user?: AccessUserRecord;
};

export function UserForm({
  businessUnits,
  employees = [],
  user,
}: UserFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState(
    user?.businessUnitId ?? "",
  );
  const [employeeId, setEmployeeId] = useState(user?.linkedEmployee?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        user ? `/api/users/${user.userId}` : "/api/users",
        {
          method: user ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            businessUnitId,
            ...(!user && employeeId ? { employeeId } : {}),
            ...(user ? {} : { password }),
          }),
        },
      );
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

      router.push(`/settings/security-access/users/${payload.userId}`);
      router.refresh();
    } catch {
      setError("User save failed. Check that the API is running.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      description="Create the tenant identity, optionally link an existing employee, then assign roles from the access page."
      title={user ? "Edit User" : "Create User"}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="First name"
          onChange={setFirstName}
          required
          value={firstName}
        />
        <TextField
          label="Last name"
          onChange={setLastName}
          required
          value={lastName}
        />
        <TextField
          label="Work email"
          onChange={setEmail}
          required
          type="email"
          value={email}
        />
        {!user ? (
          <TextField
            hint="At least 8 characters. The user can change it after signing in."
            label="Temporary password"
            onChange={setPassword}
            required
            type="password"
            value={password}
          />
        ) : null}
        <LookupField
          label="Business unit"
          onChange={setBusinessUnitId}
          options={businessUnits.map((unit) => ({
            id: unit.id,
            name: unit.name,
            subtitle: unit.organization?.name,
          }))}
          placeholder="Select business unit"
          value={businessUnitId}
        />
        {!user ? (
          <LookupField
            hint="Only employees that are not already linked to a user are available."
            label="Link employee"
            onChange={setEmployeeId}
            options={employees
              .filter((employee) => !employee.userId)
              .map((employee) => ({
                id: employee.id,
                name: employee.fullName,
                code: employee.employeeCode,
                subtitle: employee.workEmail,
              }))}
            placeholder="Select an employee"
            value={employeeId}
          />
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button disabled={saving} onClick={save} type="button">
          {saving ? "Saving..." : user ? "Save user" : "Create user"}
        </Button>
        <Button onClick={() => router.back()} type="button" variant="secondary">
          Cancel
        </Button>
      </div>
    </SectionCard>
  );
}
