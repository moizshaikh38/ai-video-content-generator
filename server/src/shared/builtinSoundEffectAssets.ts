/** Canonical virtual SFX references only, never a filesystem or remote prefix. */
export const BUILTIN_SOUND_EFFECT_IDS=['whoosh','pop','sub_bass','ding','riser'] as const;
export type BuiltinSoundEffectId=typeof BUILTIN_SOUND_EFFECT_IDS[number];
export function builtinSoundEffectId(value:unknown):BuiltinSoundEffectId|null {
 if(typeof value!=='string')return null;
 return BUILTIN_SOUND_EFFECT_IDS.find(id=>value===`builtin://sfx/${id}.wav`)??null;
}
