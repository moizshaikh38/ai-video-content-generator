import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  drawtextFontArg,
  normalizeTextWeight,
  resolveBundledFontFile,
} from '../services/editorFontFiles.js';

test('bundled families resolve to existing TTFs for every weight', () => {
  for (const family of ['Montserrat', 'Inter']) {
    for (const weight of ['normal', 'medium', 'bold', 'black'] as const) {
      const file = resolveBundledFontFile(family, weight);
      assert.ok(file, `${family} ${weight} should resolve`);
      assert.ok(fs.existsSync(file!), `${file} exists`);
      assert.ok(file!.endsWith('.ttf'));
    }
  }
});

test('weight normalization matches the preview fontWeight map (400/600/700/900)', () => {
  assert.equal(normalizeTextWeight('normal'), 'regular');
  assert.equal(normalizeTextWeight(undefined), 'regular');
  assert.equal(normalizeTextWeight('medium'), 'medium');
  assert.equal(normalizeTextWeight('bold'), 'bold');
  assert.equal(normalizeTextWeight('black'), 'black');
  assert.equal(normalizeTextWeight(600), 'medium');
  assert.equal(normalizeTextWeight(700), 'bold');
  assert.equal(normalizeTextWeight(900), 'black');
});

test('weight picks the matching file', () => {
  assert.match(resolveBundledFontFile('Montserrat', 'black')!, /Montserrat-Black\.ttf$/);
  assert.match(resolveBundledFontFile('Montserrat', 'bold')!, /Montserrat-Bold\.ttf$/);
  assert.match(resolveBundledFontFile('Montserrat', 'medium')!, /Montserrat-Medium\.ttf$/);
  assert.match(resolveBundledFontFile('Inter', 'medium')!, /Inter-SemiBold\.ttf$/);
  assert.match(resolveBundledFontFile('Inter')!, /Inter-Regular\.ttf$/);
});

test('drawtext arg uses fontfile for bundled families, font= fallback otherwise', () => {
  const bundled = drawtextFontArg('Montserrat', 'bold');
  assert.match(bundled, /^fontfile='.+\/assets\/fonts\/montserrat\/Montserrat-Bold\.ttf'$/);
  const fallback = drawtextFontArg('Oswald', 'bold');
  assert.match(fallback, /^(fontfile=|font='Oswald')/);
});

test('font= fallback strips quotes (no filter-string injection)', () => {
  assert.equal(drawtextFontArg("Ar'ial"), `font='Arial'`);
});

test('unbundled Arial honors bold preview weight rather than regular host fallback', () => {
 assert.match(drawtextFontArg('Arial','bold'), /^fontfile='.+[Bb]old[^/]*\.ttf'$/);
 assert.equal(drawtextFontArg('Arial','black'), drawtextFontArg('Arial','bold'));
 assert.equal(drawtextFontArg('Arial','normal'), `font='Arial'`);
});
