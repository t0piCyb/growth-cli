import { readFileSync } from "node:fs";
import { Command } from "commander";
import { client } from "../lib/client.js";
import { globalFlags } from "../lib/config.js";
import { CliError, handleError } from "../lib/errors.js";
import { readJsonDocument } from "../lib/jsonFile.js";
import { output } from "../lib/output.js";
import { assertNoDuplicateSignature } from "../lib/signature.js";
import { parseDate, splitList } from "../lib/values.js";

/**
 * `--json` may arrive on the subcommand OR be inherited from the root command,
 * where the preAction hook parks it in globalFlags.
 */
const wantsJson = (opts: { json?: boolean }) => opts.json ?? globalFlags.json;

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  status?: string;
  limit?: string;
  cursor?: string;
  file?: string;
  export?: boolean;
  name?: string;
  subject?: string;
  previewText?: string;
  markdown?: string;
  from?: string;
  replyTo?: string;
  tags?: string;
  at?: string;
  test?: string;
  allowSignature?: boolean;
};

/**
 * Keys the API accepts on create/update. A `get --export` response also
 * carries read-only fields (id, status, stats); dropping them is what makes
 * export → edit → update a clean round-trip.
 */
const AUTHORING_KEYS = [
  "name",
  "subject",
  "previewText",
  "contentBlocks",
  "fromAddress",
  "replyTo",
  "audienceTags",
  "audienceFilters",
  "hideDefaultUnsubscribe",
] as const;

const toAuthoringDoc = (campaign: any) =>
  Object.fromEntries(
    AUTHORING_KEYS.flatMap((key) =>
      campaign?.[key] === null || campaign?.[key] === undefined
        ? []
        : [[key, campaign[key]]],
    ),
  );

const campaignRow = (campaign: any) => ({
  id: campaign?.id,
  name: campaign?.name,
  subject: campaign?.subject,
  status: campaign?.status,
  sent: campaign?.stats?.sent ?? 0,
  opened: campaign?.stats?.opened ?? 0,
  clicked: campaign?.stats?.clicked ?? 0,
  scheduledAt: campaign?.scheduledAt,
  sentAt: campaign?.sentAt,
});

/** One markdown block, the same shape the editor writes for body copy. */
const readMarkdownBlocks = (path: string) => {
  let raw: string;
  try {
    raw = readFileSync(path === "-" ? 0 : path, "utf8");
  } catch (err) {
    throw new CliError(400, `Cannot read ${path}: ${(err as Error).message}`);
  }
  if (!raw.trim()) throw new CliError(400, `${path} is empty`);
  return [{ type: "text", props: { markdown: raw } }];
};

/** Body from `--file` (full JSON document) or from the individual flags. */
const buildBody = (opts: ActionOpts, requireContent: boolean) => {
  if (opts.file) {
    return assertNoDuplicateSignature(
      readJsonDocument(opts.file),
      opts.allowSignature,
    );
  }

  const body: Record<string, unknown> = {};
  if (opts.name) body.name = opts.name;
  if (opts.subject) body.subject = opts.subject;
  if (opts.previewText) body.previewText = opts.previewText;
  if (opts.from) body.fromAddress = opts.from;
  if (opts.replyTo) body.replyTo = opts.replyTo;
  if (opts.tags !== undefined) body.audienceTags = splitList(opts.tags);
  if (opts.markdown) body.contentBlocks = readMarkdownBlocks(opts.markdown);

  if (requireContent && !body.contentBlocks) {
    throw new CliError(400, "Pass --file <doc.json> or --markdown <path>");
  }
  if (Object.keys(body).length === 0) {
    throw new CliError(400, "Nothing to update; pass at least one field");
  }
  return body;
};

const printCampaign = (data: any, opts: ActionOpts) => {
  output(wantsJson(opts) ? data : campaignRow(data?.campaign ?? data), {
    json: opts.json,
    format: opts.format,
  });
};

export const campaignsResource = new Command("campaigns").description(
  "Create, schedule and send email campaigns",
);

