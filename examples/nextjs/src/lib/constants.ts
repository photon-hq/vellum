/**
 * Current API version. Bumped on breaking schema changes.
 */
export const API_VERSION = "2026-04";

/**
 * Base URL of the public API.
 */
export const API_BASE_URL = "https://api.example.com";

/**
 * Maximum number of posts returned in a single page.
 */
export const MAX_POSTS_PER_PAGE = 50;

/**
 * Default number of posts returned when no `limit` is specified.
 */
export const DEFAULT_POSTS_PER_PAGE = 20;

/**
 * Number of retry attempts before giving up on a transient network failure.
 */
export const MAX_RETRIES = 3;

/**
 * Request timeout for server-side data fetches, in milliseconds.
 */
export const FETCH_TIMEOUT_MS = 10_000;
