/** A multi-line union type — source spans lines so TypeString.oneline
 * should be populated with the collapsed form. */
export type Dir =
  | 'north'
  | 'south'
  | 'east'
  | 'west'

/** Single-line type — oneline should be absent since text has no
 * whitespace runs to collapse. */
export type Flag = 'on' | 'off'
