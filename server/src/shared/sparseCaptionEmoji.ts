/** Sparse literal-word decoration proposal. Review-only: no automatic caller,
 * provider request, transcript mutation or render activation. Does not infer
 * emotion, irony, multilingual meaning, or safety from missing matches. */
export interface EmojiCaptionCue {id:string;start:number;end:number;text:string;words?:Array<{text:string;start:number;end:number;customStyle?:unknown}>}
export interface SparseCaptionEmoji {cueId:string;wordStart:number;wordEnd:number;start:number;end:number;assetId:'1f4a1'|'1f3ae'|'2764'|'1f3c6';emoji:string;matchedWord:string;reason:string}
export interface SparseCaptionEmojiPlan {version:1;status:'review-candidate'|'none';reason:string;limit:number;decorations:SparseCaptionEmoji[]}
const entries:Record<string,{assetId:SparseCaptionEmoji['assetId'];emoji:string;reason:string}>={
 idea:{assetId:'1f4a1',emoji:'💡',reason:'Literal idea or inspiration'},ideas:{assetId:'1f4a1',emoji:'💡',reason:'Literal idea or inspiration'},inspiration:{assetId:'1f4a1',emoji:'💡',reason:'Literal idea or inspiration'},
 gaming:{assetId:'1f3ae',emoji:'🎮',reason:'Literal video-game topic'},gameplay:{assetId:'1f3ae',emoji:'🎮',reason:'Literal video-game topic'},
 love:{assetId:'2764',emoji:'❤️',reason:'Explicit positive affection'},adore:{assetId:'2764',emoji:'❤️',reason:'Explicit positive affection'},
 trophy:{assetId:'1f3c6',emoji:'🏆',reason:'Explicit trophy or championship'},championship:{assetId:'1f3c6',emoji:'🏆',reason:'Explicit trophy or championship'},
};
const clean=(s:string)=>s.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g,'');
/** No quota: unknown/negative/sensitive contexts produce fewer or zero.
 * The duration is the final clip timeline, not the original source duration. */
export function planSparseCaptionEmojis(cues:EmojiCaptionCue[],duration:number):SparseCaptionEmojiPlan{
 const limit=Number.isFinite(duration)&&duration>=45?3:2;
 const none=(reason:string):SparseCaptionEmojiPlan=>({version:1,status:'none',reason,limit,decorations:[]});
 if(!Number.isFinite(duration)||duration<=0||!Array.isArray(cues))return none('Invalid clip timeline.');
 if(cues.some(c=>typeof c.text!=='string'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>duration+.001))return none('Invalid cue clock.');
 const all=cues.flatMap(c=>[c.text,...(Array.isArray(c.words)?c.words.map(w=>w.text):[])]).join(' ');
 if(/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(all))return none('Existing emoji text preserved; no automatic additions.');
 if(/\b(death|died|dead|suicide|funeral|cancer|trauma|abuse|hospital|war|victim|grief)\b/i.test(all))return none('Sensitive subject needs human judgment.');
 const words=cues.flatMap(c=>Array.isArray(c.words)?c.words.map(w=>({...w,cue:c})):[]).sort((a,b)=>a.start-b.start||a.end-b.end);
 if(!words.length)return none('No verified word clocks; no guessed timing.');
 if(words.some((w,i)=>typeof w.text!=='string'||![w.start,w.end].every(Number.isFinite)||w.start<w.cue.start-.001||w.end>w.cue.end+.001||w.end<=w.start||(i>0&&w.start<words[i-1].end-.001)))return none('Unusable or overlapping word clocks.');
 const decorations:SparseCaptionEmoji[]=[],used=new Set<string>();
 for(let i=0;i<words.length&&decorations.length<limit;i++){
  const w=words[i],e=entries[clean(w.text)];if(!e||w.customStyle||used.has(e.assetId))continue;
  const context=words.slice(Math.max(0,i-3),Math.min(words.length,i+3)).map(v=>clean(v.text));
  if(context.some(v=>['not','no','never','without','hate','dont',"don't",'cannot',"can't"].includes(v)))continue;
  if(decorations.some(d=>w.start-d.start<6))continue;
  // The phrase is already visible in this interval. At most 350ms lead
  // gives a readable cue-related accent without floating after its caption.
  const start=Math.max(w.cue.start,w.start-.35),end=Math.min(w.cue.end,start+1.1);if(end-start<.28||end<w.start)continue;
  if(decorations.some(d=>start-d.start<6))continue;
  decorations.push({cueId:w.cue.id,wordStart:w.start,wordEnd:w.end,start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),...e,matchedWord:w.text});used.add(e.assetId);
 }
 return decorations.length?{version:1,status:'review-candidate',reason:'Sparse English literal-word candidates, not semantic acceptance. Review timing and meaning before use.',limit,decorations}:none('No sufficiently spaced, supported literal matches.');
}
