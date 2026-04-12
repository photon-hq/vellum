import type { MDXComponents } from 'mdx/types'

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 style={{ fontSize: '2rem', marginTop: '2rem' }}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', borderBottom: '1px solid #333', paddingBottom: '0.25rem' }}>
        {children}
      </h2>
    ),
    code: ({ children }) => (
      <code style={{ background: '#f5f5f5', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.9em' }}>
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '1rem', borderRadius: '6px', overflowX: 'auto' }}>
        {children}
      </pre>
    ),
    ...components,
  }
}
