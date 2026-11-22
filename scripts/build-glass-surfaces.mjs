import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const styleHref = '/site-assets/glass-surfaces.css';
const styleTag = `<link rel="stylesheet" data-vc-shared-glass href="${styleHref}">`;
const storageLink = '<a data-vc-storage-link href="/privacy">Privacy &amp; storage</a>';

export async function applyGlassSurfaces(outDir, cssPath) {
  const out = resolve(outDir);
  const css = await readFile(cssPath, 'utf8');
  if (!css.includes('--vc-glass-bg') || !css.includes('prefers-reduced-transparency')) {
    throw new Error('Shared glass stylesheet is incomplete');
  }
  await mkdir(join(out, 'site-assets'), { recursive: true });
  await writeFile(join(out, 'site-assets/glass-surfaces.css'), css);
  let pages = 0;
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const original = await readFile(path, 'utf8');
        // Only generated public navigation pages, never app bootstrap or media frames.
        if (!original.includes('id="site-nav"')) continue;
        if ((original.match(/<\/head>/g) || []).length !== 1) {
          throw new Error(`Missing or ambiguous head in ${path}`);
        }
        let html = original;
        if (!html.includes('data-vc-shared-glass')) html = html.replace('</head>', `${styleTag}</head>`);
        if (!html.includes('data-vc-storage-link')) {
          const anchor = '<a href="/#faq">FAQ</a>';
          if (!html.includes(anchor)) throw new Error(`Missing navigation anchor in ${path}`);
          html = html.replace(anchor, `${anchor}${storageLink}`);
        }
        if (html !== original) await writeFile(path, html);
        pages++;
      }
    }
  }
  await visit(out);
  return { pages, stylesheet: styleHref };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = await applyGlassSurfaces(join(repo, 'dist'), join(repo, 'src/styles/glass-surfaces.css'));
  console.log(`Shared glass styles and storage link prepared on ${result.pages} static navigation pages.`);
}
