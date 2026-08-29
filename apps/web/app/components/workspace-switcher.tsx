import { cookies } from "next/headers";
import { getApiBaseUrl } from "@repo/config";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_APP_CLIENT_ID,
} from "@/lib/auth-config";

type Workspace = {
  tenantId: string;
  name: string;
  slug: string;
  environmentType: string;
  url: string;
  canOpen: boolean;
  unavailableReason: string | null;
  isCurrent?: boolean;
};

const SECTION_LABEL_ID = "workspace-switcher-label";

export async function WorkspaceSwitcher() {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const workspaces = await loadWorkspaces(token);

  if (!workspaces || workspaces.length < 2) {
    return null;
  }

  const otherWorkspaces = workspaces.filter(
    (workspace) => !workspace.isCurrent,
  );

  if (!otherWorkspaces.length) {
    return null;
  }

  return (
    <section className="mt-3 border-t border-border pt-3">
      <div className="mb-1 flex items-center justify-between px-4">
        <p
          id={SECTION_LABEL_ID}
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
        >
          Switch workspace
        </p>

        <span className="text-[11px] text-muted">
          {otherWorkspaces.length}
        </span>
      </div>

      <ul
        aria-labelledby={SECTION_LABEL_ID}
        className="grid max-h-64 gap-1 overflow-y-auto px-2"
      >
        {otherWorkspaces.map((workspace) => (
          <li key={workspace.tenantId}>
            <WorkspaceItem workspace={workspace} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WorkspaceItem({ workspace }: { workspace: Workspace }) {
  const initials = getWorkspaceInitials(workspace.name);
  const environment = formatEnvironment(workspace.environmentType);

  if (!workspace.canOpen) {
    return (
      <div
        className="
          flex cursor-not-allowed items-center gap-3
          rounded-xl px-3 py-2.5
          opacity-65
        "
        aria-disabled="true"
      >
        <WorkspaceAvatar initials={initials} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-muted">
              {workspace.name}
            </span>

            {environment && (
              <EnvironmentBadge environment={environment} />
            )}
          </div>

          <p className="mt-0.5 truncate text-xs text-muted">
            {workspace.unavailableReason ?? "Currently unavailable"}
          </p>
        </div>

        <UnavailableIcon />
      </div>
    );
  }

  return (
    <a
      href={workspace.url}
      className="
        group flex items-center gap-3
        rounded-xl px-3 py-2.5
        outline-none transition-colors
        hover:bg-surface
        focus-visible:ring-2
        focus-visible:ring-accent
        focus-visible:ring-offset-2
        focus-visible:ring-offset-background
      "
      aria-label={`Switch to ${workspace.name}`}
    >
      <WorkspaceAvatar initials={initials} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {workspace.name}
          </span>

          {environment && (
            <EnvironmentBadge environment={environment} />
          )}
        </div>

        <p className="mt-0.5 truncate text-xs text-muted">
          {hostOf(workspace.url)}
        </p>
      </div>

      <ChevronIcon />
    </a>
  );
}

function WorkspaceAvatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="
        flex h-9 w-9 shrink-0 items-center justify-center
        rounded-lg border border-border
        bg-background text-xs font-semibold text-foreground
        transition-colors
        group-hover:border-accent/30
        group-hover:bg-accent/5
      "
    >
      {initials}
    </span>
  );
}

function EnvironmentBadge({ environment }: { environment: string }) {
  return (
    <span
      className="
        shrink-0 rounded-full
        border border-border
        bg-background
        px-1.5 py-0.5
        text-[9px] font-semibold uppercase
        tracking-[0.08em] text-muted
      "
    >
      {environment}
    </span>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="
        h-4 w-4 shrink-0 text-muted
        transition-transform
        group-hover:translate-x-0.5
        group-hover:text-foreground
      "
    >
      <path
        d="M7.5 5 12.5 10l-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UnavailableIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4 shrink-0 text-muted"
    >
      <circle
        cx="10"
        cy="10"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M7.5 7.5 12.5 12.5M12.5 7.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getWorkspaceInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "WS";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function formatEnvironment(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  const labels: Record<string, string> = {
    production: "Prod",
    prod: "Prod",
    uat: "UAT",
    staging: "Stage",
    stage: "Stage",
    development: "Dev",
    dev: "Dev",
    sandbox: "Sandbox",
    test: "Test",
    qa: "QA",
  };

  return labels[normalized] ?? value;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function loadWorkspaces(
  token: string,
): Promise<Workspace[] | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/workspaces/mine`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as {
      workspaces?: Workspace[];
    };

    return body.workspaces ?? null;
  } catch {
    return null;
  }
}