import type { ExtensionContext } from 'vscode'
import { workspace } from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath('../language-server/dist/server.mjs')

  client = new LanguageClient(
    'vellum',
    'Vellum Language Server',
    {
      run: { module: serverModule, transport: TransportKind.ipc },
      debug: { module: serverModule, transport: TransportKind.ipc },
    },
    {
      documentSelector: [{ language: 'vel' }],
      synchronize: {
        fileEvents: [
          workspace.createFileSystemWatcher('**/*.ts'),
          workspace.createFileSystemWatcher('**/*.tsx'),
          workspace.createFileSystemWatcher('**/vellum.config.*'),
        ],
      },
    },
  )

  client.start()
  context.subscriptions.push({ dispose: () => client?.stop() })
}

export function deactivate(): Promise<void> | undefined {
  return client?.stop()
}
