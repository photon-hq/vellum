import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Vellum Next.js Example</h1>
      <p>
        This app ships with a Vellum preprocessor step that extracts symbols
        from <code>src/</code> and renders the pages under{" "}
        <code>app/docs/reference/</code> as plain <code>page.mdx</code> files
        at build time. Next.js file-system routing serves them directly — no
        runtime lookup, no custom components.
      </p>
      <h2>Generated reference</h2>
      <ul>
        <li>
          <Link href="/docs/reference/types">Types</Link> — interfaces and
          type aliases from <code>src/types.ts</code>
        </li>
        <li>
          <Link href="/docs/reference/constants">Constants</Link> — values
          from <code>src/lib/constants.ts</code>
        </li>
        <li>
          <Link href="/docs/reference/api">API</Link> — functions from{" "}
          <code>src/lib/api.ts</code>
        </li>
      </ul>
      <p>
        Run <code>pnpm docs:build</code> after editing any source file to
        regenerate the pages. <code>pnpm build</code> and{" "}
        <code>pnpm dev</code> do this automatically.
      </p>
    </main>
  );
}
