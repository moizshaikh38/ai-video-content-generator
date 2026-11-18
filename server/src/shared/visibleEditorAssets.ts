/** Asset preparation must not perform network/disk work for excluded tracks or
 * items. Return references so only the visible render copy receives cache paths. */
export function visibleEditorAssetItems<T extends {hidden?:boolean;source_path?:string|null}>(
 project:{tracks:Array<{hidden?:boolean;items:T[]}>}
):T[]{
 return project.tracks.filter(t=>!t.hidden).flatMap(t=>t.items.filter(i=>!i.hidden&&Boolean(i.source_path)));
}
