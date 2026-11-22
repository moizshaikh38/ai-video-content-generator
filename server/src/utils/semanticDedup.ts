/**
 * Semantic dedup (clipping advantage B2): kills "3 clips, same idea".
 *
 * Time-overlap dedup can't see that two moments 10 minutes apart make the
 * SAME point. This pass compares candidate TEXT meaning:
 *  - cosine similarity when embeddings are available (true semantics),
 *  - content-token Jaccard as a zero-cost deterministic fallback (still
 *    catches ~most duplicates: same words, same idea).
 *
 * A candidate is dropped when a HIGHER-RANKED selection exceeds the genre-
 * tunable similarity threshold. Pure functions; fully unit-tested.
 */

export interface SemanticDedupCandidate {
  text: string;
  score: number;
  embedding?: number[];
  [key: string]: unknown;
}

export interface SemanticDedupOptions {
  /** 0..1 similarity above which the lower-scored candidate is a duplicate. */
  threshold?: number;
  /** 'auto': embeddings when present, token fallback otherwise. */
  mode?: 'auto' | 'token';
}

const DEFAULTS: Required<SemanticDedupOptions> = {
  threshold: 0.82,
  mode: 'auto',
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'you', 'we', 'they', 'he', 'she', 'as', 'by', 'from', 'will',
  'would', 'can', 'could', 'do', 'does', 'did', 'have', 'has', 'had', 'so',
  'just', 'like', 'know', 'think', 'really', 'very', 'gonna', 'going',
]);

/** Lowercased content tokens (stopwords + short tokens removed). */
export function contentTokens(text: string): string[] {
  return (text || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Jaccard similarity over content tokens: |A∩B| / |A∪B|. */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(contentTokens(a));
  const tb = new Set(contentTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Token overlap is not semantic equivalence. A changed explicit quantity or
 * English negation is evidence against dropping a separate moment. Preserve
 * both for ranking rather than declaring which meaning is correct. This narrow
 * guard does not understand arbitrary contradictions or other languages. */
export function tokenDedupEvidenceCompatible(a: string, b: string): boolean {
  const normalized = (text: string) => String(text || '').normalize('NFC').toLowerCase().replace(/[’]/gu, "'");
  const quantities = (text: string) => normalized(text).match(/[+\-−]?\p{N}+(?:[.,]\p{N}+)*(?:\s*%)?/gu)?.map(value => value.replace(/\s+/gu, '')) || [];
  const negations = (text: string) => normalized(text).match(/[\p{L}\p{M}]+(?:'[\p{L}\p{M}]+)*/gu)?.filter(value =>
    /^(?:no|not|never|without|cannot|can't|don't|doesn't|didn't|won't|wouldn't|isn't|aren't|wasn't|weren't|shouldn't|couldn't|haven't|hasn't|hadn't)$/u.test(value)) || [];
  // Keep order and repeats: swapping two quantities can change the outcome.
  return JSON.stringify(quantities(a)) === JSON.stringify(quantities(b)) &&
    JSON.stringify(negations(a)) === JSON.stringify(negations(b));
}

/** Cosine similarity of two equal-length vectors (0 when shapes differ). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Best-available similarity between two candidates. */
export function candidateSimilarity(
  a: SemanticDedupCandidate,
  b: SemanticDedupCandidate,
  mode: 'auto' | 'token' = 'auto'
): number {
  if (mode === 'auto' && a.embedding && b.embedding) {
    return cosineSimilarity(a.embedding, b.embedding);
  }
  return tokenJaccard(String(a.text), String(b.text));
}

/**
 * Greedy semantic dedup: candidates rank by score (desc); each survivor
 * suppresses later candidates whose similarity exceeds the threshold.
 * Order of the returned list preserves input order; count ≤ input count.
 */
export function deduplicateSemantically<T extends SemanticDedupCandidate>(
  candidates: T[],
  options: SemanticDedupOptions = {}
): T[] {
  const { threshold, mode } = { ...DEFAULTS, ...options };
  if (!Array.isArray(candidates) || candidates.length < 2) return candidates;

  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const keptIdx = new Set<number>();
  const droppedFor = new Map<number, number>(); // dropped idx -> kept idx

  for (let i = 0; i < ranked.length; i++) {
    if (droppedFor.has(i)) continue;
    keptIdx.add(i);
    for (let j = i + 1; j < ranked.length; j++) {
      if (droppedFor.has(j) || keptIdx.has(j)) continue;
      const usesTokenFallback = mode === 'token' || !(ranked[i].embedding && ranked[j].embedding);
      if (usesTokenFallback && !tokenDedupEvidenceCompatible(String(ranked[i].text), String(ranked[j].text))) continue;
      if (candidateSimilarity(ranked[i], ranked[j], mode) >= threshold) {
        droppedFor.set(j, i);
      }
    }
  }

  // Return in original input order (stable for pipeline predictability).
  const rankIdxToInput = new Map<number, number>();
  ranked.forEach((c, rankPos) => rankIdxToInput.set(rankPos, candidates.indexOf(c)));
  const keepInputIdx = new Set([...keptIdx].map((r) => rankIdxToInput.get(r)!));
  return candidates.filter((_, idx) => keepInputIdx.has(idx));
}
