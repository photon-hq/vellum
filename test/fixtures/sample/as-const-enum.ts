/**
 * Message effects - the `as const` enum pattern.
 */
export const MessageEffect = {
  /** A slam effect. */
  slam: 'com.apple.MobileSMS.expressivesend.impact',
  /** A loud effect. */
  loud: 'com.apple.MobileSMS.expressivesend.loud',
  /** A confetti effect. */
  confetti: 'com.apple.messages.effect.CKConfettiEffect',
} as const

export type MessageEffect = (typeof MessageEffect)[keyof typeof MessageEffect]

/** A regular config - no `as const`, values widen to primitives. */
export const CONFIG = { timeout: 5000, retries: 3 }

/** A mixed object - has a non-literal value, should stay a const. */
export const MIXED = { label: 'hi', handler: () => 1 } as const

/** A numeric `as const` enum. */
export const Code = {
  Ok: 200,
  NotFound: 404,
} as const

export type Code = (typeof Code)[keyof typeof Code]
