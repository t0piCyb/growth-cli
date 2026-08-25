import { CliError } from "./errors.js";

/**
 * An organization signs its emails with a shared `snippet` block. Writing a
 * sign-off at the end of the markdown *and* keeping that block is the
 * duplicate seen in the inbox — "Pilou, cofondateur d'amencolors.com"
 * immediately followed by the snippet's "Blandine et Pilou, fondateurs de
 * amencolors.com".
 *
 * The API exposes no snippets endpoint, so the CLI cannot read what a snippet
 * actually says; it refuses the pairing instead, and `--allow-signature`
 * overrides when the snippet is not a signature.
 */

/** Attribution wording — the half a signature snippet repeats. */
const ATTRIBUTION_RE =
  /\b(co-?fondateur|co-?fondatrice|fondateur|fondatrice|co-?founder|founder|ceo|cto|president)s?\b|\bl'[eé]quipe\b|\bthe\b.{0,24}\bteam\b/i;

/** Markdown decoration removed, so `**Pilou**, _fondateur_` still matches. */
const plain = (line: string) =>
  line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>#]/g, "")
    .trim();

/** A short trailing line naming a role, not a sentence of prose. */
const isAttributionLine = (line: string) => {
  const text = plain(line);
  if (!text || text.length > 120) return false;
  if (text.split(/\s+/).length > 12) return false;
  return ATTRIBUTION_RE.test(text);
};

const markdownOf = (block: any): string | null =>
  block?.type === "text" && typeof block?.props?.markdown === "string"
    ? block.props.markdown
    : null;

/**
 * The offending line in one `contentBlocks` array, or null. Only the last two
 * lines of the last text block before the snippet are considered — a
 * "fondateur" mentioned mid-body is prose, not a signature.
 *
 * The *last* snippet is the signing one: workflow emails open with a header
 * snippet and close with the signature, so anchoring on the first found no body
 * text at all and cleared every one of them.
 */
const findDuplicateSignature = (blocks: unknown): string | null => {
  if (!Array.isArray(blocks)) return null;

  const signsAt = blocks.map((b: any) => b?.type).lastIndexOf("snippet");
  if (signsAt < 0) return null;

  const body = blocks
    .slice(0, signsAt)
    .map(markdownOf)
    .filter((markdown): markdown is string => markdown !== null)
    .at(-1);
  if (!body) return null;

  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(-2).find(isAttributionLine) ?? null;
};

/**
 * Collects offenders anywhere in an authoring document: a campaign carries one
 * `contentBlocks` at the root, a workflow one per email step nested in
 * `steps` / `yes` / `no`.
 */
const collect = (node: unknown, found: string[]): void => {
  if (Array.isArray(node)) {
    for (const entry of node) collect(entry, found);
    return;
  }
  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (key === "contentBlocks") {
      const line = findDuplicateSignature(value);
      if (line) found.push(line);
      continue;
    }
    collect(value, found);
  }
};

/** Throws when a document signs off in the markdown next to a snippet block. */
export const assertNoDuplicateSignature = <T>(doc: T, allow = false): T => {
  if (allow) return doc;

  const found: string[] = [];
  collect(doc, found);
  if (found.length === 0) return doc;

  const quoted = found.map((line) => `"${plain(line)}"`).join(", ");
  throw new CliError(
    400,
    `Signature written twice: ${quoted} sits right before a snippet block that already signs the email`,
    "Drop the sign-off line from the markdown and let the snippet sign, or pass --allow-signature when that snippet is not a signature.",
  );
};
