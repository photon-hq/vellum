/**
 * A sample user.
 *
 * @example
 * ```ts
 * const u: User = { id: "1", name: "Ada" };
 * ```
 */
export interface User {
  /** Unique identifier. */
  id: string
  /** Display name. */
  name: string
  /** Optional email. */
  email?: string
}

/**
 * Supported roles.
 */
export type Role = 'admin' | 'viewer'

/**
 * Maximum page size.
 */
export const MAX_PAGE_SIZE = 100

/**
 * App version string.
 */
export const VERSION = '1.0.0'

/**
 * Fetch a user by id.
 *
 * @param id - The user id.
 * @returns The user or null.
 */
export function getUser(id: string): User | null {
  void id
  return null
}

/**
 * Status codes.
 */
export enum Status {
  /** Everything is fine. */
  Ok = 'ok',
  /** Something went wrong. */
  Error = 'error',
}
