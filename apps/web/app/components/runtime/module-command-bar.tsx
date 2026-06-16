"use client";

import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleX,
  Download,
  Edit,
  FileDown,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcwKey,
  Save,
  Share2,
  Trash2,
  Upload,
  UserRoundCheck,
  X,
} from "lucide-react";
import type { CommandDefinition } from "../../../lib/runtime/command-runtime.types";
import type { ModuleRuntimeContext } from "../../../lib/runtime/module-runtime.types";
import type {
  RuntimeCommandGroups,
  RuntimeCommandHandler,
  RuntimeCommandPlacementGroup,
  RuntimeCommandButtonGroup,
  RuntimeRecordData,
} from "./module-runtime-ui.types";

const COMMAND_ICON_CLASS_NAME = "h-4 w-4";

type NormalizedRuntimeCommandGroups = Required<RuntimeCommandGroups> & {
  readonly groups: readonly RuntimeCommandButtonGroup[];
};

export function ModuleCommandBar({
  commands,
  disabled = false,
  loading = false,
  onCommand,
  record,
  runtime,
  selectedRecordIds,
}: {
  readonly commands: readonly CommandDefinition[] | RuntimeCommandGroups;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
}) {
  const groups = useMemo(() => normalizeCommandGroups(commands), [commands]);

  return (
    <div className="rounded-lg border border-border bg-white shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-1 px-3 py-2">
        <CommandButtonGroup
          commands={groups.primary}
          disabled={disabled}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
          source="primary"
        />
        <CommandButtonGroup
          commands={groups.secondary}
          disabled={disabled}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
          source="secondary"
        />
        <CommandOverflow
          commands={groups.overflow}
          disabled={disabled}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
          source="overflow"
        />
        {groups.destructive.length === 1 ? (
          <CommandButtonGroup
            commands={groups.destructive}
            disabled={disabled}
            loading={loading}
            onCommand={onCommand}
            record={record}
            runtime={runtime}
            selectedRecordIds={selectedRecordIds}
            source="destructive"
          />
        ) : (
          <CommandOverflow
            commands={groups.destructive}
            destructive
            disabled={disabled}
            loading={loading}
            onCommand={onCommand}
            record={record}
            runtime={runtime}
            selectedRecordIds={selectedRecordIds}
            source="destructive"
          />
        )}
        <CommandDropdownGroups
          disabled={disabled}
          groups={groups.groups}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
        />
      </div>
    </div>
  );
}

function CommandDropdownGroups({
  disabled,
  groups,
  loading,
  onCommand,
  record,
  runtime,
  selectedRecordIds,
}: {
  readonly disabled: boolean;
  readonly groups?: readonly RuntimeCommandButtonGroup[];
  readonly loading: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
}) {
  if (!groups?.length) return null;

  return (
    <>
      {groups.map((group) => (
        <CommandGroupDropdown
          disabled={disabled}
          group={group}
          key={group.key}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
        />
      ))}
    </>
  );
}

