/** Shared creation state for upload and URL subtitle sources. Server decides
 * preset entitlement. Importing media does not start transcription or exports. */
export function subtitleProjectDefaults(hormoziAllowed:boolean){return {
 project_type:'subtitles' as const,subtitle_cues:[],
 subtitle_style:{preset:hormoziAllowed?'hormozi':'clean',fontFamily:'Montserrat',fontSize:54,fontWeight:'bold',textColor:'#FFFFFF',highlightColor:'#FACC15',boxEnabled:false,position:'bottom',alignment:'center'},
 subtitle_export_status:'idle',subtitle_export_progress:0,
};}
