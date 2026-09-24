import { Command } from "commander";
import { client } from "../lib/client.js";
import { globalFlags } from "../lib/config.js";
import { CliError, handleError } from "../lib/errors.js";
import { readJsonDocument } from "../lib/jsonFile.js";
import { output } from "../lib/output.js";
import { assertNoDuplicateSignature } from "../lib/signature.js";

/**
 * Quick send setup. Partners (and teammates) send a prospect one prepared
 * email from the app, with the partner's promo code and link filled in, and
 * can start them on a workflow. This resource manages what they get to send:
 * the `partner_outreach` templates and the workflows opened to partners.
 * Sending itself happens in the app, as the signed-in person.
 */

const wantsJson = (opts: { json?: boolean }) => opts.json ?? globalFlags.json;

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  file?: string;
  export?: boolean;
  limit?: string;
  allowSignature?: boolean;
};

/** Keys the API accepts; `get --export` drops the read-only rest. */
const AUTHORING_KEYS = [
  "name",
  "description",
  "subject",
  "previewText",
  "contentBlocks",
] as const;

const toAuthoringDoc = (template: any) =>
  Object.fromEntries(
    AUTHORING_KEYS.flatMap((key) =>
      template?.[key] === null || template?.[key] === undefined
        ? []
        : [[key, template[key]]],
    ),
  );

const templateRow = (template: any) => ({
  id: template?.id,
  name: template?.name,
  subject: template?.subject,
  updatedAt: template?.updatedAt,
});

const workflowRow = (workflow: any) => ({
  id: workflow?.id,
  name: workflow?.name,
  status: workflow?.status,
  quickSend: workflow?.quickSend ? "on" : "off",
});

const VARIABLES_HELP = `
Variables resolved for the sending partner:
  @{promoCode}  @{referralCode}  @{referralLink}  @{partnerName}
  @{partnerFirstName}  @{partnerEmail}  @{organizationName}
  @{firstName} (prospect, when typed)  @{message} (optional note)
Fallbacks work as everywhere: @{firstName|there}.`;

type Setup = { templates?: any[]; workflows?: any[] };

const loadSetup = async () => (await client.get("/email/outreach")) as Setup;

export const outreachResource = new Command("outreach")
  .alias("quick-send")
  .description(
    "Quick send: the emails and workflows partners send prospects from the app",
  );

outreachResource
  .command("show")
  .description("Show the outreach templates and which workflows partners can start")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await loadSetup();
      if (wantsJson(opts)) {
        output(data, { json: true });
        return;
      }
      console.log("Templates");
      output((data.templates ?? []).map(templateRow), { format: opts.format });
      console.log("\nWorkflows");
      output((data.workflows ?? []).map(workflowRow), { format: opts.format });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const templates = outreachResource
  .command("templates")
  .description("Manage partner outreach templates");

templates
  .command("list")
  .description("List partner outreach templates")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await loadSetup();
      output(
        wantsJson(opts)
          ? { templates: data.templates ?? [] }
          : (data.templates ?? []).map(templateRow),
        { json: opts.json, format: opts.format, fields: opts.fields?.split(",") },
      );
    } catch (err) {
      handleError(err, opts.json);
    }
  });

templates
  .command("get")
  .description("Show one outreach template with its content")
  .argument("<id>", "Template id")
  .option("--export", "Print the authoring JSON (feeds --file)")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (id: string, opts: ActionOpts) => {
    try {
      const data = await loadSetup();
      const template = (data.templates ?? []).find((row) => row.id === id);
      if (!template) throw new CliError(404, "Template not found");
      if (opts.export) {
        console.log(JSON.stringify(toAuthoringDoc(template), null, 2));
        return;
      }
      output(template, { json: opts.json, format: opts.format });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

templates
  .command("create")
  .description("Create a partner outreach template from a JSON document")
  .requiredOption("--file <path>", 'Template JSON file ("-" reads stdin)')
  .option(
    "--allow-signature",
    "Keep a sign-off in the markdown next to a snippet block",
  )
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    `\nDocument:\n  { "name": "Free kit", "subject": "Your free kit",\n    "contentBlocks": [\n      { "type": "text", "props": { "markdown": "Your code: **@{promoCode}**" } },\n      { "type": "button", "props": { "label": "Get the kit", "url": "@{referralLink}" } } ] }\n${VARIABLES_HELP}`,
  )
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.post(
        "/email/outreach/templates",
        assertNoDuplicateSignature(
          readJsonDocument(opts.file!),
          opts.allowSignature,
        ),
      )) as { template?: any };
      output(wantsJson(opts) ? data : templateRow(data.template), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

templates
  .command("update")
  .description("Update a partner outreach template from a JSON document")
  .argument("<id>", "Template id")
  .requiredOption("--file <path>", 'Template JSON file ("-" reads stdin)')
  .option(
    "--allow-signature",
    "Keep a sign-off in the markdown next to a snippet block",
  )
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    `\nOnly the keys present in the file are written. Round-trip:\n  growth-cli outreach templates get <id> --export > kit.json\n  growth-cli outreach templates update <id> --file kit.json\n${VARIABLES_HELP}`,
  )
  .action(async (id: string, opts: ActionOpts) => {
    try {
      const data = (await client.patch(
        `/email/outreach/templates/${encodeURIComponent(id)}`,
        assertNoDuplicateSignature(
          readJsonDocument(opts.file!),
          opts.allowSignature,
        ),
      )) as { template?: any };
      output(wantsJson(opts) ? data : templateRow(data.template), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const workflows = outreachResource
  .command("workflows")
  .description("Choose which workflows partners can start from Quick send");

workflows
  .command("list")
  .description("List the organization's workflows and their Quick send switch")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await loadSetup();
      output(
        wantsJson(opts)
          ? { workflows: data.workflows ?? [] }
          : (data.workflows ?? []).map(workflowRow),
        { json: opts.json, format: opts.format },
      );
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const setQuickSend = async (id: string, quickSend: boolean, opts: ActionOpts) => {
  try {
    const data = (await client.patch(
      `/email/outreach/workflows/${encodeURIComponent(id)}`,
      { quickSend },
    )) as { workflow?: any };
    output(wantsJson(opts) ? data : workflowRow(data.workflow), {
      json: opts.json,
      format: opts.format,
    });
  } catch (err) {
    handleError(err, opts.json);
  }
};

workflows
  .command("enable")
  .description("Let partners start this workflow from Quick send")
  .argument("<workflowId>", "Workflow id")
  .option("--json", "Output as JSON")
  .action((id: string, opts: ActionOpts) => setQuickSend(id, true, opts));

workflows
  .command("disable")
  .description("Stop offering this workflow to partners")
  .argument("<workflowId>", "Workflow id")
  .option("--json", "Output as JSON")
  .action((id: string, opts: ActionOpts) => setQuickSend(id, false, opts));

outreachResource
  .command("sends")
  .description("Recent Quick sends across the organization")
  .option("--limit <n>", "How many (max 100)", "30")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/outreach/sends", {
        limit: opts.limit ?? "30",
      })) as { sends?: any[] };
      output(
        wantsJson(opts)
          ? data
          : (data.sends ?? []).map((send) => ({
              email: send.email,
              partner: send.partnerName ?? "-",
              template: send.templateName ?? "-",
              workflow: send.workflowName ?? "-",
              status: send.delivery?.status ?? send.status,
              createdAt: send.createdAt,
            })),
        { json: opts.json, format: opts.format, fields: opts.fields?.split(",") },
      );
    } catch (err) {
      handleError(err, opts.json);
    }
  });
