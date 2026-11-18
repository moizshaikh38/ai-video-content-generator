import type {EditorTrackItem} from '../types';
/** A global position preset replaces old global coordinates, not cue overrides or styling. */
export function applyCaptionPositionPreset<T extends EditorTrackItem>(item:T,position:'top'|'center'|'bottom'):T{
 const caption={...item.caption,position,position_explicit:true};
 delete caption.position_x;delete caption.position_y;
 const transform={...item.transform};delete (transform as Partial<typeof transform>).position_x;delete (transform as Partial<typeof transform>).position_y;
 return {...item,caption,transform} as T;
}
