import{describe,it}from'node:test';import assert from'node:assert/strict';import{getCaptionFontSizeBounds,clampCaptionFontSize,sanitizePresetOverrides,resolveCaptionPreset}from'../shared/captionPresets.js';
describe('Exact bundled-family ASS size bounds',()=>{
 it('gives only exact Bungee family its metric-specific range',()=>{assert.deepEqual(getCaptionFontSizeBounds('Bungee'),{min:32,max:284});for(const f of[undefined,null,'Unknown','Arial','Inter','bungee','Bungee-Regular','Bungee;Arial'])assert.equal(getCaptionFontSizeBounds(f).max,110);});
 it('clamps finite values and unknown context safely',()=>{assert.equal(clampCaptionFontSize(180,'Bungee'),180);assert.equal(clampCaptionFontSize(999,'Bungee'),284);assert.equal(clampCaptionFontSize(180,'Unknown'),110);assert.equal(clampCaptionFontSize(NaN,'Bungee'),64);assert.equal(clampCaptionFontSize(-5,'Bungee'),32);});
 it('requires font family context when sanitizing high sizes',()=>{assert.equal(sanitizePresetOverrides({fontSize:180}).fontSize,110);assert.equal(sanitizePresetOverrides({fontSize:180},'Bungee').fontSize,180);assert.equal(sanitizePresetOverrides({fontSize:180,fontFamily:'Bungee'}).fontSize,180);assert.equal(sanitizePresetOverrides({fontSize:180,fontFamily:'Unknown'},'Bungee').fontSize,110);});
 it('roundtrips explicit metric-size defaults without shrink and keeps unknown-font limit',()=>{const s=resolveCaptionPreset('retro_3d');assert.equal(s.fontSize,180);assert.equal(resolveCaptionPreset('retro_3d',{fontSize:s.fontSize}).fontSize,180);assert.equal(resolveCaptionPreset('retro_3d',{fontFamily:'Unknown',fontSize:180}).fontSize,110);assert.equal(resolveCaptionPreset('simple',{fontSize:180}).fontSize,110);});
});

import { captionLegacyColorDefaults } from '../../../src/lib/captionPresets';
it('editing typography does not materialize legacy white/yellow over preset colors',()=>{assert.deepEqual(captionLegacyColorDefaults({style:'retro_3d'} as any),{primary_color:'#FFD23F',highlight_color:'#FFFFFF'});assert.equal(captionLegacyColorDefaults({style:'clean'} as any).primary_color,'#FFFFFF');});

import {sanitizePlanOperations} from '../services/planSafetyService.js';
it('producer plan cannot expand size using an unapplied family parameter',()=>{const {operations}=sanitizePlanOperations([{id:'test',type:'CAPTION_STYLE',enabled:true,parameters:{font_family:'Bungee',font_size:180}}] as any,10);assert.equal(operations[0].parameters.font_size,110);});

import {editorCaptionToPresetOverrides,resolveEditorCaptionStyle} from '../../../src/lib/captionPresets';
it('equivalent numeric bound weights preserve Glide800 and SoftCut600 faces',()=>{for(const [style,font_weight,want] of [['glide',800,800],['soft_cut',600,600]]as const){const cap={style,font_weight,cues:[]}as any;assert.equal(editorCaptionToPresetOverrides(cap).bold,false);assert.equal(resolveEditorCaptionStyle(cap,'9:16')?.fontWeight,want)}assert.equal(editorCaptionToPresetOverrides({style:'glide',font_weight:'bold',cues:[]}as any).bold,true)});
