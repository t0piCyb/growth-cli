import { Command } from "commander";
import { client } from "../lib/client.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
};

const formatMember = (member: any) => ({
  id: member.id,
  role: member.role,
  name: member.user?.name ?? "-",
  email: member.user?.email ?? "-",
  createdAt: member.createdAt,
});

export const membersResource = new Command("members").description(
  "Read organization members",
);

membersResource
  .command("list")
  .description("List organization members")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/members")) as { members?: any[] };
      const fields = opts.fields?.split(",");
      output(opts.json ? data : (data.members ?? []).map(formatMember), {
        json: opts.json,
        format: opts.format,
        fields,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

membersResource
  .command("get")
  .description("Get one organization member")
  .argument("<member-id>", "Member ID")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (memberId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(`/members/${encodeURIComponent(memberId)}`)) as {
        member?: any;
      };
      output(opts.json ? data : formatMember(data.member), {
        json: opts.json,
        format: opts.format,
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
