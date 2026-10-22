import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Static export with unoptimized images: <img> is the intended element.
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'off',
      // shortcut: ~60 `any` at Supabase/JSON boundaries, tighten file by file.
      '@typescript-eslint/no-explicit-any': 'off',
      // React Compiler rules; the app runs React 18 without the compiler.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn'
    }
  },
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'supabase/functions/**', 'public/**'] }
];
