import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { TypeScriptExtractor } from '../src'

const FIXTURES = resolve(__dirname, '../../../test/fixtures/sample')

/**
 * Run `tsc --declaration --emitDeclarationOnly` against a file and return a
 * map of { declName → canonical declaration text } - the ground truth that
 * our extractor's `Symbol.signature` should agree with.
 */
function tscDeclarations(filePath: string): Map<string, string> {
  const program = ts.createProgram({
    rootNames: [filePath],
    options: {
      declaration: true,
      emitDeclarationOnly: true,
      removeComments: true,
      noEmitOnError: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  })

  let dtsText = ''
  program.emit(
    program.getSourceFile(filePath),
    (_name, text) => { dtsText = text },
    undefined,
    true,
  )

  const dts = ts.createSourceFile('out.d.ts', dtsText, ts.ScriptTarget.Latest, false)
  const printer = ts.createPrinter({ removeComments: true, omitTrailingSemicolon: false })

  const map = new Map<string, string>()
  for (const stmt of dts.statements) {
    const name = declarationName(stmt)
    if (!name)
      continue
    map.set(name, printer.printNode(ts.EmitHint.Unspecified, stmt, dts))
  }
  return map
}

function declarationName(node: ts.Node): string | null {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node))
    return node.name?.text ?? null
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0]
    return first && ts.isIdentifier(first.name) ? first.name.text : null
  }
  return null
}

/**
 * Collapse comments, modifiers, whitespace, and known-benign differences
 * between our extractor and `tsc --declaration` output:
 *   - quote style: `'x'` and `"x"` are equivalent
 *   - private member erasure: tsc emits `private name;`, we emit the full
 *     signature `private name(): T;` - collapse both to `private name`, since
 *     exposing private shape in docs is intentional on our side.
 */
function normalize(s: string): string {
  return s
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\b(?:export|declare)\s+/g, '')
    .replace(/"/g, '\'')
    .replace(/(private\s+\w+)\s*\([^)]*\)(?:\s*:[^;]+)?/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('canonical signature contract', () => {
  const extractor = new TypeScriptExtractor()

  it('matches `tsc --declaration` for interfaces, type aliases, enums, and functions', async () => {
    const file = resolve(FIXTURES, 'types.ts')
    const symbols = await extractor.extract({
      files: [file],
      root: FIXTURES,
      config: undefined,
    })
    const tsc = tscDeclarations(file)

    // Structural kinds that `tsc --declaration` emits the same way we do.
    // `const` is skipped: tsc uses `declare const X: <inferred literal>` while
    // our extractor produces `const X = <value>` - intentional schema choice.
    const kinds = new Set(['interface', 'type', 'enum', 'function', 'class'])

    const checked: string[] = []
    for (const sym of symbols) {
      if (!kinds.has(sym.kind) || !sym.exported)
        continue
      const expected = tsc.get(sym.name)
      expect(expected, `tsc emitted no declaration for ${sym.name}`).toBeTruthy()
      expect(
        normalize(sym.signature),
        `signature drift for ${sym.name}\n  ours: ${sym.signature}\n  tsc:  ${expected}`,
      ).toBe(normalize(expected!))
      checked.push(sym.name)
    }

    expect(checked).toEqual(expect.arrayContaining(['User', 'Role', 'Status', 'getUser']))
  })

  it('matches `tsc --declaration` for class headers and member names', async () => {
    // Class bodies have additional known divergences we don't normalize out:
    //   - property initializers (`running = false`) vs inferred types
    //     (`running: boolean`) - we keep source, tsc resolves via checker.
    // So for classes we compare the HEADER (class keyword + name + heritage)
    // and the SET of top-level member names, which catches structural drift
    // without tripping on initializer/type cosmetics.
    const file = resolve(FIXTURES, 'classes.ts')
    const symbols = await extractor.extract({
      files: [file],
      root: FIXTURES,
      config: undefined,
    })
    const tsc = tscDeclarations(file)

    const classes = symbols.filter(s => s.kind === 'class' && s.exported)
    expect(classes.length).toBeGreaterThan(0)
    for (const sym of classes) {
      const expected = tsc.get(sym.name)
      expect(expected, `tsc emitted no declaration for ${sym.name}`).toBeTruthy()

      expect(classHeader(sym.signature), `header drift for ${sym.name}`)
        .toBe(classHeader(expected!))
      expect(memberNames(sym.signature), `member-name drift for ${sym.name}`)
        .toEqual(memberNames(expected!))
    }
  })
})

function classHeader(decl: string): string {
  const openBrace = decl.indexOf('{')
  const head = openBrace === -1 ? decl : decl.slice(0, openBrace)
  return head
    .replace(/\b(?:export|declare)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function memberNames(decl: string): string[] {
  const open = decl.indexOf('{')
  const close = decl.lastIndexOf('}')
  if (open === -1 || close === -1)
    return []
  const body = decl.slice(open + 1, close)
  const names: string[] = []
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line)
      continue
    const m = /^(?:(?:public|protected|private|readonly|static|abstract)\s+)*(constructor|[A-Z_a-z]\w*)/.exec(line)
    if (m)
      names.push(m[1]!)
  }
  return names.sort()
}
