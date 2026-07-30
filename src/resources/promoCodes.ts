import { Command } from "commander";
import { client } from "../lib/client.js";
import { globalFlags } from "../lib/config.js";
import { CliError, handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";
import { parseDate, parseNumber } from "../lib/values.js";

const wantsJson = (opts: { json?: boolean }) => opts.json ?? globalFlags.json;

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  affiliate?: string;
  limit?: string;
  code?: string;
  percent?: string;
  amount?: string;
  currency?: string;
  duration?: string;
  months?: string;
  startsAt?: string;
  expiresAt?: string;
  maxRedemptions?: string;
  clearExpiry?: boolean;
  clearLimit?: boolean;
  startingAfter?: string;
};

const promoCodeRow = (promoCode: any) => ({
  id: promoCode?.id,
  code: promoCode?.code,
  status: promoCode?.status,
  discount:
    promoCode?.discountType === "percent"
      ? `${(promoCode?.percentOffBps ?? 0) / 100}%`
      : `${promoCode?.amountOff ?? 0} ${String(promoCode?.currency ?? "").toUpperCase()}`,
  affiliate: promoCode?.affiliate?.name,
  redemptions: promoCode?.redemptionsCount ?? 0,
  maxRedemptions: promoCode?.maxRedemptions,
  expiresAt: promoCode?.expiresAt,
});

export const promoCodesResource = new Command("promo-codes")
  .alias("promos")
  .description("Create and manage Stripe promo codes for partners");

promoCodesResource
  .command("list")
  .description("List promo codes, newest first")
  .option("--affiliate <id>", "Only codes linked to this partner")
  .option("--limit <n>", "Max codes to return (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/affiliate/promo-codes", {
        ...(opts.affiliate && { affiliateId: opts.affiliate }),
        ...(opts.limit && { limit: opts.limit }),
      })) as { promoCodes?: any[] };
      output(
        wantsJson(opts) ? data : (data.promoCodes ?? []).map(promoCodeRow),
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

promoCodesResource
  .command("create")
  .description("Create a coupon + promotion code on the connected Stripe account")
  .requiredOption("--code <code>", "Customer-facing code, e.g. LAUNCH20")
  .option("--percent <pct>", "Percent discount, e.g. 20 for 20%")
  .option("--amount <minor>", "Fixed discount in minor units, e.g. 500 = 5.00")
  .option("--currency <currency>", "ISO currency for a fixed discount")
  .option("--affiliate <id>", "Link the code to this partner")
  .option("--duration <duration>", "forever|once|repeating (default forever)")
  .option("--months <n>", "Months a repeating discount runs (1-36)")
  .option("--starts-at <date>", "ISO date or ms timestamp")
  .option("--expires-at <date>", "ISO date or ms timestamp, in the future")
  .option("--max-redemptions <n>", "Total redemption limit")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    "\nRequires a connected Stripe account with charges enabled.\n\nExample:\n  growth-cli promo-codes create --code LAUNCH20 --percent 20 --affiliate n97…",
  )
  .action(async (opts: ActionOpts) => {
    try {
      if (!opts.percent && !opts.amount) {
        throw new CliError(400, "Pass --percent <pct> or --amount <minor>");
      }
      if (opts.percent && opts.amount) {
        throw new CliError(400, "Pass only one of --percent or --amount");
      }

      const data = await client.post("/affiliate/promo-codes", {
        code: opts.code,
        ...(opts.percent
          ? {
              discountType: "percent",
              // Stripe stores hundredths of a percent; 20% => 2000 bps.
              percentOffBps: Math.round(
                parseNumber(opts.percent, "--percent") * 100,
              ),
            }
          : {
              discountType: "fixed",
              amountOff: Math.round(parseNumber(opts.amount!, "--amount")),
            }),
        ...(opts.currency && { currency: opts.currency }),
        ...(opts.affiliate && { affiliateId: opts.affiliate }),
        ...(opts.duration && { duration: opts.duration }),
        ...(opts.months && {
          durationInMonths: Math.round(parseNumber(opts.months, "--months")),
        }),
        ...(opts.startsAt && {
          startsAt: parseDate(opts.startsAt, "--starts-at"),
        }),
        ...(opts.expiresAt && {
          expiresAt: parseDate(opts.expiresAt, "--expires-at"),
        }),
        ...(opts.maxRedemptions && {
          maxRedemptions: Math.round(
            parseNumber(opts.maxRedemptions, "--max-redemptions"),
          ),
        }),
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

promoCodesResource
  .command("update")
  .description("Change a promo code's deadline or redemption limit")
  .argument("<promo-code-id>", "Promo code ID")
  .option("--expires-at <date>", "ISO date or ms timestamp, in the future")
  .option("--clear-expiry", "Remove the deadline")
  .option("--max-redemptions <n>", "Total redemption limit")
  .option("--clear-limit", "Remove the redemption limit")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    "\nStripe promotion codes are immutable, so editing either field archives the\nStripe code and recreates it; Growth keeps reporting lifetime redemptions.",
  )
  .action(async (promoCodeId: string, opts: ActionOpts) => {
    try {
      const body: Record<string, unknown> = {};
      if (opts.clearExpiry) body.expiresAt = null;
      else if (opts.expiresAt) {
        body.expiresAt = parseDate(opts.expiresAt, "--expires-at");
      }
      if (opts.clearLimit) body.maxRedemptions = null;
      else if (opts.maxRedemptions) {
        body.maxRedemptions = Math.round(
          parseNumber(opts.maxRedemptions, "--max-redemptions"),
        );
      }
      if (Object.keys(body).length === 0) {
        throw new CliError(400, "Nothing to update; pass at least one flag");
      }

      const data = await client.patch(
        `/affiliate/promo-codes/${encodeURIComponent(promoCodeId)}`,
        body,
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

const setStatus = async (
  promoCodeId: string,
  status: "active" | "paused",
  opts: ActionOpts,
) => {
  try {
    const data = await client.patch(
      `/affiliate/promo-codes/${encodeURIComponent(promoCodeId)}`,
      { status },
    );
    output(data, { json: opts.json });
  } catch (err) {
    handleError(err, opts.json);
  }
};

promoCodesResource
  .command("pause")
  .description("Deactivate a promo code in Stripe")
  .argument("<promo-code-id>", "Promo code ID")
  .option("--json", "Output as JSON")
  .action((promoCodeId: string, opts: ActionOpts) =>
    setStatus(promoCodeId, "paused", opts),
  );

promoCodesResource
  .command("activate")
  .description("Reactivate a paused promo code")
  .argument("<promo-code-id>", "Promo code ID")
  .option("--json", "Output as JSON")
  .action((promoCodeId: string, opts: ActionOpts) =>
    setStatus(promoCodeId, "active", opts),
  );

promoCodesResource
  .command("sync")
  .description("Import promotion codes created in the Stripe dashboard")
  .option("--limit <n>", "Codes per batch (1-100)")
  .option("--starting-after <id>", "Stripe cursor from a previous run")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/affiliate/promo-codes/sync", {
        ...(opts.limit && {
          limit: Math.round(parseNumber(opts.limit, "--limit")),
        }),
        ...(opts.startingAfter && { startingAfter: opts.startingAfter }),
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
