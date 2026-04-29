import { LucideIcon } from "lucide-react";

export type CommandBarVariant = "form" | "list";

export type CommandBarActionContext = {
  selectedCount?: number;
  selectedIds?: string[];
  isDirty?: boolean;
  isReadOnly?: boolean;
};

export type CommandBarAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  hidden?: boolean;
  disabled?: boolean;
  danger?: boolean;

  /**
   * Enables the command only when at least one record is selected.
   */
  requiresSelection?: boolean;

  /**
   * Enables the command only when exactly one record is selected.
   * Use this for Edit/View-type record commands.
   */
  singleSelectionOnly?: boolean;

  /**
   * Enables the command only when two or more records are selected.
   */
  bulkOnly?: boolean;

  tooltip?: string;

  confirm?: {
    title: string;
    message: string;
    confirmLabel?: string;
  };

  onClick?: (context: CommandBarActionContext) => void | Promise<void>;
  href?: string;
};

export type CommandBarGroup = {
  key: string;
  label: string;
  icon?: LucideIcon;
  hidden?: boolean;
  actions: CommandBarAction[];
};

export type CommandBarItem = CommandBarAction | CommandBarGroup;

export function isCommandGroup(item: CommandBarItem): item is CommandBarGroup {
  return "actions" in item;
}

export type CommandBarProps = {
  title?: string;
  subtitle?: string;
  variant?: CommandBarVariant;
  selectedCount?: number;
  selectedIds?: string[];
  isDirty?: boolean;
  isReadOnly?: boolean;
  items: CommandBarItem[];
  className?: string;
};