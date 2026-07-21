import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";
import { globalFlags } from "../lib/config.js";

/**
 * `--json` may arrive on the subcommand OR be inherited from the root command,
 * where the preAction hook parks it in globalFlags.
 */
const wantsJson = (opts: { json?: boolean }) => opts.json ?? globalFlags.json;

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  tags?: string;
  var?: string;
};

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Parses `key=value` pairs, keeping any `=` inside the value. */
const parsePairs = (value: string | undefined) => {
  const pairs: Record<string, string> = {};
  for (const entry of splitList(value)) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const key = entry.slice(0, separator).trim();
    const pairValue = entry.slice(separator + 1).trim();
    if (key && pairValue) pairs[key] = pairValue;
  }
  return Object.keys(pairs).length > 0 ? pairs : undefined;
};

const transactionalRow = (transactional: any) => ({
  slug: transactional.slug ?? transactional.id,
  name: transactional.name,
  subject: transactional.subject,
  status: transactional.status ?? "-",
  updatedAt: transactional.updatedAt,
});

export const transactionalResource = new Command("transactional")
  .alias("tx")
  .description("List and send transactional emails");

transactionalResource
  .command("list")
  .description("List the organization's transactional templates")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/transactional")) as {
        transactionals?: any[];
      };
      output(
        wantsJson(opts)
          ? data
          : (data.transactionals ?? []).map(transactionalRow),
        {
          json: opts.json,
          format: opts.format,
          fields: opts.fields?.split(","),
        },
      );
    } catch (err) {
      handleError(err, opts.json);
    }
  });

transactionalResource
  .command("send")
  .description("Send one transactional email to a contact")
  .argument("<transactional>", "Transactional slug or id")
  .requiredOption("--email <email>", "Recipient email")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--var <key=value>", "Comma-separated template variables")
  .option("--tags <tags>", "Comma-separated tags to merge onto the contact")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    "\nExample:\n  growth-cli transactional send welcome --email a@b.c --var firstName=Jane,plan=pro",
  )
  .action(async (transactional: string, opts: ActionOpts) => {
    try {
      const data = await client.post("/email/transactional/send", {
        transactional,
        email: opts.email,
        ...(opts.firstName && { firstName: opts.firstName }),
        ...(opts.lastName && { lastName: opts.lastName }),
        ...(opts.var && { variables: parsePairs(opts.var) }),
        ...(opts.tags && { tags: splitList(opts.tags) }),
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
