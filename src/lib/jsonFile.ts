import { readFileSync } from "node:fs";
import { CliError } from "./errors.js";

/**
 * Reads a JSON authoring document from a file, or from stdin when path is "-".
 * Shared by the `--file` flags of `workflows` and `transactional`.
 */
export const readJsonDocument = (path: string): Record<string, unknown> => {
  let raw: string;
  try {
    raw = readFileSync(path === "-" ? 0 : path, "utf8");
  } catch (err) {
    throw new CliError(400, `Cannot read ${path}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CliError(
      400,
      `${path} is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(400, `${path} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
};
