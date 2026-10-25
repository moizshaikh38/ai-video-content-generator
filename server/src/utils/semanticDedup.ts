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
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
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
