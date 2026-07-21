import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
};

const pathFor = (email: string, tags: string[]) =>
  `/email/contacts/${encodeURIComponent(email)}/tags?${new URLSearchParams({
    tags: tags.join(","),
  }).toString()}`;

export const tagsResource = new Command("tags").description(
  "List and edit subscriber tags",
);

tagsResource
  .command("list")
  .description("List organization tags")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/tags")) as { tags?: unknown[] };
      output(opts.json ? data : (data.tags ?? []), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

tagsResource
  .command("add")
  .description("Add tags to a subscriber")
  .argument("<email>", "Subscriber email")
  .argument("<tags...>", "Tags to add")
  .option("--json", "Output as JSON")
  .action(async (email: string, tags: string[], opts: ActionOpts) => {
    try {
      const data = await client.post(
        `/email/contacts/${encodeURIComponent(email)}/tags`,
        { tags },
      );
      output(opts.json ? data : (data as { contact?: unknown }).contact ?? data, {
        json: opts.json,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

tagsResource
  .command("remove")
  .description("Remove tags from a subscriber")
  .argument("<email>", "Subscriber email")
  .argument("<tags...>", "Tags to remove")
  .option("--json", "Output as JSON")
  .action(async (email: string, tags: string[], opts: ActionOpts) => {
    try {
      const data = await client.delete(pathFor(email, tags));
      output(opts.json ? data : (data as { contact?: unknown }).contact ?? data, {
        json: opts.json,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
