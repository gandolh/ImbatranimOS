import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { E2E_DIR, STATE_FILE } from "../playwright.config";
import { APPEARANCE_KEY } from "./desktop";

/**
 * Signs the dev account in once and keeps the session for every spec, and
 * keeps the appearance as it was so the teardown can put it back.
 */
export default async function globalSetup(config: FullConfig) {
  const password = process.env.OS_E2E_PASSWORD;
  if (!password) throw new Error("Set OS_E2E_PASSWORD to the dev container's password (infrastructure/README.md).");
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5173";
  mkdirSync(E2E_DIR, { recursive: true });

  const api = await request.newContext({ baseURL });
  const signIn = await api.post("/api/identity/local/sign-in", { data: { password } });
  if (!signIn.ok()) throw new Error(`The dev sign-in failed: ${signIn.status()}`);
  await api.storageState({ path: STATE_FILE });

  const prefs = (await (await api.get("/api/prefs")).json()) as Record<string, string>;
  writeFileSync(join(E2E_DIR, "appearance.json"), JSON.stringify({ value: prefs[APPEARANCE_KEY] ?? null }));
  await api.dispose();
}
