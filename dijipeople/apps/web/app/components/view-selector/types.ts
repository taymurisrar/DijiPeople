export type ModuleViewType = "system" | "custom";

export type ModuleViewOption = {
  id: string;
  name: string;
  type: ModuleViewType;
  description?: string;
  isDefault?: boolean;
};

export type ModuleViewSelectorConfig = {
  enabled: boolean;
  selectedViewId: string;
  views: ModuleViewOption[];
  configureHref?: string;
  paramName?: string;
  title?: string;
};