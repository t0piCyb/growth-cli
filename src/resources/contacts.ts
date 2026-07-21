import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";
import { globalFlags } from "../lib/config.js";

/**
 * `--json` may arrive on the subcommand OR be inherited from the root command,
 * where the preAction hook parks it in globalFlags. Branching on `opts.json`
 * alone silently takes the text path for `growth-cli --json <cmd>`.
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
  field?: string;
  status?: string;
  search?: string;
  tag?: string;
  limit?: string;
  cursor?: string;
  removeTags?: string;
};

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseCustomFields = (value: string | undefined) => {
  const fields: Record<string, string> = {};
  for (const entry of splitList(value)) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const key = entry.slice(0, separator).trim();
    const fieldValue = entry.slice(separator + 1).trim();
    if (key && fieldValue) fields[key] = fieldValue;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
};

const formatContact = (contact: any) => ({
  email: contact.email,
  name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "-",
  status: contact.status,
  source: contact.source,
  tags: (contact.tags ?? []).join(","),
  updatedAt: contact.updatedAt,
});

const contactFromResponse = (data: unknown) =>
  (data as { contact?: unknown }).contact ?? data;

export const contactsResource = new Command("contacts").description(
  "Manage email subscribers",
);

contactsResource
  .command("list")
  .description("List subscribers in the active organization")
  .option("--status <status>", "all|subscribed|unsubscribed|bounced|complained")
  .option("--tag <tag>", "Filter by tag")
  .option("--search <query>", "Search recent contacts by email/name")
  .option("--limit <n>", "Page size, max 100", "50")
  .option("--cursor <cursor>", "Pagination cursor from a previous --json response")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/contacts", {
        ...(opts.status && { status: opts.status }),
        ...(opts.tag && { tag: opts.tag }),
        ...(opts.search && { search: opts.search }),
        ...(opts.limit && { limit: opts.limit }),
        ...(opts.cursor && { cursor: opts.cursor }),
      })) as { contacts?: any[] };
      const fields = opts.fields?.split(",");
      output(opts.json ? data : (data.contacts ?? []).map(formatContact), {
        json: opts.json,
        format: opts.format,
        fields,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

contactsResource
  .command("get")
  .description("Get one subscriber by email")
  .argument("<email>", "Subscriber email")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (email: string, opts: ActionOpts) => {
    try {
      const data = await client.get(`/email/contacts/${encodeURIComponent(email)}`);
      output(opts.json ? data : contactFromResponse(data), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

contactsResource
  .command("identify")
  .description("Create or update a subscriber, adding tags and merging fields")
  .requiredOption("--email <email>", "Subscriber email")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--tags <tags>", "Comma-separated tags to ADD (never removes)")
  .option("--remove-tags <tags>", "Comma-separated tags to remove")
  .option("--field <key=value>", "Comma-separated custom fields to merge")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    "\nUnlike `create`, this never drops tags or custom fields written by\nanother integration. Prefer it for app-side events (signup, purchase).\n\nExample:\n  growth-cli contacts identify --email a@b.c --tags signup --field utm_source=google",
  )
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.post("/email/contacts/identify", {
        email: opts.email,
        ...(opts.firstName && { firstName: opts.firstName }),
        ...(opts.lastName && { lastName: opts.lastName }),
        ...(opts.tags && { tags: splitList(opts.tags) }),
        ...(opts.removeTags && { removeTags: splitList(opts.removeTags) }),
        ...(opts.field && { customFields: parseCustomFields(opts.field) }),
      })) as {
        contact?: unknown;
        created?: boolean;
        addedTags?: string[];
        skippedTags?: string[];
        skippedCustomFields?: string[];
      };

      if (wantsJson(opts)) {
        output(data, { json: true });
        return;
      }
      output(contactFromResponse(data), { format: opts.format });
      // Silent caps would read as "everything was written".
      if (data.skippedTags?.length) {
        console.warn(
          `warning: tag limit reached, not added: ${data.skippedTags.join(", ")}`,
        );
      }
      if (data.skippedCustomFields?.length) {
        console.warn(
          `warning: custom field limit reached, not written: ${data.skippedCustomFields.join(", ")}`,
        );
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });

contactsResource
  .command("create")
  .description("Create or update a subscriber (REPLACES tags and fields)")
  .requiredOption("--email <email>", "Subscriber email")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--field <key=value>", "Comma-separated custom fields")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/email/contacts", {
        email: opts.email,
        ...(opts.firstName && { firstName: opts.firstName }),
        ...(opts.lastName && { lastName: opts.lastName }),
        ...(opts.tags && { tags: splitList(opts.tags) }),
        ...(opts.field && { customFields: parseCustomFields(opts.field) }),
      });
      output(opts.json ? data : contactFromResponse(data), { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

contactsResource
  .command("update")
  .description("Update subscriber email, name, or custom fields")
  .argument("<email>", "Current subscriber email")
  .option("--email <email>", "New email")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--field <key=value>", "Comma-separated custom fields; replaces current fields")
  .option("--json", "Output as JSON")
  .action(async (email: string, opts: ActionOpts) => {
    try {
      const data = await client.patch(`/email/contacts/${encodeURIComponent(email)}`, {
        ...(opts.email && { email: opts.email }),
        ...(opts.firstName && { firstName: opts.firstName }),
        ...(opts.lastName && { lastName: opts.lastName }),
        ...(opts.field && { customFields: parseCustomFields(opts.field) }),
      });
      output(opts.json ? data : contactFromResponse(data), { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const unsubscribe = async (email: string, opts: ActionOpts) => {
  const data = await client.delete(`/email/contacts/${encodeURIComponent(email)}`);
  output(opts.json ? data : contactFromResponse(data), { json: opts.json });
};

contactsResource
  .command("unsubscribe")
  .description("Unsubscribe a subscriber by email")
  .argument("<email>", "Subscriber email")
  .option("--json", "Output as JSON")
  .action(async (email: string, opts: ActionOpts) => {
    try {
      await unsubscribe(email, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

contactsResource
  .command("delete")
  .description("Alias for unsubscribe; preserves event history")
  .argument("<email>", "Subscriber email")
  .option("--json", "Output as JSON")
  .action(async (email: string, opts: ActionOpts) => {
    try {
      await unsubscribe(email, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });
