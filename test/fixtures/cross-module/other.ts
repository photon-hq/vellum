/** A different User in another module — same name, different file. */
export interface User {
  email: string
}

/** Returns the other User. */
export function getOtherUser(): User {
  return { email: 'test@example.com' }
}
