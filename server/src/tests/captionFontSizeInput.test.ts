import {describe,it} from 'node:test';import assert from 'node:assert/strict';
import {resolveCaptionFontSizeDraft} from '../../../src/components/editor/CaptionFontSizeInput.js';
describe('Font size draft commit',()=>{
 it('accepts a full replacement rather than clamping each digit',()=>{assert.equal(resolveCaptionFontSizeDraft('104',96,'Montserrat'),104)});
 it('bounds complete numeric values by the active family',()=>{assert.equal(resolveCaptionFontSizeDraft('1',96,'Montserrat'),32);assert.equal(resolveCaptionFontSizeDraft('999',96,'Montserrat'),110);assert.equal(resolveCaptionFontSizeDraft('180',96,'Bungee'),180);assert.equal(resolveCaptionFontSizeDraft('-1',96,'Bungee'),32)});
 it('rounds finite decimals and restores empty/incomplete/invalid values',()=>{assert.equal(resolveCaptionFontSizeDraft('103.6',96,'Inter'),104);for(const s of['',' ','-','+','1e','Infinity','NaN','--2'])assert.equal(resolveCaptionFontSizeDraft(s,96,'Inter'),96,s)});
});
