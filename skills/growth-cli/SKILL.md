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
- Manages sending providers, sender identities and per-stream routing.
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

### campaigns

| Command | Effect |
| --- | --- |
| `growth-cli campaigns list [--status <s>] [--limit <n>]` | List campaigns, newest first |
| `growth-cli campaigns get <id> [--export]` | Show one; `--export` prints the authoring JSON |
| `growth-cli campaigns create --name <n> --subject <s> --markdown <path> [--tags a,b]` | Create a draft from a markdown body |
| `growth-cli campaigns create --file <path>` | Create from a JSON document (`-` reads stdin) |
| `growth-cli campaigns update <id> [--file <p>\|flags]` | Patch a draft or scheduled campaign |
| `growth-cli campaigns schedule <id> --at <iso\|ms>` | Book a future send |
| `growth-cli campaigns unschedule <id>` | Back to draft |
| `growth-cli campaigns send <id> [--test <email>]` | **Sends for real** unless `--test` is passed |
| `growth-cli campaigns archive\|restore <id>` | Flip the archive flag |
| `growth-cli campaigns analytics <id>` | Delivery, engagement and top links |
| `growth-cli campaigns recipients <id> [--cursor <c>] [--limit <n>]` | Who got it and what they did |

`--markdown` wraps the file in one `{ "type": "text", "props": { "markdown": ... } }`
block. For anything richer (headings, buttons, images, surveys) author the
`contentBlocks` array in a JSON document and pass `--file`; `get --export`
prints exactly that shape, so a campaign round-trips.

```bash
growth-cli campaigns create --name "August" --subject "What shipped" \
  --markdown body.md --tags customers --json          # returns campaign.id
growth-cli campaigns send <id> --test me@example.com   # preview first
growth-cli campaigns schedule <id> --at 2026-08-01T09:00
```

`update` is rejected once a campaign is sending or sent. `send` without
`--test` mails every subscribed contact matching the audience — there is no
undo.

#### Never write the signature

The organization signs its emails with a shared `snippet` block. **Stop the
body at the valediction** — "Bonne fin d'été," — and let the snippet supply the
names; a sign-off in the markdown lands right on top of the snippet's, and the
reader sees the founders twice in a row.

```jsonc
// ❌ the inbox shows "Pilou, cofondateur…" then "Blandine et Pilou, fondateurs…"
{ "type": "text", "props": { "markdown": "Bonne fin d'été,\n\nPilou, cofondateur d'amencolors.com" } },
{ "type": "snippet", "props": { "snippetId": "nh72..." } }

// ✅
{ "type": "text", "props": { "markdown": "Bonne fin d'été," } },
{ "type": "snippet", "props": { "snippetId": "nh72..." } }
```

`campaigns`, `workflows` and `transactional` `create` / `update` refuse a
document that pairs the two and name the offending line. Pass
`--allow-signature` only when that snippet block is genuinely not a signature.
The API has no snippets endpoint, so the check reads the wording, not the
snippet — open the snippet in the web editor when you need to know what it says.

### surveys

| Command | Effect |
| --- | --- |
| `growth-cli surveys list` | Surveys with response counters |
| `growth-cli surveys get <id>` | One survey with its average score |
| `growth-cli surveys create --type <nps\|rating\|yesno\|choice> [--question <q>] [--options a,b]` | Create a survey |
| `growth-cli surveys responses <id> [--cursor <c>] [--limit <n>]` | Individual answers, newest first |
| `growth-cli surveys archive\|restore <id>` | Hide or unhide it in the results page |

`create` returns a `surveyId` to reference from a `survey` content block:
`{ "type": "survey", "props": { "surveyId": "j92...", "question": "..." } }`.
The wording on the block wins and is mirrored back onto the survey on save.

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

### events

Fire what happened and let the organization's routes pick the workflow, instead
of pinning a workflow id in the caller. Routing reads the contact's **merged**
profile, so an event carrying no attribution (a payment webhook) still routes on
the `utm_campaign` written on that contact weeks earlier.

| Command | Effect |
| --- | --- |
| `growth-cli events trigger <event> --email <e> [--tags a,b] [--field k=v]` | Fire an event; prints `enrolled`, `reason`, the workflow and how it matched |
| `growth-cli events routes list [--event <e>]` | Routes in resolution order |
| `growth-cli events routes set <event> --workflow <id> [--key <f> --value <v>] [--priority <n>] [--status active\|paused] [--id <routeId>]` | Create or update; omit `--key/--value` for the event default |
| `growth-cli events routes rm <route-id>` | Delete a route |

`events trigger` returns **200 even when nothing was enrolled** — the contact was
merged either way. Read `enrolled` and `reason`; `no_route` means the event has
no route at all, and nothing else will tell you.

Rules are always tried before the event default, highest `priority` first, and a
default never shadows a rule. A routed workflow must use the `api_request`
trigger — `routes set` refuses at save time otherwise.

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

`growth-cli workflows exclude-tags <id> --tags customer` patches only the
trigger rules. Exclude tags are checked on entry **and before every step**, so
a contact that gains one mid-flow leaves the workflow — that is how you stop
one sequence from selling to someone another sequence already converted. Use
this instead of wrapping every email in a `has_tag` condition.

### transactional (alias `tx`)

| Command | Effect |
| --- | --- |
| `growth-cli transactional list` | Active definitions in the organization |
| `growth-cli transactional get <slug> [--export]` | One definition, content included |
| `growth-cli transactional create --file <path>` | Create from a JSON document |
| `growth-cli transactional update <slug> --file <path>` | Patch the keys present in the file |
| `growth-cli transactional archive\|restore <slug>` | Flip the status |
| `growth-cli transactional send <slug> --email <e> [--var k=v] [--tags a,b]` | Send one transactional email |

