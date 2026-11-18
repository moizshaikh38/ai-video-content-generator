import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** Exact installed-package export mapping. No generated or replacement icons. */
export function installedLucideBindings() {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve('lucide-react/package.json'));
  const esm = path.join(root, 'dist/esm');
  const source = fs.readFileSync(path.join(esm, 'lucide-react.mjs'), 'utf8');
  const bindings = new Map();
  for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"](\.\/icons\/[a-z0-9-]+\.mjs)['"]/g)) {
    const target = path.resolve(esm, match[2]);
    if (!fs.statSync(target).isFile()) throw new Error('Missing installed icon module');
    for (const binding of match[1].split(',')) {
      const name = /^\s*default\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(binding)?.[1];
      if (name) bindings.set(name, target);
    }
  }
  if (!bindings.size) throw new Error('Installed Lucide barrel format is not recognized');
  return bindings;
}

/** Runs within the already configured React Babel pipeline. Unknown shapes stay unchanged. */
export default function exactLucideImports(api) {
  const t = api.types;
  let bindings;
  return {
    name: 'vireo-exact-lucide-imports',
    visitor: {
      ImportDeclaration(importPath) {
        const node = importPath.node;
        if (node.source.value !== 'lucide-react' || node.importKind === 'type' || node.importKind === 'typeof') return;
        if (!node.specifiers.length || node.specifiers.every(s => s.importKind === 'type') || node.assertions?.length || node.attributes?.length) return;
        bindings ??= installedLucideBindings();
        // All-or-nothing avoids changing semantics of namespace/default/non-icon imports.
        if (node.specifiers.some(s => !t.isImportSpecifier(s) || (s.importKind !== 'type' && !bindings.has(s.imported.name)))) return;
        const replacement = [];
        const typeSpecifiers = node.specifiers.filter(s => s.importKind === 'type');
        if (typeSpecifiers.length) {
          const types = t.importDeclaration(typeSpecifiers.map(s => t.cloneNode(s)), t.stringLiteral('lucide-react'));
          replacement.push(types);
        }
        for (const specifier of node.specifiers) {
          if (specifier.importKind === 'type') continue;
          replacement.push(t.importDeclaration(
            [t.importDefaultSpecifier(t.cloneNode(specifier.local))],
            t.stringLiteral(bindings.get(specifier.imported.name)),
          ));
        }
        if (replacement.length) importPath.replaceWithMultiple(replacement);
      },
    },
  };
}
