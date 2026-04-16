import type { Theme } from 'vitepress'
import { inject } from '@vercel/analytics'
import DefaultTheme from 'vitepress/theme'

export default {
  extends: DefaultTheme,
  enhanceApp() {
    // Initialize Vercel Web Analytics
    inject()
  },
} satisfies Theme
