import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";

type ActionOpts = {
  json?: boolean;
  ref?: string;
  landingUrl?: string;
  referrer?: string;
  visitorId?: string;
  customerKey?: string;
  customerEmail?: string;
  amount?: string;
  currency?: string;
  sourceId?: string;
  clickId?: string;
  stripeChargeId?: string;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string;
};

export const affiliateResource = new Command("affiliate").description(
  "Record affiliate integration events",
);

affiliateResource
  .command("click")
  .description("Record an affiliate click")
  .requiredOption("--ref <ref>", "Affiliate ref")
  .option("--landing-url <url>", "Landing URL")
  .option("--referrer <url>", "Referrer URL")
  .option("--visitor-id <id>", "Visitor ID")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/affiliate/click", {
        ref: opts.ref,
        landingUrl: opts.landingUrl,
        referrer: opts.referrer,
        visitorId: opts.visitorId,
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

affiliateResource
  .command("signup")
  .description("Record an affiliate-attributed signup")
  .requiredOption("--customer-key <key>", "Customer key in your app")
  .option("--ref <ref>", "Affiliate ref")
  .option("--click-id <id>", "Click ID returned by affiliate click")
  .option("--visitor-id <id>", "Visitor ID")
  .option("--customer-email <email>", "Customer email")
  .option("--amount <amount>", "Initial amount")
  .option("--currency <currency>", "Currency")
  .option("--source-id <id>", "Source ID")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/affiliate/signup", {
        customerKey: opts.customerKey,
        ref: opts.ref,
        clickId: opts.clickId,
        visitorId: opts.visitorId,
        customerEmail: opts.customerEmail,
        ...(opts.amount && { amount: Number(opts.amount) }),
        currency: opts.currency,
        sourceId: opts.sourceId,
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

affiliateResource
  .command("payment")
  .description("Record an affiliate-attributed payment")
  .requiredOption("--customer-key <key>", "Customer key in your app")
  .option("--amount <amount>", "Payment amount")
  .option("--currency <currency>", "Currency")
  .option("--source-id <id>", "Source ID")
  .option("--stripe-charge-id <id>", "Stripe charge ID")
  .option("--stripe-invoice-id <id>", "Stripe invoice ID")
  .option("--stripe-payment-intent-id <id>", "Stripe payment intent ID")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/affiliate/payment", {
        customerKey: opts.customerKey,
        ...(opts.amount && { amount: Number(opts.amount) }),
        currency: opts.currency,
        sourceId: opts.sourceId,
        stripeChargeId: opts.stripeChargeId,
        stripeInvoiceId: opts.stripeInvoiceId,
        stripePaymentIntentId: opts.stripePaymentIntentId,
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
