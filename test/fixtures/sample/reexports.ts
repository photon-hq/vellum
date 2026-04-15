/** Helper used internally and re-exported via `export { }`. */
interface Config {
  debug: boolean
}

/** Internal-only, not re-exported. */
interface Secret {
  key: string
}

/** A class re-exported as default. */
class AppRunner {
  start(): void {}
}

/** A compound expression — should not be a string literal. */
const GREETING = 'hello' + ' ' + 'world'

export { Config }
export { Config as AliasedConfig }
export default AppRunner
