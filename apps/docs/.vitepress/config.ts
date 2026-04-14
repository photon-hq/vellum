import jinja from 'shiki/langs/jinja.mjs'
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Vellum',
  description: 'A build-time documentation preprocessor - curated docs that don\'t drift.',
  cleanUrls: true,

  // PHILOSOPHY.md and ARCHITECTURE.md are included from the repo root and
  // cross-link each other with `./ARCHITECTURE` / `./README`-style paths
  // that are correct in the repo but dead inside the site. The includes
  // are the source of truth; rewriting them would break the repo docs.
  ignoreDeadLinks: [
    /^\.\/(ARCHITECTURE|README|PHILOSOPHY)$/,
  ],

  markdown: {
    // Load Shiki's Jinja grammars for Nunjucks/Vel templates. `jinja` covers
    // the tag/expression syntax; `jinja-html` handles markdown-with-jinja
    // mixes. VitePress also recognises these as aliases for the fences we
    // use across the site (`jinja2` → `jinja`, `njk` → `jinja`).
    languages: [jinja],
    languageAlias: {
      jinja2: 'jinja',
      njk: 'jinja',
      vel: 'jinja',
    },
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/globals' },
      { text: 'Philosophy', link: '/philosophy' },
      { text: 'GitHub', link: 'https://github.com/photon-hq/vellum' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Concepts', link: '/guide/concepts' },
            { text: 'Writing templates', link: '/guide/templates' },
            { text: 'Package extraction', link: '/guide/package-extraction' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Caching', link: '/guide/caching' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Template API',
          items: [
            { text: 'Globals', link: '/reference/globals' },
            { text: 'Filters', link: '/reference/filters' },
            { text: 'Partials', link: '/reference/partials' },
          ],
        },
        {
          text: 'Types & interfaces',
          items: [
            { text: 'Symbol schema', link: '/reference/schema' },
            { text: 'Renderer profiles', link: '/reference/profiles' },
            { text: 'Extractors', link: '/reference/extractors' },
          ],
        },
        {
          text: 'Tooling',
          items: [
            { text: 'CLI', link: '/reference/cli' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/photon-hq/vellum' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/photon-hq/vellum/edit/master/apps/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Built with Vellum.',
    },
  },
})
