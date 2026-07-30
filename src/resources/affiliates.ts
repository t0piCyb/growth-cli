import { Command } from "commander";
import { client } from "../lib/client.js";
import { globalFlags } from "../lib/config.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";

const wantsJson = (opts: { json?: boolean }) => opts.json ?? globalFlags.json;

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  status?: string;
  limit?: string;
  name?: string;
  email?: string;
  code?: string;
  targetUrl?: string;
};

const affiliateRow = (affiliate: any) => ({
  id: affiliate?.id,
  name: affiliate?.name,
  email: affiliate?.email,
  code: affiliate?.code,
  status: affiliate?.status,
  stripe: affiliate?.stripeAccountStatus,
  customers: affiliate?.customersCount ?? 0,
  revenue: affiliate?.revenueAmount ?? 0,
  unpaid: affiliate?.unpaidAmount ?? 0,
});

export const affiliatesResource = new Command("affiliates")
  .alias("partners")
  .description("Manage affiliate partners and pay them out");

affiliatesResource
  .command("list")
  .description("List partners with their rollup counters")
  .option("--status <status>", "invited|active|paused")
  .option("--limit <n>", "Max partners to scan (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    "\nAmounts are in minor units (cents) of the partner payout currency.",
  )
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/affiliates", {
        ...(opts.status && { status: opts.status }),
        ...(opts.limit && { limit: opts.limit }),
      })) as { affiliates?: any[] };
      output(
        wantsJson(opts) ? data : (data.affiliates ?? []).map(affiliateRow),
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

affiliatesResource
  .command("get")
  .description("Show one partner and its program")
  .argument("<affiliate-id>", "Affiliate ID")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (affiliateId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(
        `/affiliates/${encodeURIComponent(affiliateId)}`,
      )) as { affiliate?: any };
      output(wantsJson(opts) ? data : affiliateRow(data.affiliate), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

affiliatesResource
  .command("create")
  .description("Create a partner in the default program and email the invite")
  .requiredOption("--name <name>", "Partner name")
  .requiredOption("--email <email>", "Partner email")
  .option("--code <code>", "Referral code (generated when omitted)")
  .option("--target-url <url>", "Landing URL for the referral link")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/affiliates", {
        name: opts.name,
        email: opts.email,
        ...(opts.code && { code: opts.code }),
        ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const setStatus = async (
  affiliateId: string,
  status: "invited" | "active" | "paused",
  opts: ActionOpts,
) => {
  try {
    const data = await client.patch(
      `/affiliates/${encodeURIComponent(affiliateId)}`,
      { status },
    );
    output(data, { json: opts.json });
  } catch (err) {
    handleError(err, opts.json);
  }
};

affiliatesResource
  .command("activate")
  .description("Set a partner to active")
  .argument("<affiliate-id>", "Affiliate ID")
  .option("--json", "Output as JSON")
  .action((affiliateId: string, opts: ActionOpts) =>
    setStatus(affiliateId, "active", opts),
  );

affiliatesResource
  .command("pause")
  .description("Pause a partner (links stop converting)")
  .argument("<affiliate-id>", "Affiliate ID")
  .option("--json", "Output as JSON")
  .action((affiliateId: string, opts: ActionOpts) =>
    setStatus(affiliateId, "paused", opts),
  );

affiliatesResource
  .command("payout")
  .description("Transfer a partner's approved commissions via Stripe")
  .argument("<affiliate-id>", "Affiliate ID")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    "\nMoves money: the organization's connected Stripe balance must cover the\napproved commissions, and the partner must have completed onboarding.",
  )
  .action(async (affiliateId: string, opts: ActionOpts) => {
    try {
      const data = await client.post(
        `/affiliates/${encodeURIComponent(affiliateId)}/payout`,
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

affiliatesResource
  .command("stats")
  .description("Program totals: partners, clicks, revenue, commissions")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/affiliate/stats")) as { stats?: any };
      output(wantsJson(opts) ? data : (data.stats ?? data), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
