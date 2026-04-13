#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  createConnection,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'
import { getCompletions } from './features/completion'
import { getDefinition } from './features/definition'
import { publishDiagnostics } from './features/diagnostics'
import { getHover } from './features/hover'
import { SymbolManager } from './symbol-manager'

const connection = createConnection()
const documents = new TextDocuments(TextDocument)
const manager = new SymbolManager()

let workspaceRoot: string | null = null
let reindexTimer: ReturnType<typeof setTimeout> | null = null

connection.onInitialize((params) => {
  workspaceRoot = params.rootUri
    ? fileURLToPath(params.rootUri)
    : params.rootPath ?? null

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['"', '\'', '.', '|', '#', ':', '{', ','],
      },
      hoverProvider: true,
      definitionProvider: true,
    },
  }
})

connection.onInitialized(async () => {
  if (!workspaceRoot)
    return

  connection.console.log('Vellum: Indexing symbols...')

  const result = await manager.initialize(workspaceRoot)
  if ('error' in result) {
    connection.console.error(`Vellum: ${result.error}`)
    return
  }

  connection.console.log(`Vellum: Indexed ${result.symbolCount} symbols`)

  // Register file watchers
  connection.client.register({
    id: 'vellum-file-watcher',
    method: 'workspace/didChangeWatchedFiles',
    registerOptions: {
      watchers: [
        { globPattern: '**/*.ts' },
        { globPattern: '**/*.tsx' },
        { globPattern: 'vellum.config.*' },
      ],
    },
  })

  // Publish initial diagnostics for open documents
  for (const doc of documents.all()) {
    publishDiagnostics(connection, doc, manager.index)
  }
})

// Re-extract when source files change (debounced)
connection.onDidChangeWatchedFiles(async (params) => {
  if (!workspaceRoot || !manager.ready)
    return

  const isConfigChange = params.changes.some(c =>
    c.uri.includes('vellum.config.'),
  )

  if (reindexTimer)
    clearTimeout(reindexTimer)

  reindexTimer = setTimeout(async () => {
    if (isConfigChange) {
      await manager.reload(workspaceRoot!)
    }
    else {
      await manager.reindex()
    }

    // Re-publish diagnostics for all open .vel documents
    for (const doc of documents.all()) {
      publishDiagnostics(connection, doc, manager.index)
    }
  }, 500)
})

// Diagnostics on document change
documents.onDidChangeContent((change) => {
  if (!manager.ready)
    return
  publishDiagnostics(connection, change.document, manager.index)
})

// Completions
connection.onCompletion((params) => {
  if (!manager.ready)
    return []
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []
  const offset = document.offsetAt(params.position)
  return getCompletions(document, offset, manager.index)
})

// Hover
connection.onHover((params) => {
  if (!manager.ready)
    return null
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null
  const offset = document.offsetAt(params.position)
  return getHover(document, offset, manager.index)
})

// Go-to-definition
connection.onDefinition((params) => {
  if (!manager.ready)
    return null
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null
  const offset = document.offsetAt(params.position)
  return getDefinition(document, offset, manager.index, manager.configRoot)
})

documents.listen(connection)
connection.listen()
