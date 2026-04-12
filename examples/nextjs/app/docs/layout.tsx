import Link from "next/link";
import type { ReactNode } from "react";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        <Link href="/">← Home</Link>
        <Link href="/docs/reference/types">Types</Link>
        <Link href="/docs/reference/constants">Constants</Link>
        <Link href="/docs/reference/api">API</Link>
      </nav>
      <article>{children}</article>
    </>
  );
}
