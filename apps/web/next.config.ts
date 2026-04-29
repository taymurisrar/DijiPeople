import type { NextConfig } from "next";
import { validateDeploymentEnv } from "@repo/config";

validateDeploymentEnv(process.env, { app: "web" });

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