`--var` fills the template's `@{variable}` placeholders. `--tags` are merged onto the contact, never replaced.

One JSON document carries the definition **and** its email content — the
two-row storage (definition + bound template) is invisible from the API:

```json
{
  "slug": "freebie-kit",
  "name": "Freebie kit delivery",
  "subject": "Your kit has arrived",
  "previewText": "Print it before Sunday",
  "status": "active",
  "contentBlocks": [
    { "type": "snippet", "props": { "snippetId": "nh79..." } },
    { "type": "text", "props": { "markdown": "Hi @{firstName|there}," } },
    { "type": "button", "props": { "label": "Download", "url": "@{kitLink|https://example.com/}", "align": "center", "backgroundColor": "#2563eb" } }
  ]
}
```

`get --export` prints exactly that shape, so a transactional round-trips:
export, edit, `update`. `update` writes only the keys present in the file.
Placeholders resolve inside a button's `url` too, so a per-recipient link can
be passed at send time through `--var`.

`list` returns only `active` definitions; read an archived one with `get`.

### affiliate (tracking events)

| Command | Effect |
| --- | --- |
| `growth-cli affiliate click --ref <code>` | Record a referral click |
| `growth-cli affiliate signup --ref <code> --email <e>` | Record a referred signup |
| `growth-cli affiliate payment --email <e> --amount <n>` | Record a payment for commission |

### affiliates (alias `partners`)

| Command | Effect |
| --- | --- |
| `growth-cli affiliates list [--status <s>] [--limit <n>]` | Partners with their rollups |
| `growth-cli affiliates get <id>` | One partner and its program |
| `growth-cli affiliates create --name <n> --email <e> [--code <c>] [--target-url <u>]` | Create + email the invite |
| `growth-cli affiliates activate\|pause <id>` | Change status |
| `growth-cli affiliates payout <id>` | **Moves money**: transfers approved commissions via Stripe |
| `growth-cli affiliates stats` | Program totals |

### promo-codes (alias `promos`)

| Command | Effect |
| --- | --- |
| `growth-cli promo-codes list [--affiliate <id>]` | Codes with redemptions |
| `growth-cli promo-codes create --code <c> --percent <pct>\|--amount <minor> [--affiliate <id>]` | Create in Stripe + Growth |
| `growth-cli promo-codes update <id> [--expires-at <d>] [--max-redemptions <n>] [--clear-expiry] [--clear-limit]` | Edit deadline / limit |
| `growth-cli promo-codes pause\|activate <id>` | Flip the Stripe `active` flag |
| `growth-cli promo-codes sync [--limit <n>] [--starting-after <id>]` | Import codes created in Stripe |

Creating a code needs a connected Stripe account with charges enabled.
Editing the deadline or the limit archives the Stripe code and recreates it
(Stripe promotion codes are immutable); Growth carries redemptions over.

### commissions / payments / payouts

| Command | Effect |
| --- | --- |
| `growth-cli commissions list [--status <s>] [--affiliate <id>]` | Commissions, newest first |
| `growth-cli commissions approve <id>` | Make a pending commission payable |
| `growth-cli payments list [--affiliate <id>] [--cursor <c>]` | Collected payments, newest first |
| `growth-cli payments summary` | Rolling four-week totals |
| `growth-cli payouts list [--affiliate <id>]` | Transfers to partners |

Paying a partner is a two-step flow: `commissions approve <id>` for each
pending commission, then `affiliates payout <affiliateId>` to transfer them.
All amounts are in minor units (cents).

### providers / identities / routing

Who an organization's email is sent by, and which kind of email goes through
which sender.

| Command | Effect |
| --- | --- |
| `growth-cli providers list` | Provider accounts (SES, Resend, Brevo, SMTP) |
| `growth-cli providers test <id>` | Check credentials; for SES also quota, send rate, sandbox state |
| `growth-cli identities list` | Sender addresses bound to a provider account |
| `growth-cli identities create --provider <id> --from "Acme <hi@acme.com>" [--from-name <n>] [--reply-to <a>]` | Create or update an identity |
| `growth-cli identities delete <id>` | Delete an identity |
| `growth-cli routing show` | Current stream routing |
| `growth-cli routing set --default --identity <id>` | Set the default sender |
| `growth-cli routing set --stream <marketing\|transactional> --identity <id>` | Route one stream |
| `growth-cli routing set --stream <s> --clear` | Clear a route, falling back to the default |

```bash
# Point everything at one sender
growth-cli identities create --provider prov_123 --from "Acme <hello@acme.com>"
growth-cli routing show

# Split marketing and transactional
growth-cli identities create --provider prov_123 --from "Acme <news@acme.com>"
growth-cli routing set --stream marketing --identity ident_news
growth-cli routing set --stream transactional --identity ident_hello

# Before a big campaign: confirm SES is out of the sandbox and see the rate cap
growth-cli providers test prov_123 --json
```

Rules that matter:

- Provider accounts are created in the Growth UI. Credentials are **never**
  returned by the API or the CLI, not even masked — do not try to read them
  back.
- `identities create` is an upsert on the address, so it is safe to rerun from a
  provisioning script.
- The first identity created becomes the default route; an organization that
  only needs one sender needs no `routing set` at all.
- Routing resolves as: the stream's identity → the default identity → the
  platform sender. `system` email (sign-in links, platform alerts) is never
  routable and always leaves through the platform.
- A marketing unsubscribe does **not** block the `transactional` stream. Only a
  hard bounce or a complaint blocks everything.

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
