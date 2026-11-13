import { readFileSync } from "node:fs";
import { join } from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { E2E_DIR, STATE_FILE } from "../playwright.config";
import { APPEARANCE_KEY } from "./desktop";

/** Puts back the appearance the dev account had before the run. */
export default async function globalTeardown(config: FullConfig) {
  const saved = JSON.parse(readFileSync(join(E2E_DIR, "appearance.json"), "utf8")) as { value: string | null };
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5173";
  const api = await request.newContext({ baseURL, storageState: STATE_FILE });
  if (saved.value === null) await api.delete(`/api/prefs/${encodeURIComponent(APPEARANCE_KEY)}`);
  else await api.put("/api/prefs", { data: { entries: [{ key: APPEARANCE_KEY, value: saved.value }] } });
  await api.dispose();
}
