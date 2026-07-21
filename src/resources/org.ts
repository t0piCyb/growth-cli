import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";

type ActionOpts = {
  json?: boolean;
  format?: string;
};

export const orgResource = new Command("org")
  .description("Show the organization attached to the active API key")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.get("/me");
      output((data as { organization?: unknown }).organization ?? data, {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

orgResource
  .command("show")
  .description("Show the organization attached to the active API key")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.get("/me");
      output((data as { organization?: unknown }).organization ?? data, {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
