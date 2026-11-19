/** One inspectable clip-wide automatic presentation decision. This records
 * evidence and uncertainty, not a claim that faces prove speech or gameplay. */
export interface ContentFramingDecision {
  version: 1;
  genre: string;
  policy: 'conversation'|'screen_content'|'action_context'|'scene_context'|'speaker_context'|'measured_auto';
  layoutMode: 'track'|'split'|'blur'|'screencast';
  source: 'user'|'content_candidate';
  stableFrameSize: true;
  evidence: {sampleCount:number;crowd:boolean;twoPersonView:boolean;possibleEmbeddedCamera:boolean;hasAnchorableFace:boolean};
  reasons: string[];
  uncertainties: string[];
}

export function chooseContentFraming(input: {
  genre?:string|null;measuredMode:ContentFramingDecision['layoutMode'];
  explicitMode?:ContentFramingDecision['layoutMode'];sampleCount:number;crowd:boolean;
  possibleEmbeddedCamera:boolean;hasAnchorableFace:boolean;
}):ContentFramingDecision {
  const genre=input.genre||'general';
  const policy:ContentFramingDecision['policy']=genre==='podcast_interview'?'conversation':
    ['gaming','education_tutorial','product_marketing','watch_party','streaming'].includes(genre)?'screen_content':
    genre==='sports'?'action_context':['documentary','storytelling'].includes(genre)?'scene_context':
    ['motivation','business_finance','news_politics','comedy_entertainment'].includes(genre)?'speaker_context':'measured_auto';
  const d:ContentFramingDecision={version:1,genre,policy,layoutMode:input.measuredMode,source:input.explicitMode?'user':'content_candidate',stableFrameSize:true,
    evidence:{sampleCount:input.sampleCount,crowd:input.crowd,twoPersonView:input.measuredMode==='split',possibleEmbeddedCamera:input.possibleEmbeddedCamera,hasAnchorableFace:input.hasAnchorableFace},reasons:[],uncertainties:[]};
  if(input.explicitMode){d.layoutMode=input.explicitMode;d.reasons.push('Explicit layout choice is preserved.');return d;}
  if(input.sampleCount===0){d.layoutMode='blur';d.reasons.push('No visual measurements: preserve the source rather than invent a crop.');d.uncertainties.push('Visual analysis unavailable.');return d;}
  if(input.crowd){d.layoutMode='blur';d.reasons.push('Crowd geometry is not evidence of a two-person conversation.');return d;}
  if(policy==='screen_content'){
    // A single input already contains its camera. Extracting the face and
    // adding it again duplicates it; the covered source cannot be recovered.
    d.layoutMode='blur';
    d.reasons.push(input.possibleEmbeddedCamera?'Preserve the existing embedded camera once with the source content.':'Preserve possible screen/game/product content until a safe content region is measured.');
    d.uncertainties.push('Genre and face geometry do not establish gameplay, UI, text-safe or camera boundaries.');
    return d;
  }
  if(policy==='action_context'||policy==='scene_context'){
    d.layoutMode='blur';d.reasons.push('Preserve action and scene context instead of assuming the largest face is the content.');
    d.uncertainties.push('Action and important-object regions have not been measured.');return d;
  }
  d.reasons.push(input.measuredMode==='split'?'Measured two-person view supports a stable two-panel candidate.':input.measuredMode==='track'?'Repeated anchorable face supports a stable speaker-context candidate.':'No reliable crop anchor: preserve the source.');
  if(input.measuredMode==='split'||input.measuredMode==='track')d.uncertainties.push('Face geometry alone does not prove the active speaker.');
  return d;
}

/** An auto analysis may replace an auto stamp, never an explicit/legacy item
 * choice or manual crop. Kept shared so preview and controls agree. */
export function effectiveContentLayout(item:any,decision?:ContentFramingDecision|null):string {
  const stored=item?.layout_mode||'track';
  if(!decision || decision.source!=='content_candidate')return stored;
  const crop=item?.crop?.mode;
  if(crop && crop!=='smart')return stored;
  if(item?.layout_mode && !['genre_recommendation','auto'].includes(item?.crop_config?.layout_mode_source))return stored;
  return decision.layoutMode;
}
