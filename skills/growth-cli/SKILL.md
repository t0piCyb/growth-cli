---
name: growth-cli
description: "Manage growth with growth-cli. Use for generated API CLI commands, authentication, resources, JSON output, and agent-driven growth API workflows."
category: "other"
---

# growth-cli

## When To Use This Skill

Use the `growth-cli` skill when you need to:

- inspect or automate the growth API from a terminal
- authenticate with the generated `auth` commands
- list available generated resources and actions
- run API commands with parseable `--json` output
- update this skill after adding real resource commands

## Capabilities

- Provides a generated CLI shell for the growth API.
- Stores tokens in `~/.config/tokens/growth-cli.txt`.
- Supports standard output flags such as `--json`, `--format`, `--verbose`, `--no-color`, and `--no-header`.
- Should be finalized with real resource tables after implementing resources.

## Common Use Cases

- "Show me the available growth CLI commands."
- "Authenticate the growth CLI and test the token."
- "Run this growth API command and parse the JSON output."
- "Document the generated growth resource commands in this skill."

## Setup

If `growth-cli` is not found, install and build it:
```bash
bun --version || curl -fsSL https://bun.sh/install | bash
npx api2cli bundle growth
npx api2cli link growth
```

`api2cli link` adds `~/.local/bin` to PATH automatically. The CLI is available in the next command.

Always use `--json` flag when calling commands programmatically.

## Working Rules

- Always use `--json` for agent-driven calls so downstream steps can parse the result.
- Start with `--help` if the exact action or flags are unclear instead of guessing.
- Prefer read commands first when you need to inspect current state before mutating data.

## Authentication and profiles

An API key is scoped to **one organization**. Store one profile per org and
switch between them.

```bash
growth-cli auth set nsk_xxx --profile amencolors   # first profile becomes active
growth-cli auth set nsk_yyy --profile topilo
growth-cli auth list                               # "*" marks the active profile
growth-cli auth use topilo                         # switch, persists across runs
growth-cli auth test                               # confirm which org you are on
```

| Command | Effect |
| --- | --- |
| `auth set <token> [--profile p] [--use]` | Save a token; verifies it and caches the org name |
| `auth use <profile>` | Make a profile active for all later commands |
| `auth list` (`ls`) | Stored profiles, active marker, org name |
| `auth show [--profile p] [--raw]` | Masked (or raw) token for a profile |
| `auth test [--profile p]` | Call `/me` and report the organization |
| `auth remove [--profile p]` | Delete a profile's token |

Any command takes `--profile <name>` as a one-shot override:

```bash
growth-cli --profile amencolors workflows list
growth-cli workflows list --profile amencolors     # both positions work
```

**Resolution order** (first match wins):

1. `--profile <name>` on the command
2. `GROWTH_PROFILE` env var
3. active profile saved by `auth use`
4. `default`

Tokens live in `~/.config/tokens/growth-cli-<profile>.txt` (chmod 600); the
active profile and cached org labels in `~/.config/growth-cli/state.json`.

**Careful**: `GROWTH_API_KEY`, if set, overrides every profile — `--profile` is
then ignored. `auth list` warns when that variable is present. Use it only in
CI, where there is a single organization.

## Resources

### org / members

| Command | Effect |
| --- | --- |
| `growth-cli org show` | Organization behind the current API key |
| `growth-cli members list` | List organization members |
| `growth-cli members get <memberId>` | One member |

### contacts / tags

| Command | Effect |
| --- | --- |
| `growth-cli contacts list [--status <s>] [--tag <t>] [--limit <n>]` | List contacts |
| `growth-cli contacts get <email>` | One contact |
| `growth-cli contacts identify --email <e> [--tags] [--remove-tags] [--field k=v]` | **Upsert with ADDITIVE tags + MERGED fields** |
| `growth-cli contacts create --email <e> [--first-name] [--last-name] [--tags]` | Upsert that REPLACES tags and fields |
| `growth-cli contacts update <email> [...]` | Patch a contact |
| `growth-cli contacts sync --email <e> --event-key <k> --event-type <t> --event-source <s>` | Merge + record a deduplicated lifecycle event |
| `growth-cli contacts unsubscribe <email>` | Unsubscribe |
| `growth-cli contacts delete <email>` | Alias for unsubscribe — there is no hard delete |
| `growth-cli tags list` | Tags with contact counts |
| `growth-cli tags add <email> --tags a,b` | Add tags |
| `growth-cli tags remove <email> --tags a,b` | Remove tags |

**Choosing a write command.** `identify` is the default for app-side events
(signup, purchase, attribution): it creates the contact when missing, adds tags
without dropping the ones another integration wrote, and merges custom fields.
`create` and `tags add` have sharp edges — `create` replaces the whole tag set
AND the whole custom-field record, `tags add` returns 404 when the contact does
not exist yet. Adding a tag through `identify` still fires `tag_added`
workflows, so no placeholder workflow is needed to carry a payload.

