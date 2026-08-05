"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Save, Search, ShieldOff, X } from "lucide-react";
import { AppNotification } from "@/app/_components/notifications/app-notification";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { formatPlatformDate } from "@/lib/platform-formatters";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import {
  formatPlatformRole,
  PLATFORM_ROLES,
  type PlatformRole,
} from "@/lib/platform-rbac";

type PlatformStatus = "ACTIVE" | "INVITED" | "DISABLED";

type PlatformUser = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: PlatformRole;
  status: PlatformStatus;
  lastActiveAt?: string | null;
};

type FormState = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: PlatformRole;
  status: PlatformStatus;
};

const emptyForm: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  role: "MEMBER",
  status: "ACTIVE",
};

export function SettingsUsersClient({
  currentUserId,
  users,
}: {
  currentUserId?: string;
  users: PlatformUser[];
}) {
  const router = useRouter();
  const { defaults } = usePlatformDefaults();
  const [query, setQuery] = useState("");
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      [user.firstName, user.lastName, user.email, user.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, users]);

  function openCreate() {
    setEditingUser(null);
    setForm(emptyForm);
    setMessage(null);
  }

  function openEdit(user: PlatformUser) {
    setEditingUser(user);
    setForm({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: "",
      role: user.role,
      status: user.status,
    });
    setMessage(null);
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    if (!form.firstName.trim()) return "First name is required.";
    if (!form.lastName.trim()) return "Last name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return "A valid email is required.";
    if (!editingUser && form.password.length < 8)
      return "Temporary password must be at least 8 characters.";
    return null;
  }

  function saveUser() {
    const error = validate();
    if (error) {
      setMessage({ tone: "error", text: error });
      return;
    }

    startTransition(async () => {
      const response = await fetch(
        editingUser ? `/api/users/${editingUser.userId}` : "/api/users",
        {
          method: editingUser ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            role: form.role,
            status: form.status,
            ...(editingUser ? {} : { password: form.password }),
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({
          tone: "error",
          text: payload?.message ?? "Unable to save user.",
        });
        return;
      }

      setMessage({
        tone: "success",
        text: editingUser ? "User updated." : "User created.",
      });
      router.refresh();
    });
  }

  function deleteUser(user: PlatformUser) {
    if (user.userId === currentUserId) {
      setMessage({
        tone: "error",
        text: "You cannot remove your own account from here.",
      });
      return;
    }
    if (!window.confirm(`Disable ${user.email}?`)) return;
    startTransition(async () => {
      const response = await fetch(`/api/users/${user.userId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({
          tone: "error",
          text: payload?.message ?? "Unable to remove user.",
        });
        return;
      }
      setMessage({ tone: "success", text: "User disabled." });
      router.refresh();
    });
  }

  const panelOpen = editingUser !== null || form !== emptyForm;
  const columns: ProDataTableColumn<PlatformUser>[] = [
      {
        key: "user",
        header: "User",
        width: 260,
        sortable: true,
        render: (user) => (
          <div>
            <div className="font-semibold text-slate-950">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-slate-500">{user.email}</div>
          </div>
        ),
      },
      {
        key: "role",
        header: "Platform role",
        width: 160,
        sortable: true,
        render: (user) => formatPlatformRole(user.role),
      },
      {
        key: "status",
        header: "Status",
        width: 120,
        sortable: true,
        render: (user) => (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            {user.status ?? "Unknown"}
          </span>
        ),
      },
      {
        key: "lastActiveAt",
        header: "Last active",
        width: 180,
        sortable: true,
        render: (user) => formatPlatformDate(user.lastActiveAt, defaults),
      },
      {
        key: "actions",
        header: "Actions",
        width: 120,
        align: "right",
        sticky: "right",
        render: (user) => (
          <div className="flex justify-end gap-1">
            <button
              className="rounded-lg px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => openEdit(user)}
              type="button"
            >
              Edit
            </button>
            <button
              aria-label={`Disable ${user.email}`}
              className="rounded-lg px-2 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
              disabled={user.userId === currentUserId}
              onClick={() => deleteUser(user)}
              type="button"
            >
              <ShieldOff className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users..."
              value={query}
            />
          </div>
          <div className="flex justify-end gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => router.refresh()}
              type="button"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={openCreate}
              type="button"
            >
              <Plus className="h-4 w-4" /> Add user
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <AppNotification tone={message.tone}>{message.text}</AppNotification>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ProDataTable
          rows={filteredUsers}
          columns={columns}
          rowKey={(user) => user.userId}
          stickyHeader
          maxHeight="calc(100vh - 310px)"
          emptyTitle="No platform users found"
          emptyDescription="Adjust the search or add a platform user."
        />

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {editingUser ? "Edit user" : "Add user"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Platform-only access. Tenant roles are managed in tenant
                context.
              </p>
            </div>
            {panelOpen ? (
              <button
                aria-label="Clear form"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setEditingUser(null);
                  setForm(emptyForm);
                }}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            <Field
              label="First name"
              value={form.firstName}
              onChange={(value) => updateForm("firstName", value)}
            />
            <Field
              label="Last name"
              value={form.lastName}
              onChange={(value) => updateForm("lastName", value)}
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => updateForm("email", value)}
            />
            {!editingUser ? (
              <Field
                label="Temporary password"
                type="password"
                value={form.password}
                onChange={(value) => updateForm("password", value)}
              />
            ) : null}
            <SelectField
              label="Platform role"
              onChange={(value) => updateForm("role", value as PlatformRole)}
              options={PLATFORM_ROLES.map((role) => ({
                label: formatPlatformRole(role),
                value: role,
              }))}
              value={form.role}
            />
            <SelectField
              label="Status"
              onChange={(value) =>
                updateForm("status", value as PlatformStatus)
              }
              options={[
                { label: "Active", value: "ACTIVE" },
                { label: "Invited", value: "INVITED" },
                { label: "Disabled", value: "DISABLED" },
              ]}
              value={form.status}
            />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={isPending}
              onClick={saveUser}
              type="button"
            >
              <Save className="h-4 w-4" />{" "}
              {editingUser ? "Save user" : "Create user"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Field({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
