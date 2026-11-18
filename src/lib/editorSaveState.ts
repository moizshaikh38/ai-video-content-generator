export function acknowledgeEditorVersion<T extends{id:string;version:number}>(current:T|null,ack:Pick<T,'id'|'version'>):T|null{
 if(!current||current.id!==ack.id||!Number.isSafeInteger(ack.version)||ack.version<current.version)return current;
 return {...current,version:ack.version};
}
/** Acknowledging an older in-flight payload cannot acknowledge newer edits. */
export function editorSaveStillDirty(startGeneration:number,currentGeneration:number){return currentGeneration!==startGeneration;}
