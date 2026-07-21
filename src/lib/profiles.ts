import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  APP_CLI,
  FALLBACK_PROFILE,
  globalFlags,
  STATE_FILE,
  TOKEN_DIR,
} from "./config.js";

/** Cached label for a profile, filled in when a token is verified. */
export type ProfileMeta = {
  organization?: string;
  slug?: string;
  verifiedAt?: number;
};

type State = {
  /** Profile used when no --profile flag and no GROWTH_PROFILE env var. */
  active?: string;
  profiles?: Record<string, ProfileMeta>;
};

const TOKEN_PREFIX = `${APP_CLI}-`;
const TOKEN_SUFFIX = ".txt";

/** Profile names become filenames, so restrict them to safe characters. */
export const sanitizeProfile = (profile: string) =>
  profile.trim().replace(/[^a-zA-Z0-9._-]/g, "_") || FALLBACK_PROFILE;

export const tokenPath = (profile: string) =>
  join(TOKEN_DIR, `${TOKEN_PREFIX}${sanitizeProfile(profile)}${TOKEN_SUFFIX}`);

export const readState = (): State => {
  if (!existsSync(STATE_FILE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as State;
  } catch {
    // A corrupt state file must not break every command; it only holds
    // preferences, and the next write repairs it.
    return {};
  }
};

const writeState = (state: State): void => {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(STATE_FILE, 0o600);
};

/**
 * The profile to use when no `--profile` flag was passed. `GROWTH_PROFILE`
 * wins over the saved active profile so a single shell can override without
 * mutating global state.
 */
export const defaultProfile = (): string => {
  const fromEnv = process.env.GROWTH_PROFILE?.trim();
  if (fromEnv) return fromEnv;
  return readState().active?.trim() || FALLBACK_PROFILE;
};

/** Full resolution order: explicit flag > already-resolved global > default. */
export const resolveProfile = (explicit?: string): string =>
  explicit?.trim() || globalFlags.profile.trim() || defaultProfile();

export const setActiveProfile = (profile: string): void => {
  writeState({ ...readState(), active: sanitizeProfile(profile) });
};

export const setProfileMeta = (profile: string, meta: ProfileMeta): void => {
  const state = readState();
  writeState({
    ...state,
    profiles: {
      ...state.profiles,
      [sanitizeProfile(profile)]: meta,
    },
  });
};

export const forgetProfile = (profile: string): void => {
  const state = readState();
  const name = sanitizeProfile(profile);
  const profiles = { ...state.profiles };
  delete profiles[name];
  writeState({
    ...state,
    // Clear the active pointer when the profile it names is gone.
    active: state.active === name ? undefined : state.active,
    profiles,
  });
};

export type StoredProfile = {
  name: string;
  active: boolean;
  organization?: string;
  slug?: string;
};

/** Every profile that has a token on disk, plus the active marker. */
export const listProfiles = (): StoredProfile[] => {
  if (!existsSync(TOKEN_DIR)) return [];
  const state = readState();
  const active = defaultProfile();

  return readdirSync(TOKEN_DIR)
    .filter(
      (file) => file.startsWith(TOKEN_PREFIX) && file.endsWith(TOKEN_SUFFIX),
    )
    .map((file) =>
      file.slice(TOKEN_PREFIX.length, file.length - TOKEN_SUFFIX.length),
    )
    .filter(Boolean)
    .sort()
    .map((name) => ({
      name,
      active: name === active,
      organization: state.profiles?.[name]?.organization,
      slug: state.profiles?.[name]?.slug,
    }));
};
