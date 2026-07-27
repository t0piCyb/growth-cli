import { Command } from "commander";
import { client } from "../lib/client.js";
import { CliError, handleError } from "../lib/errors.js";
import { readJsonDocument } from "../lib/jsonFile.js";
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
  status?: string;
  trigger?: string;
  file?: string;
  export?: boolean;
  force?: boolean;
  clear?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  tags?: string;
  field?: string;
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

const workflowRow = (workflow: any) => ({
  id: workflow.id,
  name: workflow.name,
  status: workflow.status,
  trigger: workflow.trigger,
  steps: workflow.steps?.length ?? 0,
  updatedAt: workflow.updatedAt,
});

const dropEmpty = (step: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(step).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );

/**
 * Converts an API workflow (flat steps with ids) back into the nested
 * authoring document, so `get --export > wf.json` round-trips into
 * `update --file wf.json`.
 */
const toAuthoringDoc = (workflow: any) => {
  const steps = [...(workflow.steps ?? [])].sort(
    (a: any, b: any) => a.order - b.order,
  );

  const nodes = new Map<string, Record<string, any>>(
    steps.map((step: any) => [
      step.id,
      dropEmpty({
        kind: step.kind,
        delayMs: step.delayMs || undefined,
        waitUntil: step.waitUntil,
        subject: step.subject,
        previewText: step.previewText,
        contentBlocks: step.contentBlocks,
        hideDefaultUnsubscribe: step.hideDefaultUnsubscribe || undefined,
        branch: step.branch,
        action: step.action,
      }),
    ]),
  );

  // Steps are ordered parent-before-child, so appending as we walk keeps
  // sibling order intact.
  const roots: Record<string, any>[] = [];
  for (const step of steps as any[]) {
    const node = nodes.get(step.id)!;
    const parent = step.parentStepId ? nodes.get(step.parentStepId) : undefined;
    if (!parent) {
      roots.push(node);
      continue;
    }
    const side = step.parentBranch === "no" ? "no" : "yes";
    (parent[side] ??= []).push(node);
  }

  return dropEmpty({
    name: workflow.name,
    trigger: workflow.trigger,
    triggerTags: workflow.triggerTags,
    triggerTagMode: workflow.triggerTagMode,
    triggerExcludeTags: workflow.triggerExcludeTags,
    status: workflow.status,
    steps: roots,
  });
};

/** Prints the save response, warning when live enrollments were affected. */
const reportSave = (data: any, opts: ActionOpts) => {
  if (wantsJson(opts)) {
    output(data, { json: true });
    return;
  }
  output(workflowRow(data.workflow), { format: opts.format });
  if (data.activeEnrollments > 0) {
    console.warn(
      `warning: ${data.activeEnrollments}${data.enrollmentsSampleLimited ? "+" : ""} contact(s) are mid-flow in this workflow; replacing steps moves them onto the step at the same position.`,
    );
  }
};

export const workflowsResource = new Command("workflows").description(
  "Create, edit and trigger email workflows",
);

