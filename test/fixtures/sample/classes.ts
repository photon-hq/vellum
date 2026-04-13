/**
 * Base service class.
 */
export class BaseService {
  /** Service name. */
  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  /** Start the service. */
  start(): void {}

  /** Stop the service. */
  protected stop(): void {}

  private cleanup(): void {}

  static create(name: string): BaseService {
    return new BaseService(name)
  }
}

/**
 * An extended service.
 */
export class ExtendedService extends BaseService {
  /** Whether the service is running. */
  running = false
}

/** Internal helper — not exported. */
class _InternalHelper {}
