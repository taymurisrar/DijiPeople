export declare const DEFAULT_LOCAL_PORTS: Readonly<{
  landing: 3000;
  web: 3001;
  admin: 3002;
  api: 4000;
}>;

export declare const PRODUCTION_APP_URLS: Readonly<{
  landing: "https://dijipeople.com";
  web: "https://app.dijipeople.com";
  admin: "https://admin.dijipeople.com";
  api: "https://api.dijipeople.com";
}>;

export declare function getAppPort(
  app: "landing" | "web" | "admin" | "api",
  env?: NodeJS.ProcessEnv,
): number;

export declare function getAppOrigin(
  app: "landing" | "web" | "admin" | "api",
  env?: NodeJS.ProcessEnv,
): string;

export declare function getApiBaseUrl(env?: NodeJS.ProcessEnv): string;

export declare function getAllowedCorsOrigins(env?: NodeJS.ProcessEnv): string[];

export declare function getLocalArchitecture(env?: NodeJS.ProcessEnv): {
  landing: string;
  web: string;
  admin: string;
  api: string;
};
