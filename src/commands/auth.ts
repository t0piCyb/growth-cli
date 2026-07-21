import { Command } from "commander";
import { getToken, setToken, removeToken, hasToken, maskToken } from "../lib/auth.js";
import { client } from "../lib/client.js";
import { log } from "../lib/logger.js";
import { handleError } from "../lib/errors.js";
import { globalFlags } from "../lib/config.js";
import {
  defaultProfile,
  listProfiles,
  readState,
  resolveProfile,
  sanitizeProfile,
  setActiveProfile,
  setProfileMeta,
} from "../lib/profiles.js";
import { output } from "../lib/output.js";

type Organization = { name?: string; slug?: string | null };

/**
 * Points every later call in this process at `profile`. The HTTP client reads
 * the profile from `globalFlags`, so auth subcommands that target a specific
 * profile have to move it before they call the API.
 */
const useProfileForThisRun = (profile?: string): string => {
  const name = resolveProfile(profile);
  globalFlags.profile = name;
  return name;
};

/** Calls /me and caches the organization label on the profile. */
const verifyProfile = async (profile: string): Promise<Organization | null> => {
  const data = (await client.get("/me")) as { organization?: Organization };
  const organization = data.organization;
  setProfileMeta(profile, {
    organization: organization?.name,
    slug: organization?.slug ?? undefined,
    verifiedAt: Date.now(),
  });
  return organization ?? null;
};

const describeOrg = (organization: Organization | null) =>
  `${organization?.name ?? "this organization"}${organization?.slug ? ` (${organization.slug})` : ""}`;

export const authCommand = new Command("auth").description("Manage API authentication");

authCommand
  .command("set")
  .description("Save an API token for a profile (one profile per organization)")
  .argument("<token>", "Your API token")
  .option("--profile <name>", "Named organization profile")
  .option("--use", "Also make this profile the active one")
  .addHelpText(
    "after",
    "\nExamples:\n  growth-cli auth set nsk_abc123\n  growth-cli auth set nsk_abc123 --profile amencolors\n  growth-cli auth set nsk_abc123 --profile amencolors --use",
  )
  .action(async (token: string, opts: { profile?: string; use?: boolean }) => {
    const profile = useProfileForThisRun(opts.profile);
    setToken(token, profile);
    log.success(`Token saved securely for profile "${sanitizeProfile(profile)}"`);

    // The first profile becomes active on its own, so a single-org setup
    // never has to think about profiles at all.
    const isFirst = !readState().active && listProfiles().length === 1;
    if (opts.use || isFirst) {
      setActiveProfile(profile);
      log.success(`Active profile is now "${sanitizeProfile(profile)}"`);
    }

    // Best effort: a wrong base URL or no network must not lose the token.
    try {
      const organization = await verifyProfile(profile);
      log.success(`Token is valid for ${describeOrg(organization)}`);
    } catch (err) {
      log.warn(
        `Token saved but could not be verified: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

authCommand
  .command("use")
  .description("Switch the active profile used by all commands")
  .argument("<profile>", "Profile name")
  .addHelpText("after", "\nExample:\n  growth-cli auth use amencolors")
  .action((profile: string) => {
    const name = sanitizeProfile(profile);
    if (!hasToken(name)) {
      const known = listProfiles().map((entry) => entry.name);
      handleError(
        new Error(
          `No token stored for profile "${name}".${known.length > 0 ? ` Known profiles: ${known.join(", ")}` : ""} Run: growth-cli auth set <token> --profile ${name}`,
        ),
        globalFlags.json,
      );
    }
    setActiveProfile(name);
    log.success(`Active profile is now "${name}"`);
  });

authCommand
  .command("list")
  .alias("ls")
  .description("List stored profiles and show which one is active")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText("after", "\nExample:\n  growth-cli auth list")
  .action((opts: { json?: boolean; format?: string }) => {
    const profiles = listProfiles();
    if (profiles.length === 0 && !opts.json) {
      log.warn("No profiles yet. Run: growth-cli auth set <token> --profile <name>");
      return;
    }
    output(
      profiles.map((entry) => ({
        active: entry.active ? "*" : "",
        profile: entry.name,
        organization: entry.organization ?? "-",
        slug: entry.slug ?? "-",
      })),
      { json: opts.json, format: opts.format },
    );
    if (!opts.json && process.env.GROWTH_API_KEY?.trim()) {
      log.warn(
        "GROWTH_API_KEY is set in this shell and overrides every profile above.",
      );
    }
  });

authCommand
  .command("show")
  .description("Display current token (masked by default)")
  .option("--raw", "Show the full unmasked token")
  .option("--profile <name>", "Named organization profile")
  .addHelpText("after", "\nExamples:\n  growth-cli auth show\n  growth-cli auth show --raw --profile amencolors")
  .action((opts: { raw?: boolean; profile?: string }) => {
    const profile = resolveProfile(opts.profile);
    if (!hasToken(profile)) {
      log.warn(`No token configured. Run: growth-cli auth set <token> --profile ${profile}`);
      return;
    }
    const token = getToken(profile);
    console.log(opts.raw ? token : `Token: ${maskToken(token)} (profile "${profile}")`);
  });

authCommand
  .command("remove")
  .description("Delete the saved token for a profile")
  .option("--profile <name>", "Named organization profile")
  .addHelpText("after", "\nExample:\n  growth-cli auth remove --profile amencolors")
  .action((opts: { profile?: string }) => {
    const profile = resolveProfile(opts.profile);
    removeToken(profile);
    log.success(`Token removed for profile "${sanitizeProfile(profile)}"`);
    const remaining = listProfiles();
    if (remaining.length > 0) {
      log.info(`Active profile is now "${defaultProfile()}"`);
    }
  });

authCommand
  .command("test")
  .description("Verify a profile's token works by making a test API call")
  .option("--profile <name>", "Named organization profile")
  .addHelpText("after", "\nExamples:\n  growth-cli auth test\n  growth-cli auth test --profile amencolors")
  .action(async (opts: { profile?: string }) => {
    const profile = useProfileForThisRun(opts.profile);
    try {
      const organization = await verifyProfile(profile);
      if (globalFlags.json) {
        output({ profile, organization }, { json: true });
        return;
      }
      log.success(`Profile "${profile}" is valid for ${describeOrg(organization)}`);
    } catch (err) {
      handleError(err, globalFlags.json);
    }
  });
