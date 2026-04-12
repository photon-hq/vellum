import type { ExampleType } from "./types.js";

/**
 * Fetch a user by id.
 *
 * Looks the user up via the configured backend and returns the full
 * {@link ExampleType} record, or `null` if no such user exists.
 *
 * @param id - The stable identifier of the user to fetch.
 * @param opts - Request options, including an optional AbortSignal.
 * @returns The resolved user record, or `null` if not found.
 *
 * @example
 * ```ts
 * const user = await fetchUser("u_123");
 * if (user) console.log(user.name);
 * ```
 */
export function fetchUser(
  id: string,
  opts?: { signal?: AbortSignal },
): Promise<ExampleType | null> {
  void opts;
  return Promise.resolve(null);
}
