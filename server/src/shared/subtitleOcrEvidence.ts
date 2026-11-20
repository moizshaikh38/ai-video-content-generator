/** OCR geometry evidence only. TSV text is untrusted data, never an instruction. */
export interface SubtitleOcrFrame { candidateTop: number | null }
export function parseSubtitleOcrTsv(tsv: string): SubtitleOcrFrame | null {
  if (typeof tsv !== 'string' || tsv.length > 1024 * 1024) return null;
  const rows = tsv.trim().split(/\r?\n/);
  if (!rows[0]?.startsWith('level\tpage_num\t')) return null;
  let w = 0, h = 0;
  const lines = new Map<string, Array<{ x: number; y: number; w: number; h: number; text: string }>>();
  for (const row of rows.slice(1, 10001)) {
    const c = row.split('\t'); if (c.length < 12) continue;
    const [level, page, block, para, line, , x, y, width, height, confidence] = c.slice(0, 11).map(Number);
    if (level === 1 && page === 1 && [width, height].every(Number.isFinite) && width > 0 && height > 0) { w = width; h = height; }
    const text = c.slice(11).join('\t').trim();
    if (level !== 5 || !w || !h || ![x,y,width,height,confidence].every(Number.isFinite) || confidence < 70 || x < 0 || y < h * .72 || width <= 0 || height < h * .012 || height > h * .13 || x + width > w || y + height > h || !/[\p{L}\p{N}]{2}/u.test(text)) continue;
    const key = [page, block, para, line].join(':');
    const group = lines.get(key) || []; group.push({x, y, w: width, h: height, text}); lines.set(key, group);
  }
  if (!w || !h) return null;
  const tops: number[] = [];
  for (const words of lines.values()) {
    if (words.length < 2 || words.map(v => v.text).join('').length < 6) continue;
    const left = Math.min(...words.map(v => v.x)), right = Math.max(...words.map(v => v.x + v.w));
    if ((right - left) / w < .12) continue;
    tops.push(Math.min(...words.map(v => v.y)) / h);
  }
  return { candidateTop: tops.length ? Math.min(...tops) : null };
}


/** Current clipping product duration cap, not an OCR absence guarantee. Work
 * remains five samples even at180s, so interval coverage stays explicitly sparse. */
export function sourceSubtitleReviewInputSupported(input:{start:number;duration:number;sourceSha256:string;sourceWidth?:number;sourceHeight?:number}):boolean {
 return /^[a-f0-9]{64}$/.test(input.sourceSha256)&&
  [input.start,input.duration,input.sourceWidth,input.sourceHeight].every(Number.isFinite)&&
  input.start>=0&&input.duration>0&&input.duration<=180&&
  input.sourceWidth!>0&&input.sourceWidth!<=1280&&input.sourceHeight!>0&&input.sourceHeight!<=720;
}
