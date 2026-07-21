# growth-cli

CLI for the Growth public API. Made with [api2cli.dev](https://api2cli.dev).

## Install

```bash
npx api2cli install t0piCyb/growth-cli
```

This clones the repo, builds the CLI, links it to your PATH, and installs the AgentSkill to your coding agents.

## Install AgentSkill only

```bash
npx skills add t0piCyb/growth-cli
```

## Usage

```bash
growth-cli auth set nsk_xxx --profile my-org
growth-cli auth test
growth-cli org show
growth-cli contacts list
growth-cli contacts identify --email user@example.com --first-name Jane --tags newsletter
growth-cli tags add user@example.com vip
growth-cli workflows list
growth-cli workflows trigger <workflow-id> --email user@example.com
```

## Resources

```bash
growth-cli org show
growth-cli members list
growth-cli members get <member-id>

growth-cli contacts list [--status subscribed] [--tag newsletter] [--limit 50] [--cursor <cursor>]
growth-cli contacts get <email>
growth-cli contacts identify --email <email> [--tags a,b] [--remove-tags c] [--field plan=pro]
growth-cli contacts create --email <email> [--first-name <name>] [--last-name <name>] [--tags a,b] [--field plan=pro]
growth-cli contacts update <email> [--email <new-email>] [--first-name <name>] [--last-name <name>] [--field plan=pro]
growth-cli contacts sync --email <email> --event-key <key> --event-type purchase_paid --event-source stripe
growth-cli contacts unsubscribe <email>
growth-cli contacts delete <email>

growth-cli tags list
growth-cli tags add <email> --tags a,b
growth-cli tags remove <email> --tags a,b

growth-cli workflows list [--status active] [--trigger all]
growth-cli workflows get <workflow-id> [--export]
growth-cli workflows create --file <path>
growth-cli workflows update <workflow-id> --file <path>
growth-cli workflows publish|pause|unpublish <workflow-id>
growth-cli workflows delete <workflow-id> [--force]
growth-cli workflows trigger <workflow-id> --email <email> [--tags a,b]

growth-cli transactional list
growth-cli transactional send <slug> --email <email> [--var firstName=Jane] [--tags a,b]

growth-cli affiliate click --ref <ref>
growth-cli affiliate signup --customer-key <key> [--ref <ref>]
growth-cli affiliate payment --customer-key <key> [--amount 4900 --currency usd --source-id invoice_123]
```

## Writing contacts: identify vs create

`identify` creates the contact when missing, **adds** tags without dropping the
ones another integration wrote, and **merges** custom fields. `create` replaces
the whole tag set and the whole custom-field record — calling it on signup
silently wipes tags written by an earlier freebie or purchase flow.

Use `identify` for app-side events. Use `create` only when the payload is the
complete truth about that contact. `tags add` is additive too, but returns 404
when the contact does not exist yet.

`contacts sync` applies the same merge as `identify` and additionally records a
deduplicated lifecycle event (`--event-key` makes a replay a no-op) with
consent tracking.

`contacts delete` is an alias for unsubscribe: Growth has no hard delete, so
send and event history is preserved.

## Profiles

An API key is scoped to one organization. Store one profile per org and switch
between them:

```bash
growth-cli auth set nsk_aaa --profile org-a    # first profile becomes active
growth-cli auth set nsk_bbb --profile org-b
growth-cli auth list                           # "*" marks the active profile
growth-cli auth use org-b                      # switch, persists across runs
growth-cli --profile org-a workflows list      # one-shot override
```

Resolution order: `--profile` flag > `GROWTH_PROFILE` > active profile saved by
`auth use` > `default`.

Tokens live in `~/.config/tokens/growth-cli-<profile>.txt` (chmod 600); the
active profile and cached org labels in `~/.config/growth-cli/state.json`.

`GROWTH_API_KEY`, if set, overrides every profile and `--profile` is ignored.
`auth list` warns when it is present. Use it only in CI, for a single org.

## Authoring workflows

`workflows create` / `update` take a JSON document where a `condition` step
carries its own `yes` / `no` child arrays:

```json
{
  "name": "Onboarding",
  "trigger": "tag_added",
  "triggerTags": ["signup"],
  "steps": [
    {
      "kind": "email",
      "subject": "Welcome",
      "contentBlocks": [{ "type": "text", "props": { "markdown": "Hi" } }]
    },
    { "kind": "delay", "delayMs": 86400000 },
    {
      "kind": "condition",
      "branch": { "condition": "opened_previous" },
      "yes": [{ "kind": "action", "action": { "type": "add_tag", "tag": "engaged" } }],
      "no": [{ "kind": "email", "subject": "Second try", "contentBlocks": [] }]
    }
  ]
}
```

The API renumbers steps in tree order on save. `workflows get <id> --export`
prints that same nested shape, so an existing workflow round-trips: export,
edit, `update --file`. See `skills/growth-cli/SKILL.md` for the full field
reference.

`update` replaces the whole step tree; use `publish` / `pause` when you only
want to change the status.

## Environment overrides

```bash
GROWTH_API_KEY=nsk_... growth-cli org show
GROWTH_API_URL=http://localhost:3050/api/v1 growth-cli contacts list
GROWTH_PROFILE=org-a growth-cli workflows list
```

## Global Flags

All commands support: `--json`, `--format <text|json|csv|yaml>`, `--verbose`, `--no-color`, `--no-header`
