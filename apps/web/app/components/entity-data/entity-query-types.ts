export type EntityFilterOperator =
  | "eq"
  | "ne"
  | "contains"
  | "startswith"
  | "endswith"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "isnull"
  | "isnotnull";

export type EntityFilter = {
  field: string;
  operator: EntityFilterOperator;
  value?: string | number | boolean | Date | Array<string | number | boolean>;
};

export type EntityOrderBy = {
  field: string;
  direction: "asc" | "desc";
};

export type EntityExpand = {
  relation: string;
  select?: string[];
};

export type BuildEntityDataUrlInput = {
  entityLogicalName: string;
  select?: string[];
  filter?: EntityFilter[];
  orderBy?: EntityOrderBy[];
  expand?: EntityExpand[];
  search?: string;
  page?: number;
  pageSize?: number;
  count?: boolean;
};

export type EntityDataResponse<T> = {
  items: T[];
  meta: {
    entityLogicalName: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    selectedFields: string[];
    expanded: string[];
  };
};
