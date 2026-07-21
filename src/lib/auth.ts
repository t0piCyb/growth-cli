import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, chmodSync } from "fs";
import { TOKEN_DIR, AUTH_TYPE, AUTH_HEADER, APP_CLI } from "./config.js";
import { forgetProfile, resolveProfile, tokenPath } from "./profiles.js";
import { CliError } from "./errors.js";

/** Check if a token is configured */
export function hasToken(profile?: string): boolean {
  return Boolean(process.env.GROWTH_API_KEY) || existsSync(tokenPath(resolveProfile(profile)));
}

/** Read the stored token. Throws if not configured. */
export function getToken(profile?: string): string {
  if (process.env.GROWTH_API_KEY?.trim()) {
    return process.env.GROWTH_API_KEY.trim();
  }
  const name = resolveProfile(profile);
  if (!existsSync(tokenPath(name))) {
    throw new CliError(
      2,
      `No token configured for profile "${name}".`,
      `Run: ${APP_CLI} auth set <token> --profile ${name}`,
    );
  }
  return readFileSync(tokenPath(name), "utf-8").trim();
}

/** Save a token to disk with restricted permissions (chmod 600). */
export function setToken(token: string, profile?: string): void {
  const path = tokenPath(resolveProfile(profile));
  mkdirSync(TOKEN_DIR, { recursive: true });
  writeFileSync(path, token.trim(), { mode: 0o600 });
  // Ensure permissions even if file existed
  chmodSync(path, 0o600);
}

/** Delete the stored token and drop the profile from the saved state. */
export function removeToken(profile?: string): void {
  const name = resolveProfile(profile);
  const path = tokenPath(name);
  if (existsSync(path)) {
    unlinkSync(path);
  }
  forgetProfile(name);
}

/** Mask a token for display: "sk-abc...wxyz" */
export function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/** Build the auth header based on configured auth type. */
export function buildAuthHeaders(): Record<string, string> {
  const token = getToken();

  switch (AUTH_TYPE) {
    case "bearer":
      return { [AUTH_HEADER]: `Bearer ${token}` };
    case "api-key":
      return { [AUTH_HEADER]: token };
    case "basic":
      return { Authorization: `Basic ${Buffer.from(token).toString("base64")}` };
    default:
      return { [AUTH_HEADER]: token };
  }
}
