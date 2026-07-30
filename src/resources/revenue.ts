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
  affiliate?: string;
  status?: string;
  cursor?: string;
  limit?: string;
};

const paymentRow = (payment: any) => ({
  id: payment?.id,
  occurredAt: payment?.occurredAt,
  customer: payment?.customerEmail ?? payment?.customerKey,
  net: payment?.netAmount,
  currency: payment?.currency,
  type: payment?.paymentType,
  source: payment?.source,
  affiliate: payment?.affiliateName,
});

const commissionRow = (commission: any) => ({
  id: commission?.id,
  affiliate: commission?.affiliateName,
  customer: commission?.customerKey,
  amount: commission?.amount,
  commission: commission?.commissionAmount,
  currency: commission?.currency,
  status: commission?.status,
  createdAt: commission?.createdAt,
});

const payoutRow = (payout: any) => ({
  id: payout?.id,
  affiliate: payout?.affiliateName,
  amount: payout?.amount,
  currency: payout?.currency,
  status: payout?.status,
  commissions: payout?.commissionsCount ?? 0,
  transfer: payout?.stripeTransferId,
  createdAt: payout?.createdAt,
});

/* --- payments --- */

export const paymentsResource = new Command("payments").description(
  "Read the payments the organization collected",
);

paymentsResource
  .command("list")
  .description("List payments, newest first")
  .option("--affiliate <id>", "Only payments attributed to this partner")
  .option("--cursor <cursor>", "Cursor from the previous page")
  .option("--limit <n>", "Rows per page (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .addHelpText(
    "after",
    "\nAmounts are in minor units, net of anything refunded.",
  )
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/affiliate/payments", {
        ...(opts.affiliate && { affiliateId: opts.affiliate }),
        ...(opts.cursor && { cursor: opts.cursor }),
        ...(opts.limit && { limit: opts.limit }),
      })) as { payments?: any[]; cursor?: string | null };
      output(wantsJson(opts) ? data : (data.payments ?? []).map(paymentRow), {
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

paymentsResource
  .command("summary")
  .description("Rolling four-week totals across the whole window")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/affiliate/payments/summary")) as {
        summary?: any;
      };
      output(wantsJson(opts) ? data : (data.summary ?? data), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

/* --- commissions --- */

export const commissionsResource = new Command("commissions").description(
  "Read and approve partner commissions",
);

commissionsResource
  .command("list")
  .description("List commissions, newest first")
  .option("--status <status>", "pending|approved|processing|paid|void")
  .option("--affiliate <id>", "Only this partner's commissions")
  .option("--limit <n>", "Max rows to return (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/affiliate/commissions", {
        ...(opts.status && { status: opts.status }),
        ...(opts.affiliate && { affiliateId: opts.affiliate }),
        ...(opts.limit && { limit: opts.limit }),
      })) as { commissions?: any[] };
      output(
        wantsJson(opts) ? data : (data.commissions ?? []).map(commissionRow),
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

commissionsResource
  .command("approve")
  .description("Approve a pending commission so it can be paid out")
  .argument("<commission-id>", "Commission ID")
  .option("--json", "Output as JSON")
  .action(async (commissionId: string, opts: ActionOpts) => {
    try {
      const data = await client.post(
        `/affiliate/commissions/${encodeURIComponent(commissionId)}/approve`,
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

/* --- payouts --- */

export const payoutsResource = new Command("payouts").description(
  "Read partner payouts (create one with `affiliates payout`)",
);

payoutsResource
  .command("list")
  .description("List payouts, newest first")
  .option("--affiliate <id>", "Only this partner's payouts")
  .option("--limit <n>", "Max rows to return (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/affiliate/payouts", {
        ...(opts.affiliate && { affiliateId: opts.affiliate }),
        ...(opts.limit && { limit: opts.limit }),
      })) as { payouts?: any[] };
      output(wantsJson(opts) ? data : (data.payouts ?? []).map(payoutRow), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
