import type { CreatePostInput, Page, Post, User } from '../types.js'

/**
 * Fetch a user by id.
 *
 * Returns `null` if no user with that id exists. Callers should handle
 * the `null` case - a missing user is not an error condition.
 *
 * @param id - Stable {@link User} identifier.
 * @param opts - Optional request options.
 * @returns The resolved {@link User}, or `null` if not found.
 *
 * @example
 * ```ts
 * const user = await getUser("u_01HQ8");
 * if (user) console.log(user.name);
 * ```
 */
export async function getUser(
  id: string,
  opts?: { signal?: AbortSignal },
): Promise<User | null> {
  void id
  void opts
  return null
}

/**
 * List published posts in reverse-chronological order.
 *
 * Only posts with `status: "published"` are returned. Drafts and archived
 * posts require calling {@link listPostsByAuthor} with the author's own id.
 *
 * @param params - Pagination parameters.
 * @returns A page of posts and a cursor for the next page.
 *
 * @example
 * ```ts
 * let cursor: string | null = null;
 * do {
 *   const page = await listPosts({ limit: 20, cursor });
 *   for (const post of page.items) console.log(post.title);
 *   cursor = page.nextCursor;
 * } while (cursor);
 * ```
 */
export async function listPosts(params: {
  /** Maximum items per page. */
  limit?: number
  /** Cursor from a previous page's `nextCursor`. */
  cursor?: string | null
}): Promise<Page<Post>> {
  void params
  return { items: [], nextCursor: null, total: 0 }
}

/**
 * List all posts authored by a specific user, including drafts.
 *
 * @param authorId - The {@link User.id} of the author.
 * @param params - Pagination parameters.
 */
export async function listPostsByAuthor(
  authorId: string,
  params: { limit?: number, cursor?: string | null },
): Promise<Page<Post>> {
  void authorId
  void params
  return { items: [], nextCursor: null, total: 0 }
}

/**
 * Create a new draft post on behalf of the currently authenticated user.
 *
 * @param input - The post contents.
 * @returns The created {@link Post}, with server-assigned fields populated.
 * @throws If the slug already exists for this author.
 */
export async function createPost(input: CreatePostInput): Promise<Post> {
  void input
  throw new Error('not implemented')
}
