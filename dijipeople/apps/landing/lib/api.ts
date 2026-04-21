import { getApiBaseUrl as getSharedApiBaseUrl } from "@repo/config";

export function getApiBaseUrl() {
  return getSharedApiBaseUrl(process.env);
}
