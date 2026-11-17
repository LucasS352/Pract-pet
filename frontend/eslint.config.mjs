import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', '.next/**', 'out/**', 'build/**', 'node_modules/**', 'public/**', 'next-env.d.ts'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The existing API layer accepts heterogeneous ERP payloads.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
    },
  },
  { files: ['**/*.{js,cjs,mjs}'], rules: { '@typescript-eslint/no-require-imports': 'off', '@typescript-eslint/no-unused-vars': 'warn' } },
);
