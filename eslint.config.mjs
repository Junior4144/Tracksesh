import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  // Already bundles next/typescript.
  ...nextCoreWebVitals,
];

export default config;
