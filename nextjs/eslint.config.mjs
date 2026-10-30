import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      react: {
        version: '19.2',
      },
    },
    rules: {
      'react-hooks/error-boundaries': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      // Cache-key-only parameters (lib/api.ts) are named `_x`.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The man page script runs on plain-HTML pages with no Next router; it navigates the document.
    files: ['man-client/**'],
    rules: { '@next/next/no-location-assign-relative-destination': 'off' },
  },
  // Unmodified, hash-pinned upstream tracker; provenance and behavior have separate tests.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/_bm/**']),
])
