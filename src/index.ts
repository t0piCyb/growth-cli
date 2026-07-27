#!/usr/bin/env bun
import { Command } from "commander";
import { globalFlags } from "./lib/config.js";
import { resolveProfile } from "./lib/profiles.js";
import { authCommand } from "./commands/auth.js";
import { affiliateResource } from "./resources/affiliate.js";
import { contactsResource } from "./resources/contacts.js";
import { membersResource } from "./resources/members.js";
import { orgResource } from "./resources/org.js";
import { tagsResource } from "./resources/tags.js";
import { transactionalResource } from "./resources/transactional.js";
import { workflowsResource } from "./resources/workflows.js";

const program = new Command();

program
  .name("growth-cli")
  .description("CLI for the growth API")
  .version("0.3.0")
  .option("--json", "Output as JSON", false)
  .option("--format <fmt>", "Output format: text, json, csv, yaml", "text")
  .option("--verbose", "Enable debug logging", false)
  .option("--no-color", "Disable colored output")
  .option("--no-header", "Omit table/csv headers (for piping)")
  .option("--profile <name>", "Named organization profile")
  .hook("preAction", (_thisCmd, actionCmd) => {
    const root = actionCmd.optsWithGlobals();
    globalFlags.json = root.json ?? false;
    globalFlags.format = root.format ?? "text";
    globalFlags.verbose = root.verbose ?? false;
    globalFlags.noColor = root.color === false;
    globalFlags.noHeader = root.header === false;
    // Resolve once per run: --profile flag > GROWTH_PROFILE > saved active.
    globalFlags.profile = resolveProfile(root.profile);
  });

// Built-in commands
program.addCommand(authCommand);

// Resources
program.addCommand(orgResource);
program.addCommand(membersResource);
program.addCommand(contactsResource);
program.addCommand(tagsResource);
program.addCommand(workflowsResource);
program.addCommand(transactionalResource);
program.addCommand(affiliateResource);

program.parse();
