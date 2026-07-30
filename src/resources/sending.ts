import { Command } from "commander";
import { client } from "../lib/client.js";
import { globalFlags } from "../lib/config.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";

/**
 * `--json` may arrive on the subcommand OR be inherited from the root command,
 * where the preAction hook parks it in globalFlags.
 */
const wantsJson = (opts: { json?: boolean }) => opts.json ?? globalFlags.json;

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  provider?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  stream?: string;
  identity?: string;
  default?: boolean;
  clear?: boolean;
};

/* ------------------------------------------------------------------ */
/* providers                                                           */
/* ------------------------------------------------------------------ */

export const providersResource = new Command("providers").description(
  "Sending provider accounts (Amazon SES, Resend, Brevo, SMTP)",
);

providersResource
  .command("list")
  .description("List the organization's sending provider accounts")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/providers")) as {
        providers?: unknown[];
      };
      // Credentials are never returned by the API, not even masked.
      output(wantsJson(opts) ? data : (data.providers ?? []), {
        json: wantsJson(opts),
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, wantsJson(opts));
    }
  });

providersResource
  .command("test")
  .description(
    "Check the stored credentials; for Amazon SES also reports quota, send rate and sandbox state",
  )
  .argument("<id>", "Provider id")
  .option("--json", "Output as JSON")
  .action(async (id: string, opts: ActionOpts) => {
    try {
      const data = (await client.post("/email/providers/test", {
        providerId: id,
      })) as { test?: unknown };
      output(wantsJson(opts) ? data : (data.test ?? data), {
        json: wantsJson(opts),
      });
    } catch (err) {
      handleError(err, wantsJson(opts));
    }
  });

/* ------------------------------------------------------------------ */
/* identities                                                          */
/* ------------------------------------------------------------------ */

export const identitiesResource = new Command("identities").description(
  "Sender addresses bound to a provider account",
);

identitiesResource
  .command("list")
  .description("List sending identities")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/identities")) as {
        identities?: unknown[];
      };
      output(wantsJson(opts) ? data : (data.identities ?? []), {
        json: wantsJson(opts),
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, wantsJson(opts));
    }
  });

identitiesResource
  .command("create")
  .description(
    "Create or update a sending identity (re-posting the same address updates it)",
  )
  .requiredOption("--provider <id>", "Provider id the identity sends through")
  .requiredOption("--from <address>", 'Sender, e.g. "Acme <hello@acme.com>"')
  .option("--from-name <name>", "Display name, if not part of --from")
  .option("--reply-to <address>", "Reply-to address")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.post("/email/identities", {
        providerId: opts.provider,
        from: opts.from,
        fromName: opts.fromName,
        replyTo: opts.replyTo,
      })) as { identity?: unknown };
      output(wantsJson(opts) ? data : (data.identity ?? data), {
        json: wantsJson(opts),
      });
    } catch (err) {
      handleError(err, wantsJson(opts));
    }
  });

identitiesResource
  .command("delete")
  .description("Delete a sending identity")
  .argument("<id>", "Identity id")
  .option("--json", "Output as JSON")
  .action(async (id: string, opts: ActionOpts) => {
    try {
      const data = await client.delete(
        `/email/identities?identityId=${encodeURIComponent(id)}`,
      );
      output(data, { json: wantsJson(opts) });
    } catch (err) {
      handleError(err, wantsJson(opts));
    }
  });

/* ------------------------------------------------------------------ */
/* routing                                                             */
/* ------------------------------------------------------------------ */

export const routingResource = new Command("routing").description(
  "Which identity carries marketing, transactional and default email",
);

routingResource
  .command("show")
  .description("Show the current stream routing")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/routing")) as { routing?: unknown };
      output(wantsJson(opts) ? data : (data.routing ?? data), {
        json: wantsJson(opts),
      });
    } catch (err) {
      handleError(err, wantsJson(opts));
    }
  });

routingResource
  .command("set")
  .description("Route a stream to an identity")
  .option("--stream <name>", "marketing or transactional")
  .option("--default", "Set the default route instead of a stream")
  .option("--identity <id>", "Identity id")
  .option("--clear", "Clear the route instead of setting it")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      if (!opts.stream && !opts.default) {
        throw new Error("Pass --stream <marketing|transactional> or --default");
      }
      if (!opts.identity && !opts.clear) {
        throw new Error("Pass --identity <id> or --clear");
      }
      const data = await client.post("/email/routing", {
        // Omitting the stream sets the default route.
        stream: opts.default ? undefined : opts.stream,
        identityId: opts.clear ? null : opts.identity,
      });
      output(data, { json: wantsJson(opts) });
    } catch (err) {
      handleError(err, wantsJson(opts));
    }
  });
