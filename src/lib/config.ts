import { homedir } from "os";
import { join } from "path";

/** Application name (replaced during api2cli create) */
export const APP_NAME = "growth";

/** CLI binary name (replaced during api2cli create) */
export const APP_CLI = "growth-cli";

/** API base URL (replaced during api2cli create) */
export const BASE_URL = (
  process.env.GROWTH_API_URL ?? "https://affi.topilo.dev/api/v1"
).replace(/\/$/, "");

export type AuthType = "bearer" | "api-key" | "basic" | "custom";

/**
 * Auth type for this API. Annotated with the full union (not narrowed to the
 * literal) so `buildAuthHeaders` can keep handling every scheme.
 */
export const AUTH_TYPE: AuthType = "api-key";

/** Auth header name (e.g. Authorization, X-Api-Key) */
export const AUTH_HEADER = "x-api-key";

/** Path to the token file for this CLI */
export const TOKEN_DIR = join(homedir(), ".config", "tokens");

/**
 * Profile state (which profile is active, plus cached org labels). Kept out of
 * TOKEN_DIR so its filename can never collide with a `growth-cli-<profile>.txt`
 * token file.
 */
export const STATE_FILE = join(homedir(), ".config", APP_CLI, "state.json");

/** Fallback profile when nothing else selects one. */
export const FALLBACK_PROFILE = "default";

/**
 * Global state for output flags. `profile` starts empty and is resolved once by
 * the root command's preAction hook (flag > env > saved active > fallback).
 */
export const globalFlags = {
  json: false,
  format: "text" as "text" | "json" | "csv" | "yaml",
  verbose: false,
  noColor: false,
  noHeader: false,
  profile: "",
};
