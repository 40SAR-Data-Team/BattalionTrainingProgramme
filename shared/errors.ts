/** An error whose message is written for the user and safe to show in the browser. */
export class UserError extends Error {}

/** Shown in place of any error that is not a UserError (driver, Google or bug messages can reveal internals). */
export const GENERIC_ERROR = "Something went wrong. Try again, or ask an admin to check the server logs.";

/**
 * Message safe to send to the browser for a caught error.
 *
 * Args:
 *   err: Anything thrown.
 *
 * Returns:
 *   A UserError's own message; otherwise GENERIC_ERROR, with the details written to the server log.
 */
export function publicMessage(err: unknown): string {
  if (err instanceof UserError) return err.message;
  console.error(err);
  return GENERIC_ERROR;
}
