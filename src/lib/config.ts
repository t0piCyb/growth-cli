import { homedir } from "os";
import { join } from "path";

/** Application name (replaced during api2cli create) */
export const APP_NAME = "growth";

/** CLI binary name (replaced during api2cli create) */
export const APP_CLI = "growth-cli";

/** Every path this CLI requests is relative to the versioned API root. */
const API_PREFIX = "/api/v1";

/**
 * API base URL (replaced during api2cli create).
 *
 * The shebang is `#!/usr/bin/env bun`, and Bun auto-loads the `.env` of the
 * current directory — so running the CLI from inside a product repository
 * silently inherits that app's `GROWTH_API_URL`. The app points it at the site
 * root (it appends `/api/v1` itself), which stripped the prefix here and turned
 * every call into a 500 from the site's catch-all route. Hence two guards: a
 * CLI-specific variable that no app defines, and a base URL missing the prefix
 * gets it back.
 */
export const BASE_URL = ((): string => {
  const configured = (
    process.env.GROWTH_CLI_API_URL ??
    process.env.GROWTH_API_URL ??
    `https://affi.topilo.dev${API_PREFIX}`
  ).replace(/\/$/, "");

  return configured.endsWith(API_PREFIX)
    ? configured
    : `${configured}${API_PREFIX}`;
})();

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
