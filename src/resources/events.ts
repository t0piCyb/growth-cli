import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  event?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  tags?: string;
  field?: string;
  key?: string;
  value?: string;
  workflow?: string;
  priority?: string;
  status?: string;
  id?: string;
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

const routeRow = (route: any) => ({
  id: route.id,
  event: route.event,
  condition: route.isDefault
    ? "(default)"
    : `${route.matchKey} = ${route.matchValue}`,
  workflow: route.workflowName ?? route.workflowId,
  priority: route.priority,
  status: route.status,
  partner: route.partnerName ?? "",
});

export const eventsResource = new Command("events").description(
  "Fire lifecycle events and manage the routes that answer them",
);

eventsResource
  .command("trigger")
  .description("Fire an event; the organization's routes pick the workflow")
  .argument("<event>", "Event name, e.g. freebie")
  .requiredOption("--email <email>", "Subscriber email")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--tags <tags>", "Comma-separated tags to merge")
  .option("--field <key=value>", "Comma-separated custom fields")
  .option("--json", "Output as JSON")
  .action(async (event: string, opts: ActionOpts) => {
    try {
      const data = await client.post("/email/events/trigger", {
        event,
        email: opts.email,
        ...(opts.firstName && { firstName: opts.firstName }),
        ...(opts.lastName && { lastName: opts.lastName }),
        ...(opts.tags && { tags: splitList(opts.tags) }),
        ...(opts.field && { customFields: parseCustomFields(opts.field) }),
      });
      // `enrolled` is the answer worth reading: the call succeeds even when no
      // route matched, because the contact was merged either way.
      const result = data as {
        enrolled?: boolean;
        reason?: string;
        workflowName?: string | null;
        matchedBy?: string | null;
      };
      output(
        opts.json
          ? data
          : {
              enrolled: result.enrolled,
              reason: result.reason,
              workflow: result.workflowName ?? "",
              matchedBy: result.matchedBy ?? "",
            },
        { json: opts.json },
      );
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const routesResource = new Command("routes").description(
  "Rules mapping an event to the workflow that answers it",
);

routesResource
  .command("list")
  .description("List routes, in the order they are resolved")
  .option("--event <event>", "Only this event")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get(
        "/email/event-routes",
        opts.event ? { event: opts.event } : undefined,
      )) as { routes?: any[] };
      output(opts.json ? data : (data.routes ?? []).map(routeRow), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

routesResource
  .command("set")
  .description(
    "Create or update a route. Omit --key/--value to set the event default.",
  )
  .argument("<event>", "Event name, e.g. freebie")
  .requiredOption("--workflow <id>", "Workflow ID to enrol into")
  .option("--key <field>", "Contact field to test, e.g. utm_campaign")
  .option("--value <value>", "Value the field must equal")
  .option("--priority <n>", "Higher wins among rules")
  .option("--status <status>", "active or paused")
  .option("--id <routeId>", "Update this route instead of creating one")
  .option("--json", "Output as JSON")
  .action(async (event: string, opts: ActionOpts) => {
    try {
      if (Boolean(opts.key) !== Boolean(opts.value)) {
        throw new Error(
          "Pass --key and --value together, or neither for the event default",
        );
      }
      const data = await client.post("/email/event-routes", {
        event,
        workflowId: opts.workflow,
        ...(opts.id && { routeId: opts.id }),
        ...(opts.key && { matchKey: opts.key }),
        ...(opts.value && { matchValue: opts.value }),
        ...(opts.priority !== undefined && {
          priority: Number(opts.priority),
        }),
        ...(opts.status && { status: opts.status }),
      });
      const route = (data as { route?: any }).route;
      output(opts.json ? data : route ? routeRow(route) : data, {
        json: opts.json,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

routesResource
  .command("rm")
  .description("Delete a route")
  .argument("<route-id>", "Route ID")
  .option("--json", "Output as JSON")
  .action(async (routeId: string, opts: ActionOpts) => {
    try {
      const data = await client.delete(
        `/email/event-routes/${encodeURIComponent(routeId)}`,
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

eventsResource.addCommand(routesResource);
