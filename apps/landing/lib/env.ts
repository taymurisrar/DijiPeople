import { getApiBaseUrl as getSharedApiBaseUrl } from "@repo/config";

export const landingEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "DijiPeople",
  appOrigin:
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_LANDING_APP_URL ||
    process.env.NEXT_PUBLIC_LANDING_URL ||
    "http://localhost:3000",
  apiBaseUrl: getSharedApiBaseUrl(process.env),
};
