/** Index complete, start-ordered word clocks once for repeated cut-edge checks.
 * The caller owns validation and ordering. This does not accept a transcript or
 * change a clock. Strict interior comparisons preserve touching word edges. */
export function createOrderedWordBoundarySafety(words: ReadonlyArray<{start:number;end:number}>): (time:number)=>boolean {
  const starts = new Float64Array(words.length);
  const maximumEnds = new Float64Array(words.length);
  let maximumEnd = -Infinity;
  for (let i=0;i<words.length;i++) {
    starts[i]=words[i].start;
    maximumEnd=Math.max(maximumEnd,words[i].end);
    maximumEnds[i]=maximumEnd;
  }
  return (time:number):boolean => {
    let low=0,high=starts.length;
    while(low<high){
      const middle=(low+high)>>>1;
      if(starts[middle]<time)low=middle+1;else high=middle;
    }
    return low===0||maximumEnds[low-1]<=time;
  };
}
