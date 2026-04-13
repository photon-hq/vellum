import type { SymbolIndex } from '@vellum-docs/core'
import { findConfig, InMemoryCache, InMemorySymbolIndex, loadConfig, Vellum } from '@vellum-docs/core'

export class SymbolManager {
  private vellum: Vellum | null = null
  private _index: InMemorySymbolIndex = new InMemorySymbolIndex()
  private _ready = false
  private _configRoot: string | null = null

  get index(): SymbolIndex {
    return this._index
  }

  get ready(): boolean {
    return this._ready
  }

  get configRoot(): string | null {
    return this._configRoot
  }

  async initialize(workspaceRoot: string): Promise<{ symbolCount: number } | { error: string }> {
    const configPath = findConfig(workspaceRoot)
    if (!configPath) {
      return { error: `No vellum config found in ${workspaceRoot}` }
    }

    try {
      const config = await loadConfig(configPath)
      if (!config.root)
        config.root = workspaceRoot

      this._configRoot = config.root
      this._index = new InMemorySymbolIndex()

      this.vellum = new Vellum({
        ...config,
        index: this._index,
        cache: new InMemoryCache(),
      })

      const symbolCount = await this.vellum.extractAll()
      this._ready = true
      return { symbolCount }
    }
    catch (err) {
      return { error: `Failed to load config: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  async reindex(): Promise<number> {
    if (!this.vellum)
      return 0

    this._index.clear()
    const count = await this.vellum.extractAll()
    return count
  }

  async reload(workspaceRoot: string): Promise<{ symbolCount: number } | { error: string }> {
    this._ready = false
    this.vellum = null
    this._index = new InMemorySymbolIndex()
    return this.initialize(workspaceRoot)
  }
}