workflowsResource
  .command("list")
  .description("List workflows (API-request triggered by default)")
  .option("--status <status>", "draft|active|paused")
  .option(
    "--trigger <trigger>",
    "manual|contact_created|tag_added|affiliate_customer_created|capture_page_submitted|api_request|all",
  )
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/workflows", {
        ...(opts.status && { status: opts.status }),
        ...(opts.trigger && { trigger: opts.trigger }),
      })) as { workflows?: any[] };
      output(wantsJson(opts) ? data : (data.workflows ?? []).map(workflowRow), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

workflowsResource
  .command("get")
  .description("Show one workflow with its full step tree")
  .argument("<workflow-id>", "Workflow ID")
  .option("--export", "Print the nested authoring JSON (feeds --file)")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (workflowId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(
        `/email/workflows/${encodeURIComponent(workflowId)}`,
      )) as { workflow?: any };

      if (opts.export) {
        console.log(JSON.stringify(toAuthoringDoc(data.workflow), null, 2));
        // Re-importing renumbers steps in tree order, so legacy jump targets
        // (which point at absolute step orders) can end up on another step.
        const jumps = (data.workflow?.steps ?? []).filter(
          (step: any) =>
            step.branch?.onTrueGoToOrder != null ||
            step.branch?.onFalseGoToOrder != null,
        ).length;
        if (jumps > 0) {
          console.warn(
            `warning: ${jumps} condition(s) use onTrueGoToOrder/onFalseGoToOrder, which reference absolute step orders. Re-check those targets before importing this file back.`,
          );
        }
        return;
      }
      output(wantsJson(opts) ? data : (data.workflow ?? data), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

workflowsResource
  .command("create")
  .description("Create a workflow from a JSON document")
  .requiredOption("--file <path>", 'Workflow JSON file ("-" reads stdin)')
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const body = readJsonDocument(opts.file!);
      const data = await client.post("/email/workflows", body);
      reportSave(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

workflowsResource
  .command("update")
  .description("Replace a workflow from a JSON document")
  .argument("<workflow-id>", "Workflow ID")
  .requiredOption("--file <path>", 'Workflow JSON file ("-" reads stdin)')
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (workflowId: string, opts: ActionOpts) => {
    try {
      const body = readJsonDocument(opts.file!);
      const data = await client.put(
        `/email/workflows/${encodeURIComponent(workflowId)}`,
        body,
      );
      reportSave(data, opts);
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const setStatus = async (
  workflowId: string,
  status: "active" | "paused" | "draft",
  opts: ActionOpts,
) => {
  try {
    const data = await client.patch(
      `/email/workflows/${encodeURIComponent(workflowId)}`,
      { status },
    );
    reportSave(data, opts);
  } catch (err) {
    handleError(err, opts.json);
  }
};

workflowsResource
  .command("publish")
  .description("Set a workflow to active")
  .argument("<workflow-id>", "Workflow ID")
  .option("--json", "Output as JSON")
  .action((workflowId: string, opts: ActionOpts) =>
    setStatus(workflowId, "active", opts),
  );

workflowsResource
  .command("pause")
  .description("Set a workflow to paused")
  .argument("<workflow-id>", "Workflow ID")
  .option("--json", "Output as JSON")
  .action((workflowId: string, opts: ActionOpts) =>
    setStatus(workflowId, "paused", opts),
  );

workflowsResource
  .command("unpublish")
  .description("Set a workflow back to draft")
  .argument("<workflow-id>", "Workflow ID")
  .option("--json", "Output as JSON")
  .action((workflowId: string, opts: ActionOpts) =>
    setStatus(workflowId, "draft", opts),
  );

workflowsResource
  .command("exclude-tags")
  .description("Set the tags that keep a contact out of a workflow")
  .argument("<workflow-id>", "Workflow ID")
  .option("--tags <tags>", "Comma-separated tags (replaces the current list)")
  .option("--clear", "Remove every exclude tag")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    "\nExclude tags are checked on entry AND before every step, so a contact\nthat gains one mid-flow leaves the workflow. Unlike `update`, this only\npatches the trigger rules and never touches the step tree.\n\nExample:\n  growth-cli workflows exclude-tags n97… --tags customer",
  )
  .action(async (workflowId: string, opts: ActionOpts) => {
    try {
      if (!opts.clear && !opts.tags) {
        throw new CliError(400, "Pass --tags <list> or --clear");
      }
      const data = (await client.patch(
        `/email/workflows/${encodeURIComponent(workflowId)}`,
        { triggerExcludeTags: opts.clear ? [] : splitList(opts.tags) },
      )) as { workflow?: any };
      // No steps were sent, so the mid-flow warning in reportSave would lie.
      output(
        wantsJson(opts)
          ? data
          : {
              ...workflowRow(data.workflow),
              excludeTags:
                (data.workflow?.triggerExcludeTags ?? []).join(",") || "-",
            },
        { json: opts.json, format: opts.format },
      );
    } catch (err) {
      handleError(err, opts.json);
    }
  });

workflowsResource
  .command("delete")
  .description("Delete a workflow, its steps and its enrollments")
  .argument("<workflow-id>", "Workflow ID")
  .option("--force", "Delete even when contacts are still enrolled")
  .option("--json", "Output as JSON")
  .action(async (workflowId: string, opts: ActionOpts) => {
    try {
      const data = await client.delete(
        `/email/workflows/${encodeURIComponent(workflowId)}${opts.force ? "?force=true" : ""}`,
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

workflowsResource
  .command("trigger")
  .description("Trigger an API-request workflow for a subscriber")
  .argument("<workflow-id>", "Workflow ID")
  .requiredOption("--email <email>", "Subscriber email")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--tags <tags>", "Comma-separated tags to merge")
  .option("--field <key=value>", "Comma-separated custom fields")
  .option("--json", "Output as JSON")
  .action(async (workflowId: string, opts: ActionOpts) => {
    try {
      const data = await client.post("/email/workflows/trigger", {
        workflowId,
        email: opts.email,
        ...(opts.firstName && { firstName: opts.firstName }),
        ...(opts.lastName && { lastName: opts.lastName }),
        ...(opts.tags && { tags: splitList(opts.tags) }),
        ...(opts.field && { customFields: parseCustomFields(opts.field) }),
      });
      output(opts.json ? data : (data as { contact?: unknown }).contact ?? data, {
        json: opts.json,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
