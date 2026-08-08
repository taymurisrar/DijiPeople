/*
 * The selector itself moved to components/runtime/module-view-selector when the
 * two implementations were merged. These stay declared here because they are
 * the narrower shape callers build server-side: `description` is a plain string
 * rather than the nullable one the component tolerates, and widening it would
 * break consumers that expect a value.
 */
export type { ModuleViewType } from "@/app/components/runtime/module-view-selector";

export type ModuleViewOption = {
  id: string;
  name: string;
  type: "system" | "custom";
  description?: string;
  isDefault?: boolean;
  badgeCount?: number;
  icon?: string;
};

export type ModuleViewSelectorConfig = {
  enabled: boolean;
  selectedViewId: string;
  views: ModuleViewOption[];
  configureHref?: string;
  paramName?: string;
  title?: string;
};
