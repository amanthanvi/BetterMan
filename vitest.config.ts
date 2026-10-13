import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [{
    name: 'convex-test-optional-search-field',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/convex-test/dist/index.js')) return
      // convex-test 0.0.60 calls undefined.split() for optional FTS fields.
      // Match Convex: documents without a string search field are not indexed.
      const target = 'case "Search": {\n            const queryTerms'
      if (!code.includes(target)) throw new Error('convex-test optional search-field workaround needs review after dependency change')
      return code.replace(target, 'case "Search": {\n            if (typeof result !== "string") return false;\n            const queryTerms')
    },
  }],
  test: {
    server: { deps: { inline: ['convex-test'] } },
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts'],
  },
})