### workflows

| Command | Effect |
| --- | --- |
| `growth-cli workflows list [--status <s>] [--trigger <t>\|all]` | List (defaults to `api_request` workflows) |
| `growth-cli workflows get <id> [--export]` | Show one; `--export` prints the authoring JSON |
| `growth-cli workflows create --file <path>` | Create from a JSON document (`-` reads stdin) |
| `growth-cli workflows update <id> --file <path>` | Full replace of settings **and** steps |
| `growth-cli workflows publish\|pause\|unpublish <id>` | Set status active / paused / draft |
| `growth-cli workflows delete <id> [--force]` | Delete; `--force` required if contacts are enrolled |
| `growth-cli workflows trigger <id> --email <e>` | Enroll a contact (workflow must be `api_request` + active) |

#### Workflow JSON format

Steps nest: a `condition` step carries `yes` / `no` arrays. Everything else is
flat. The API renumbers steps in tree order on save.

```json
{
  "name": "Onboarding",
  "trigger": "tag_added",
  "status": "draft",
  "triggerTags": ["signup"],
  "triggerTagMode": "all",
  "triggerExcludeTags": ["customer"],
  "steps": [
    {
      "kind": "email",
      "subject": "Welcome",
      "previewText": "Glad you're here",
      "contentBlocks": [
        { "type": "heading", "props": { "text": "Welcome" } },
        { "type": "text", "props": { "markdown": "Thanks for signing up." } }
      ]
    },
    { "kind": "delay", "delayMs": 86400000 },
    { "kind": "delay", "waitUntil": { "dayOfWeek": 1, "hour": 9, "timezone": "Europe/Paris" } },
    {
      "kind": "condition",
      "branch": { "condition": "opened_previous" },
      "yes": [{ "kind": "action", "action": { "type": "add_tag", "tag": "engaged" } }],
      "no": [{ "kind": "email", "subject": "Second try", "contentBlocks": [] }]
    }
  ]
}
```

Field rules:

- `trigger`: `manual`, `contact_created`, `tag_added`, `affiliate_customer_created`, `capture_page_submitted`, `api_request`.
- `status`: `draft`, `active`, `paused`.
- `kind`: `email` (needs `subject` + non-empty `contentBlocks`), `delay`, `condition` (needs `branch`), `action` (needs `action`).
- `delayMs` waits a fixed duration; `waitUntil` instead waits for the next `hour` (0-23), optionally on `dayOfWeek` (0 = Sunday).
- `branch.condition`: `opened_previous`, `clicked_previous`, `has_tag` (needs `tag`), `day_of_week` (needs `dayOfWeek`).
- `action.type`: `add_tag` / `remove_tag` (both need `tag`), `unsubscribe`.
- `yes` / `no` are only valid on a `condition` step. Max 100 steps per workflow.

Errors point at the exact path, e.g. `steps[3].no[0].action.tag is required for "add_tag"`.

#### Typical agent flow

```bash
growth-cli workflows create --file onboarding.json --json   # returns workflow.id
growth-cli workflows get <id> --export > onboarding.json    # edit round-trip
growth-cli workflows update <id> --file onboarding.json --json
growth-cli workflows publish <id> --json
```

`update` replaces the whole step tree. Contacts mid-flow stay at their step
position, so the response reports `activeEnrollments` when any are affected.
Use `publish` / `pause` (a PATCH of `status` only) when you do not want to
touch steps.

### transactional (alias `tx`)

| Command | Effect |
| --- | --- |
| `growth-cli transactional list` | Templates available in the organization |
| `growth-cli transactional send <slug> --email <e> [--var k=v] [--tags a,b]` | Send one transactional email |

`--var` fills the template's `@{variable}` placeholders. `--tags` are merged onto the contact, never replaced.

### affiliate

| Command | Effect |
| --- | --- |
| `growth-cli affiliate click --ref <code>` | Record a referral click |
| `growth-cli affiliate signup --ref <code> --email <e>` | Record a referred signup |
| `growth-cli affiliate payment --email <e> --amount <n>` | Record a payment for commission |

## Output Format

`--json` returns a standardized envelope:
```json
{ "ok": true, "data": { ... }, "meta": { "total": 42 } }
```

On error: `{ "ok": false, "error": { "message": "...", "status": 401 } }`

## Quick Reference

```bash
growth-cli --help                    # List all resources and global flags
growth-cli <resource> --help         # List all actions for a resource
growth-cli <resource> <action> --help # Show flags for a specific action
```

## Global Flags

All commands support: `--json`, `--format <text|json|csv|yaml>`, `--verbose`, `--no-color`, `--no-header`

Exit codes: 0 = success, 1 = API error, 2 = usage error