function CommandGroupDropdown({
  disabled,
  group,
  loading,
  onCommand,
  record,
  runtime,
  selectedRecordIds,
}: {
  readonly disabled: boolean;
  readonly group: RuntimeCommandButtonGroup;
  readonly loading: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-medium text-foreground transition hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled || loading}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {renderCommandGroupIcon(group)}
        <span>{group.label}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-border bg-white p-1 shadow-xl"
          role="menu"
        >
          {group.commands.map((command) => (
            <CommandMenuButton
              command={command}
              disabled={disabled}
              key={command.key}
              loading={loading}
              onCommand={(commandKey, context) => {
                onCommand(commandKey, context);
                setOpen(false);
              }}
              record={record}
              runtime={runtime}
              selectedRecordIds={selectedRecordIds}
              source="group"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommandButtonGroup({
  commands,
  disabled,
  loading,
  onCommand,
  record,
  runtime,
  selectedRecordIds,
  source,
}: {
  readonly commands?: readonly CommandDefinition[];
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
  readonly source: RuntimeCommandPlacementGroup;
}) {
  if (!commands?.length) return null;

  return (
    <>
      {commands.map((command) => (
        <CommandButton
          command={command}
          disabled={disabled}
          key={command.key}
          loading={loading}
          onCommand={onCommand}
          record={record}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
          source={source}
        />
      ))}
    </>
  );
}

function CommandOverflow({
  commands,
  destructive = false,
  disabled,
  loading,
  onCommand,
  record,
  runtime,
  selectedRecordIds,
  source,
}: {
  readonly commands?: readonly CommandDefinition[];
  readonly destructive?: boolean;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
  readonly source: RuntimeCommandPlacementGroup;
}) {
  const [open, setOpen] = useState(false);

  if (!commands?.length) return null;

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={destructive ? "Destructive commands" : "More commands"}
        className={`inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium transition hover:bg-muted/20 ${
          destructive ? "text-danger" : "text-foreground"
        }`}
        disabled={disabled || loading}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {destructive ? (
          <Trash2 className="h-4 w-4" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
        <ChevronDown className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-border bg-white p-1 shadow-xl"
          role="menu"
        >
          {commands.map((command) => (
            <CommandMenuButton
              command={command}
              disabled={disabled}
              key={command.key}
              loading={loading}
              onCommand={(commandKey, context) => {
                onCommand(commandKey, context);
                setOpen(false);
              }}
              record={record}
              runtime={runtime}
              selectedRecordIds={selectedRecordIds}
              source={source}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommandButton({
  command,
  disabled,
  loading,
  onCommand,
  record,
  runtime,
  selectedRecordIds,
  source,
}: {
  readonly command: CommandDefinition;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onCommand: RuntimeCommandHandler;
  readonly record?: RuntimeRecordData | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
  readonly source: RuntimeCommandPlacementGroup;
}) {
  const isDisabled = disabled || loading || command.isDisabled;

  return (
    <button
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60 ${
        command.isDestructive ? "text-danger" : "text-foreground"
      }`}
      disabled={isDisabled}
      onClick={() =>
        emitCommand(
          onCommand,
          command.key,
          runtime,
          record,
          selectedRecordIds,
          source,
        )
      }
      title={
        command.isDisabled
          ? (command.disabledReason ?? command.description)
          : (command.description ?? command.label)
      }
      type="button"
    >
      {renderCommandIcon(command.key)}
      <span>{command.label}</span>
    </button>
  );
}

function CommandMenuButton(props: Parameters<typeof CommandButton>[0]) {
  const isDisabled =
    props.disabled || props.loading || props.command.isDisabled;

  return (
    <button
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60 ${
        props.command.isDestructive ? "text-danger" : "text-foreground"
      }`}
      disabled={isDisabled}
      onClick={() =>
        emitCommand(
          props.onCommand,
          props.command.key,
          props.runtime,
          props.record,
          props.selectedRecordIds,
          props.source,
        )
      }
      role="menuitem"
      title={
        props.command.isDisabled
          ? (props.command.disabledReason ?? props.command.description)
          : (props.command.description ?? props.command.label)
      }
      type="button"
    >
      {renderCommandIcon(props.command.key)}
      <span>{props.command.label}</span>
    </button>
  );
}

function normalizeCommandGroups(
  commands: readonly CommandDefinition[] | RuntimeCommandGroups,
): NormalizedRuntimeCommandGroups {
  if (!isCommandList(commands)) {
    const primary = commands.primary ?? [];
    const secondary = commands.secondary ?? [];
    const overflow = commands.overflow ?? [];
    const groupCommands = commands.group ?? [];
    const groups = buildCommandButtonGroups([
      ...groupCommands,
      ...primary,
      ...secondary,
      ...overflow,
    ]);
    const groupedKeys = new Set(
      groups.flatMap((group) => group.commands.map((command) => command.key)),
    );

    return {
      primary: primary.filter((command) => !groupedKeys.has(command.key)),
      secondary: secondary.filter((command) => !groupedKeys.has(command.key)),
      overflow: overflow.filter((command) => !groupedKeys.has(command.key)),
      destructive: commands.destructive ?? [],
      group: groupCommands,
      groups,
      statusGroup: commands.statusGroup ?? [],
    };
  }

  const statusGroup = commands.filter(
    (command) => command.placement === "detail-status-group",
  );
  const destructive = commands.filter((command) => command.isDestructive);
  const visible = commands.filter(
    (command) =>
      !command.isDestructive && command.placement !== "detail-status-group",
  );
  const groupedCommands = buildCommandButtonGroups(visible);
  const groupedKeys = new Set(
    groupedCommands.flatMap((group) =>
      group.commands.map((command) => command.key),
    ),
  );
  const ungroupedVisible = visible.filter(
    (command) => !groupedKeys.has(command.key),
  );

  return {
    primary: ungroupedVisible.filter((command) =>
      command.placement.endsWith("command-bar"),
    ),
    secondary: [],
    overflow: ungroupedVisible.filter(
      (command) => !command.placement.endsWith("command-bar"),
    ),
    destructive,
    group: [],
    groups: groupedCommands,
    statusGroup,
  };
}

function buildCommandButtonGroups(commands: readonly CommandDefinition[]) {
  const groups = new Map<string, RuntimeCommandButtonGroup>();

  for (const command of commands) {
    if (!command.groupKey) continue;
    const current = groups.get(command.groupKey);
    if (current) {
      groups.set(command.groupKey, {
        ...current,
        commands: [...current.commands, command],
      });
    } else {
      groups.set(command.groupKey, {
        key: command.groupKey,
        label: command.groupLabel ?? command.groupKey,
        commands: [command],
      });
    }
  }

  return Array.from(groups.values());
}

function emitCommand(
  onCommand: RuntimeCommandHandler,
  commandKey: string,
  runtime: ModuleRuntimeContext,
  record: RuntimeRecordData | null | undefined,
  selectedRecordIds: readonly string[] | undefined,
  source: RuntimeCommandPlacementGroup,
) {
  onCommand(commandKey, {
    runtime,
    record,
    recordId: runtime.recordId,
    selectedRecordIds,
    source,
  });
}

function isCommandList(
  commands: readonly CommandDefinition[] | RuntimeCommandGroups,
): commands is readonly CommandDefinition[] {
  return Array.isArray(commands);
}

function renderCommandGroupIcon(group: RuntimeCommandButtonGroup) {
  if (group.key === "data-transfer") {
    return <Download className={COMMAND_ICON_CLASS_NAME} />;
  }

  return <MoreHorizontal className={COMMAND_ICON_CLASS_NAME} />;
}

function renderCommandIcon(commandKey: string) {
  const normalized = commandKey.split(".").at(-1) ?? commandKey;

  switch (normalized) {
    case "activate":
    case "approve":
      return <Check className={COMMAND_ICON_CLASS_NAME} />;
    case "back":
      return <ChevronLeft className={COMMAND_ICON_CLASS_NAME} />;
    case "deactivate":
    case "reject":
      return <X className={COMMAND_ICON_CLASS_NAME} />;
    case "delete":
      return <Trash2 className={COMMAND_ICON_CLASS_NAME} />;
    case "assign":
    case "assignOwner":
      return <UserRoundCheck className={COMMAND_ICON_CLASS_NAME} />;
    case "remove":
      return <CircleX className={COMMAND_ICON_CLASS_NAME} />;
    case "edit":
      return <Edit className={COMMAND_ICON_CLASS_NAME} />;
    case "export":
      return <Download className={COMMAND_ICON_CLASS_NAME} />;
    case "exportTemplate":
      return <FileDown className={COMMAND_ICON_CLASS_NAME} />;
    case "import":
      return <Upload className={COMMAND_ICON_CLASS_NAME} />;
    case "new":
      return <Plus className={COMMAND_ICON_CLASS_NAME} />;
    case "refresh":
      return <RefreshCw className={COMMAND_ICON_CLASS_NAME} />;
    case "resetPassword":
      return <RotateCcwKey className={COMMAND_ICON_CLASS_NAME} />;
    case "restore":
      return <ArchiveRestore className={COMMAND_ICON_CLASS_NAME} />;
    case "save":
    case "saveAndClose":
      return <Save className={COMMAND_ICON_CLASS_NAME} />;
    case "share":
      return <Share2 className={COMMAND_ICON_CLASS_NAME} />;
    default:
      return <MoreHorizontal className={COMMAND_ICON_CLASS_NAME} />;
  }
}
