/**
 * A user record as returned by the API.
 *
 * @example
 * ```ts
 * const u: ExampleType = { id: "1", name: "ada", email: "ada@example.com" };
 * ```
 */
export interface ExampleType {
  /** Stable identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Primary contact email. */
  email: string;
  /** Whether the account has been verified. */
  verified?: boolean;
}

/**
 * Supported authentication methods.
 */
export type AuthMethod = "password" | "oauth" | "sso";
