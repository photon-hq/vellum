import { describe, expect, it } from 'vitest'
import { nodeAtOffset, parseTemplate, resolveVariableType } from '../src/template-parser'

describe('parseTemplate', () => {
  it('parses symbol("...") calls', () => {
    const nodes = parseTemplate('{% set t = symbol("ts:src/types.ts#User") %}')
    const symbolCalls = nodes.filter(n => n.type === 'symbol')
    expect(symbolCalls).toHaveLength(1)
    expect(symbolCalls[0]!.id).toBe('ts:src/types.ts#User')
  })

  it('parses symbol() with single quotes', () => {
    const nodes = parseTemplate('{% set t = symbol(\'ts:m#Foo\') %}')
    const symbolCalls = nodes.filter(n => n.type === 'symbol')
    expect(symbolCalls).toHaveLength(1)
    expect(symbolCalls[0]!.id).toBe('ts:m#Foo')
  })

  it('parses symbols({...}) calls', () => {
    const nodes = parseTemplate('{% for c in symbols({ module: "src/api.ts", kind: "function" }) %}')
    const symbolsCalls = nodes.filter(n => n.type === 'symbols')
    expect(symbolsCalls).toHaveLength(1)
    expect(symbolsCalls[0]!.queryText).toContain('module')
    expect(symbolsCalls[0]!.queryText).toContain('function')
  })

  it('parses module("...") calls', () => {
    const nodes = parseTemplate('{% set m = module("src/types.ts") %}')
    const moduleCalls = nodes.filter(n => n.type === 'module')
    expect(moduleCalls).toHaveLength(1)
    expect(moduleCalls[0]!.path).toBe('src/types.ts')
  })

  it('parses set bindings with type inference', () => {
    const text = '{% set t = symbol("ts:m#Foo") %}{% set list = symbols({ module: "m" }) %}'
    const nodes = parseTemplate(text)
    const sets = nodes.filter(n => n.type === 'set')
    expect(sets).toHaveLength(2)
    expect(sets[0]!.name).toBe('t')
    expect(sets[0]!.valueType).toBe('symbol')
    expect(sets[1]!.name).toBe('list')
    expect(sets[1]!.valueType).toBe('symbols')
  })

  it('parses for bindings', () => {
    const text = '{% for item in symbols({ module: "m" }) %}{{ item.name }}{% endfor %}'
    const nodes = parseTemplate(text)
    const fors = nodes.filter(n => n.type === 'for')
    expect(fors).toHaveLength(1)
    expect(fors[0]!.name).toBe('item')
    expect(fors[0]!.iterableType).toBe('symbols')
  })

  it('parses for over members', () => {
    const text = '{% for m in t.members %}{{ m.name }}{% endfor %}'
    const nodes = parseTemplate(text)
    const fors = nodes.filter(n => n.type === 'for')
    expect(fors).toHaveLength(1)
    expect(fors[0]!.name).toBe('m')
    expect(fors[0]!.iterableType).toBe('members')
  })

  it('parses filter references', () => {
    const text = '{{ t | signature | safe }}'
    const nodes = parseTemplate(text)
    const filters = nodes.filter(n => n.type === 'filter')
    expect(filters).toHaveLength(2)
    expect(filters[0]!.name).toBe('signature')
    expect(filters[1]!.name).toBe('safe')
  })

  it('parses multiple constructs in a real template', () => {
    const text = `
{% set u = symbol("ts:src/types.ts#User") %}
## {{ u.name }}
{{ u.doc.summary }}
{% for m in u.members %}
- {{ m.name }}
{% endfor %}
{% for c in symbols({ module: "src/constants.ts", kind: "const" }) %}
| {{ c.name }} | {{ c.value.text }} |
{% endfor %}
`
    const nodes = parseTemplate(text)
    expect(nodes.filter(n => n.type === 'symbol')).toHaveLength(1)
    expect(nodes.filter(n => n.type === 'symbols')).toHaveLength(1)
    expect(nodes.filter(n => n.type === 'set')).toHaveLength(1)
    expect(nodes.filter(n => n.type === 'for')).toHaveLength(2)
  })
})

describe('resolveVariableType', () => {
  it('resolves set binding to symbol type', () => {
    const text = '{% set t = symbol("ts:m#Foo") %}{{ t.name }}'
    const nodes = parseTemplate(text)
    expect(resolveVariableType(nodes, 't', 40)).toBe('symbol')
  })

  it('resolves for binding to symbol type', () => {
    const text = '{% for item in symbols({ module: "m" }) %}{{ item.name }}{% endfor %}'
    const nodes = parseTemplate(text)
    expect(resolveVariableType(nodes, 'item', 50)).toBe('symbol')
  })

  it('resolves for over members to member type', () => {
    const text = '{% for m in t.members %}{{ m.name }}{% endfor %}'
    const nodes = parseTemplate(text)
    expect(resolveVariableType(nodes, 'm', 30)).toBe('member')
  })

  it('returns null for unknown variables', () => {
    const text = '{{ unknown.name }}'
    const nodes = parseTemplate(text)
    expect(resolveVariableType(nodes, 'unknown', 5)).toBeNull()
  })

  it('respects for loop scope', () => {
    const text = '{% for item in symbols({ module: "m" }) %}inner{% endfor %}outer'
    const nodes = parseTemplate(text)
    // Inside the loop - resolves
    expect(resolveVariableType(nodes, 'item', 45)).toBe('symbol')
    // After endfor - should not resolve (out of scope)
    expect(resolveVariableType(nodes, 'item', text.length - 2)).toBeNull()
  })
})

describe('nodeAtOffset', () => {
  it('finds symbol call at offset', () => {
    const text = '{% set t = symbol("ts:m#Foo") %}'
    const nodes = parseTemplate(text)
    const node = nodeAtOffset(nodes, 20)
    expect(node).not.toBeNull()
    expect(node!.type).toBe('symbol')
  })

  it('returns null for offsets outside any node', () => {
    const text = 'plain text here'
    const nodes = parseTemplate(text)
    expect(nodeAtOffset(nodes, 5)).toBeNull()
  })
})
