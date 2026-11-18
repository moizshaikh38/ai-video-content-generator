import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import exactLucideImports, { installedLucideBindings } from './exact-lucide-imports.mjs';

// Resolve Babel through its existing declared React-plugin owner. No new package required.
const require = createRequire(import.meta.url);
const reactRequire = createRequire(require.resolve('@vitejs/plugin-react'));
const { transformSync } = reactRequire('@babel/core');
const transform = code => transformSync(code, {
  configFile: false, babelrc: false, ast: true, code: false,
  parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
  plugins: [exactLucideImports],
}).ast;
const declarations = ast => ast.program.body.filter(n => n.type === 'ImportDeclaration');

test('aliases map to the exact installed default module, type bindings remain type-only', () => {
  const result = declarations(transform("import { Type as TypeIcon, Loader2, type LucideIcon } from 'lucide-react';"));
  assert.equal(result.length, 3);
  const typed = result.find(n => n.source.value === 'lucide-react');
  assert.equal(typed.specifiers[0].importKind, 'type');
  const map = installedLucideBindings();
  for (const [local, imported] of [['TypeIcon', 'Type'], ['Loader2', 'Loader2']]) {
    const declaration = result.find(n => n.specifiers[0].local.name === local);
    assert.equal(declaration.source.value, map.get(imported));
    assert.equal(declaration.specifiers[0].type, 'ImportDefaultSpecifier');
  }
});

test('unsupported imports and literal strings retain semantics', () => {
  for (const source of ["import * as icons from 'lucide-react';", "import Icon from 'lucide-react';", "import { createLucideIcon } from 'lucide-react';", "import 'lucide-react';", "import type { LucideIcon } from 'lucide-react';"]) {
    assert.equal(declarations(transform(source))[0].source.value, 'lucide-react');
  }
  const source = 'const text = "import { X } from \'lucide-react\';";';
  assert.equal(declarations(transform(source)).length, 0);
});

test('every application runtime named icon retains the barrel definition and local name', () => {
  const map = installedLucideBindings();
  let files = 0, bindings = 0, types = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.[jt]sx?$/.test(file)) {
        const source = fs.readFileSync(file, 'utf8');
        if (!source.includes('lucide-react')) continue;
        const before = transformSync(source, { configFile: false, babelrc: false, code: false, ast: true, parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] } }).ast;
        const imports = declarations(before).filter(n => n.source.value === 'lucide-react');
        const after = declarations(transform(source));
        files++;
        for (const declaration of imports) {
          for (const specifier of declaration.specifiers) {
            if (declaration.importKind === 'type' || specifier.importKind === 'type') { types++; continue; }
            assert.equal(specifier.type, 'ImportSpecifier', file);
            assert.ok(map.has(specifier.imported.name), `${file}: ${specifier.imported.name}`);
            const converted = after.find(n => n.source.value === map.get(specifier.imported.name) && n.specifiers.some(s => s.local.name === specifier.local.name));
            assert.ok(converted, `${file}: ${specifier.local.name}`);
            bindings++;
          }
        }
      }
    }
  }
  walk('src');
  assert.ok(files > 50 && bindings > 100);
  console.log(JSON.stringify({ sourceFilesChecked: files, runtimeBindingsChecked: bindings, typeBindingsPreserved: types, buildExecuted: false }));
});
