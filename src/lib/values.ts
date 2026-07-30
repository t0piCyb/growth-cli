import { CliError } from "./errors.js";

/** Comma-separated flag value to a trimmed list. */
export const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * A date flag as epoch milliseconds. Accepts an ISO 8601 string
 * ("2026-08-01T09:00") or a raw millisecond timestamp.
 */
export const parseDate = (value: string, flag: string) => {
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && String(asNumber) === value.trim()) {
    return asNumber;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new CliError(400, `${flag} must be an ISO date or a ms timestamp`);
  }
  return parsed;
};

export const parseNumber = (value: string, flag: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliError(400, `${flag} must be a number`);
  }
  return parsed;
};
