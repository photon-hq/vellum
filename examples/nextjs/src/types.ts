/**
 * A user account in the system.
 *
 * Users are identified by a stable `id` that never changes, even if the
 * display name or email is updated later. External integrations should
 * always key off `id`, never `email`.
 *
 * @example
 * ```ts
 * const user: User = {
 *   id: "u_01HQ8",
 *   name: "Ada Lovelace",
 *   email: "ada@example.com",
 *   role: "admin",
 *   createdAt: new Date(),
 * };
 * ```
 */
export interface User {
  /** Stable identifier. Opaque - do not parse. */
  id: string
  /** Display name shown in the UI. */
  name: string
  /** Primary contact email. Must be unique across the system. */
  email: string
  /** Access level for authorization checks. */
  role: UserRole
  /** When the account was created. */
  createdAt: Date
  /** Whether the email has been verified via the sign-up flow. */
  verified?: boolean
}

/**
 * A blog post authored by a {@link User}.
 *
 * Posts go through a `draft → published → archived` lifecycle. Only
 * `published` posts are visible to non-authors.
 */
export interface Post {
  /** Stable identifier. */
  id: string
  /** Short URL-friendly identifier. Unique within the author's posts. */
  slug: string
  /** Post title. */
  title: string
  /** Markdown body. */
  body: string
  /** Author - references {@link User} by id. */
  authorId: string
  /** Current lifecycle state. */
  status: PostStatus
  /** When the post was created. */
  createdAt: Date
  /** When the post was most recently updated, or `null` if never edited. */
  updatedAt: Date | null
}

/**
 * Input for creating a new post. The server fills in `id`, `createdAt`,
 * and the initial `status` (always `"draft"`).
 */
export interface CreatePostInput {
  /** URL-friendly identifier; must be unique within the author's posts. */
  slug: string
  /** Post title. */
  title: string
  /** Markdown body. */
  body: string
}

/**
 * Access levels available to a {@link User}.
 */
export type UserRole = 'admin' | 'author' | 'reader'

/**
 * Lifecycle states for a {@link Post}.
 */
export type PostStatus = 'draft' | 'published' | 'archived'

/**
 * Generic paginated response envelope returned by list endpoints.
 *
 * @example
 * ```ts
 * const page: Page<Post> = await listPosts({ limit: 20 });
 * for (const post of page.items) console.log(post.title);
 * ```
 */
export interface Page<T> {
  /** The items in this page. */
  items: T[]
  /** Cursor to request the next page, or `null` if this is the last page. */
  nextCursor: string | null
  /** Total number of items across all pages, if known. */
  total: number | null
}
