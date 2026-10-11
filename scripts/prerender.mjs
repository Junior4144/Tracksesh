import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const output = new URL('../server/Tracksesh.Api/wwwroot/', import.meta.url);
const shell = await readFile(new URL('index.html', output), 'utf8');
const marker = '<div id="root"></div>';
if (!shell.includes(marker)) throw new Error('Homepage render target is missing');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { renderHomepage } = await server.ssrLoadModule('/src/prerender.tsx');
  const content = renderHomepage();
  if (!content.includes('<h1')) throw new Error('Homepage prerender produced no heading');
  // Deep links must not receive homepage content or its canonical URL.
  const appShell = shell
    .replace(/\s*<link rel="canonical"[^>]*>/, '')
    .replace(/\s*<meta property="og:url"[^>]*>/, '')
    .replace(/<title>.*?<\/title>/, '<title>Study workspace | Tracksesh</title>')
    .replace('</head>', '<meta name="robots" content="noindex, follow" />\n</head>');
  await writeFile(new URL('app.html', output), appShell);
  await writeFile(new URL('index.html', output), shell.replace(marker, `<div id="root">${content}</div>`));
  console.log('Prerendered public homepage; wrote separate noindex workspace shell.');
} finally {
  await server.close();
}