campaignsResource
  .command("list")
  .description("List campaigns, newest first")
  .option("--status <status>", "draft|scheduled|sending|sent|paused|archived")
  .option("--limit <n>", "Max campaigns to return (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/campaigns", {
        ...(opts.status && { status: opts.status }),
        ...(opts.limit && { limit: opts.limit }),
      })) as { campaigns?: any[] };
      output(wantsJson(opts) ? data : (data.campaigns ?? []).map(campaignRow), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("get")
  .description("Show one campaign with its content blocks")
  .argument("<campaign-id>", "Campaign ID")
  .option("--export", "Print the authoring JSON (feeds --file)")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(
        `/email/campaigns/${encodeURIComponent(campaignId)}`,
      )) as { campaign?: any };
      if (opts.export) {
        console.log(JSON.stringify(toAuthoringDoc(data.campaign), null, 2));
        return;
      }
      output(wantsJson(opts) ? data : (data.campaign ?? data), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("create")
  .description("Create a draft campaign")
  .option("--file <path>", 'Campaign JSON document ("-" reads stdin)')
  .option("--name <name>", "Campaign name")
  .option("--subject <subject>", "Email subject")
  .option("--preview-text <text>", "Inbox preview text")
  .option("--markdown <path>", 'Markdown body file ("-" reads stdin)')
  .option("--from <email>", "From address")
  .option("--reply-to <email>", "Reply-to address")
  .option("--tags <tags>", "Comma-separated audience tags")
  .option(
    "--allow-signature",
    "Keep a sign-off in the markdown next to a snippet block",
  )
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    "\nExamples:\n  growth-cli campaigns create --name Launch --subject 'We shipped' --markdown body.md --tags customers\n  growth-cli campaigns create --file campaign.json",
  )
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/email/campaigns", buildBody(opts, true));
      printCampaign(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("update")
  .description("Update a draft or scheduled campaign")
  .argument("<campaign-id>", "Campaign ID")
  .option("--file <path>", 'Campaign JSON document ("-" reads stdin)')
  .option("--name <name>", "Campaign name")
  .option("--subject <subject>", "Email subject")
  .option("--preview-text <text>", "Inbox preview text")
  .option("--markdown <path>", 'Markdown body file ("-" reads stdin)')
  .option("--from <email>", "From address")
  .option("--reply-to <email>", "Reply-to address")
  .option("--tags <tags>", "Comma-separated audience tags (replaces the list)")
  .option(
    "--allow-signature",
    "Keep a sign-off in the markdown next to a snippet block",
  )
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = await client.patch(
        `/email/campaigns/${encodeURIComponent(campaignId)}`,
        buildBody(opts, false),
      );
      printCampaign(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("schedule")
  .description("Schedule a campaign for a future date")
  .argument("<campaign-id>", "Campaign ID")
  .requiredOption("--at <date>", "ISO date or ms timestamp, in the future")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = await client.post(
        `/email/campaigns/${encodeURIComponent(campaignId)}/schedule`,
        { scheduledAt: parseDate(opts.at!, "--at") },
      );
      printCampaign(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("unschedule")
  .description("Move a scheduled campaign back to draft")
  .argument("<campaign-id>", "Campaign ID")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = await client.post(
        `/email/campaigns/${encodeURIComponent(campaignId)}/schedule`,
        { scheduledAt: null },
      );
      printCampaign(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("send")
  .description("Send a campaign now, or mail one test copy")
  .argument("<campaign-id>", "Campaign ID")
  .option("--test <email>", "Send a single test to this address instead")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    "\nWithout --test this starts the real send to every matching subscriber.",
  )
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = await client.post(
        `/email/campaigns/${encodeURIComponent(campaignId)}/send`,
        opts.test ? { testEmail: opts.test } : {},
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("archive")
  .description("Archive a campaign")
  .argument("<campaign-id>", "Campaign ID")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = await client.delete(
        `/email/campaigns/${encodeURIComponent(campaignId)}`,
      );
      printCampaign(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("restore")
  .description("Take a campaign back out of the archive")
  .argument("<campaign-id>", "Campaign ID")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = await client.delete(
        `/email/campaigns/${encodeURIComponent(campaignId)}?restore=true`,
      );
      printCampaign(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("analytics")
  .description("Show delivery, engagement and top links for a campaign")
  .argument("<campaign-id>", "Campaign ID")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(
        `/email/campaigns/${encodeURIComponent(campaignId)}/analytics`,
      )) as { analytics?: any };
      output(wantsJson(opts) ? data : (data.analytics ?? data), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

campaignsResource
  .command("recipients")
  .description("List who a campaign was sent to and what they did")
  .argument("<campaign-id>", "Campaign ID")
  .option("--cursor <cursor>", "Cursor from the previous page")
  .option("--limit <n>", "Rows per page (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (campaignId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(
        `/email/campaigns/${encodeURIComponent(campaignId)}/recipients`,
        {
          ...(opts.cursor && { cursor: opts.cursor }),
          ...(opts.limit && { limit: opts.limit }),
        },
      )) as { recipients?: any[]; cursor?: string | null };
      output(wantsJson(opts) ? data : (data.recipients ?? []), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
      if (!wantsJson(opts) && data.cursor) {
        console.error(`next page: --cursor ${data.cursor}`);
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });
