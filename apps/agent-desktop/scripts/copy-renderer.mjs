import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const source = path.join(root, "src", "renderer");
const target = path.join(root, "dist", "renderer");

async function copyRenderer() {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  await cp(source, target, {
    recursive: true,
    force: true,
  });

  console.log(`[DijiPeople Agent] Renderer copied from ${source} to ${target}`);
}

copyRenderer().catch((error) => {
  console.error("[DijiPeople Agent] Failed to copy renderer:", error);
  process.exit(1);
});