import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { readJsonDocument } from "../lib/jsonFile.js";
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
  file?: string;
  export?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  tags?: string;
  var?: string;
};

/**
 * Keys the API accepts on create/update. A `get --export` response carries
 * read-only extras (id, stats, timestamps); dropping them here is what makes
 * export → edit → update a clean round-trip.
 */
const AUTHORING_KEYS = [
  "slug",
  "name",
  "description",
  "templateName",
  "subject",
  "previewText",
  "contentBlocks",
  "subjectOverride",
  "status",
] as const;

const toAuthoringDoc = (transactional: any) =>
  Object.fromEntries(
    AUTHORING_KEYS.flatMap((key) =>
      transactional?.[key] === null || transactional?.[key] === undefined
        ? []
        : [[key, transactional[key]]],
    ),
  );

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

/** `list` has no subject (the content lives on the bound template); `get`,
 * `create` and `update` do. Columns absent from the payload print as "-". */
const transactionalRow = (transactional: any) => ({
  slug: transactional?.slug ?? transactional?.id,
  name: transactional?.name,
  subject: transactional?.subject ?? transactional?.subjectOverride,
  status: transactional?.status,
  updatedAt: transactional?.updatedAt,
});

export const transactionalResource = new Command("transactional")
  .alias("tx")
  .description("Create, edit and send transactional emails");

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
  .command("get")
  .description("Show one transactional email with its content")
  .argument("<transactional>", "Transactional slug or id")
  .option("--export", "Print the authoring JSON (feeds --file)")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (transactional: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(
        `/email/transactional/${encodeURIComponent(transactional)}`,
      )) as { transactional?: any };

      if (opts.export) {
        console.log(JSON.stringify(toAuthoringDoc(data.transactional), null, 2));
        return;
      }
      output(wantsJson(opts) ? data : (data.transactional ?? data), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

transactionalResource
  .command("create")
  .description("Create a transactional email from a JSON document")
  .requiredOption("--file <path>", 'Transactional JSON file ("-" reads stdin)')
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    '\nThe document holds both the definition and its content:\n  { "slug": "freebie-kit", "name": "Kit delivery", "subject": "Your kit",\n    "contentBlocks": [ { "type": "text", "props": { "markdown": "Hi" } } ] }',
  )
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.post(
        "/email/transactional",
        readJsonDocument(opts.file!),
      )) as { transactional?: any };
      output(wantsJson(opts) ? data : transactionalRow(data.transactional), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

transactionalResource
  .command("update")
  .description("Update a transactional email from a JSON document")
  .argument("<transactional>", "Transactional slug or id")
  .requiredOption("--file <path>", 'Transactional JSON file ("-" reads stdin)')
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    "\nOnly the keys present in the file are written; everything else is left\nalone. Sending subject/previewText/contentBlocks rewrites the bound\ntemplate in place — already-sent emails keep their rendered copy.",
  )
  .action(async (transactional: string, opts: ActionOpts) => {
    try {
      const data = (await client.patch(
        `/email/transactional/${encodeURIComponent(transactional)}`,
        readJsonDocument(opts.file!),
      )) as { transactional?: any };
      output(wantsJson(opts) ? data : transactionalRow(data.transactional), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const setStatus = async (
  transactional: string,
  status: "active" | "archived",
  opts: ActionOpts,
) => {
  try {
    const data = (await client.patch(
      `/email/transactional/${encodeURIComponent(transactional)}`,
      { status },
    )) as { transactional?: any };
    output(wantsJson(opts) ? data : transactionalRow(data.transactional), {
      json: opts.json,
      format: opts.format,
    });
  } catch (err) {
    handleError(err, opts.json);
  }
};

transactionalResource
  .command("archive")
  .description("Archive a transactional email (sends start failing with 409)")
  .argument("<transactional>", "Transactional slug or id")
  .option("--json", "Output as JSON")
  .action((transactional: string, opts: ActionOpts) =>
    setStatus(transactional, "archived", opts),
  );

transactionalResource
  .command("restore")
  .description("Set an archived transactional email back to active")
  .argument("<transactional>", "Transactional slug or id")
  .option("--json", "Output as JSON")
  .action((transactional: string, opts: ActionOpts) =>
    setStatus(transactional, "active", opts),
  );

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
