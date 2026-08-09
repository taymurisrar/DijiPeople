/*
 * The commands an action bar can carry, and where a bar can appear.
 *
 * Typed keys rather than free text: the runtime resolves a command by key, so a
 * typo in the designer produced a button that rendered and did nothing. The
 * catalog is the same set the module definitions register.
 */

export type CommandPlacementKey =
  | "list-command-bar"
  | "detail-command-bar"
  | "detail-status-group"
  | "bulk-menu";

/**
 * Where an action bar shows up, in the words someone configuring it would use.
 *
 * "Scope" on its own told an administrator nothing about whether they were
 * editing the toolbar above a list, the one on an open record, or the menu that
 * appears once rows are ticked.
 */
export const COMMAND_PLACEMENTS: ReadonlyArray<{
  key: CommandPlacementKey;
  label: string;
  description: string;
}> = [
  {
    key: "list-command-bar",
    label: "List toolbar",
    description:
      "The toolbar above the module's list view, before any record is opened.",
  },
  {
    key: "detail-command-bar",
    label: "Record toolbar",
    description:
      "The toolbar on an open record — the main form and its related lists.",
  },
  {
    key: "detail-status-group",
    label: "Record status group",
    description:
      "The status and owner controls grouped at the top of an open record.",
  },
  {
    key: "bulk-menu",
    label: "Bulk actions menu",
    description:
      "The menu that appears once rows are selected in a list view.",
  },
];

export type CommandCatalogEntry = {
  key: string;
  label: string;
  description: string;
  /* Lucide icon name, used as the default when an action sets none. */
  icon: string;
  placements: readonly CommandPlacementKey[];
};

export const COMMAND_CATALOG: readonly CommandCatalogEntry[] = [
  {
    key: "system.new",
    label: "New",
    description: "Starts a new record in this module.",
    icon: "Plus",
    placements: ["list-command-bar"],
  },
  {
    key: "system.edit",
    label: "Edit",
    description: "Opens the current record for editing.",
    icon: "Pencil",
    placements: ["list-command-bar", "detail-command-bar"],
  },
  {
    key: "system.save",
    label: "Save",
    description: "Saves the open record and stays on it.",
    icon: "Save",
    placements: ["detail-command-bar"],
  },
  {
    key: "system.saveAndClose",
    label: "Save & Close",
    description: "Saves the open record and returns to the list.",
    icon: "CheckCheck",
    placements: ["detail-command-bar"],
  },
  {
    key: "system.delete",
    label: "Delete",
    description: "Deletes the current record, subject to dependency checks.",
    icon: "Trash2",
    placements: ["list-command-bar", "detail-command-bar"],
  },
  {
    key: "system.refresh",
    label: "Refresh",
    description: "Reloads the current list or record from the server.",
    icon: "RotateCw",
    placements: ["list-command-bar", "detail-command-bar"],
  },
  {
    key: "system.back",
    label: "Back",
    description: "Returns to the list without saving.",
    icon: "ArrowLeft",
    placements: ["detail-command-bar"],
  },
  {
    key: "system.import",
    label: "Import",
    description: "Uploads a workbook of records into this module.",
    icon: "Upload",
    placements: ["list-command-bar"],
  },
  {
    key: "system.export",
    label: "Export",
    description: "Exports the current view, respecting filters and access.",
    icon: "Download",
    placements: ["list-command-bar"],
  },
  {
    key: "system.exportTemplate",
    label: "Export Template",
    description: "Downloads an empty workbook shaped for import.",
    icon: "FileDown",
    placements: ["list-command-bar"],
  },
  {
    key: "record.assignOwner",
    label: "Assign Owner",
    description: "Reassigns the record to another user or team.",
    icon: "UserCog",
    placements: ["detail-command-bar", "detail-status-group"],
  },
  {
    key: "record.share",
    label: "Share",
    description: "Grants another user or team access to this record.",
    icon: "Share2",
    placements: ["detail-command-bar"],
  },
  {
    key: "record.changeStatus",
    label: "Change Status",
    description: "Moves the record to another status.",
    icon: "CircleDot",
    placements: ["detail-status-group"],
  },
  {
    key: "record.changeSubStatus",
    label: "Change Sub Status",
    description: "Sets the sub status within the current status.",
    icon: "CircleDashed",
    placements: ["detail-status-group"],
  },
  {
    key: "record.export",
    label: "Export Record",
    description: "Exports the open record on its own.",
    icon: "FileOutput",
    placements: ["detail-command-bar"],
  },
  {
    key: "selection.assignOwner",
    label: "Assign Owner (selected)",
    description: "Reassigns every selected record in one step.",
    icon: "Users",
    placements: ["bulk-menu"],
  },
  {
    key: "selection.delete",
    label: "Delete (selected)",
    description: "Deletes every selected record, subject to dependencies.",
    icon: "Trash",
    placements: ["bulk-menu"],
  },
];

const BY_KEY = new Map(COMMAND_CATALOG.map((entry) => [entry.key, entry]));

export function findCommand(key: string): CommandCatalogEntry | undefined {
  return BY_KEY.get(key);
}

/** Commands that make sense on a given bar, for filtering the picker. */
export function commandsForPlacement(
  placement: CommandPlacementKey | undefined,
): readonly CommandCatalogEntry[] {
  if (!placement) return COMMAND_CATALOG;
  return COMMAND_CATALOG.filter((entry) =>
    entry.placements.includes(placement),
  );
}

/*
 * Icons offered in the picker. Deliberately a curated list rather than every
 * Lucide name: an action bar needs a recognisable verb, and a thousand-entry
 * dropdown is not a choice anyone makes well.
 */
export const COMMAND_ICON_CHOICES: readonly string[] = [
  "Plus",
  "Pencil",
  "Save",
  "CheckCheck",
  "Check",
  "Trash2",
  "Trash",
  "RotateCw",
  "ArrowLeft",
  "ArrowRight",
  "Upload",
  "Download",
  "FileDown",
  "FileOutput",
  "FileText",
  "UserCog",
  "Users",
  "Share2",
  "CircleDot",
  "CircleDashed",
  "Copy",
  "Eye",
  "EyeOff",
  "Lock",
  "Mail",
  "Printer",
  "Send",
  "Star",
  "Tag",
];
