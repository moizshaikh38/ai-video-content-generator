/** Review-only geometry. Retain an existing camera partition at a constant
 * scale, move it inside panel padding to center its observed face. No pixels
 * beyond that partition are invented. Padding can be large and can move. */
export function centeredContainProposal(sourceW:number,sourceH:number,panelW:number,panelH:number,start:number,end:number,centers:number[]){
 if(![sourceW,sourceH,panelW,panelH,start,end,...centers].every(Number.isFinite)||!centers.length||sourceW<=0||sourceH<=0||panelW<=0||panelH<=0||start<0||end>1||end<=start||centers.some(x=>x<=start||x>=end))return null;
 const maxSpan=Math.max(...centers.flatMap(x=>[x-start,end-x]))*sourceW;
 const scale=Math.min(panelH/sourceH,panelW/(2*maxSpan));
 const width=(end-start)*sourceW*scale,height=sourceH*scale;
 const placements=centers.map(centerX=>({left:panelW/2-(centerX-start)*sourceW*scale,top:(panelH-height)/2,width,height}));
 if(placements.some(p=>p.left<-.001||p.left+p.width>panelW+.001||p.top<-.001||p.top+p.height>panelH+.001))return null;
 return {sourceX:start*sourceW,sourceWidth:(end-start)*sourceW,scale,placements,warning:'Observed face centered using movable padding; source-edge missing content remains missing. Not an automatic composition-quality decision.'};
}
