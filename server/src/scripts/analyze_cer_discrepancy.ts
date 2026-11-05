// Analysis script to recalculate Hinglish CER under all tokenization and normalization methods
const groundTruth = "नमस्ते दोस्तों, आज के इस वीडियो में हम VireoClip के नए AI clipping features को explore करेंगे, जहाँ automatic subtitles और viral highlights एक क्लिक में generate होते हैं।";

// Baseline hypothesis from original report vs prompt-assisted hypothesis
const promptAssistedHypothesis = "नमस्ते दोस्तों, आज के इस वीडियो में हम विरियो क्लिप के नए AI क्लिपिंग फीचर्स को एक्स्प्लोर करेंगे, जहां आटमाटिक सब्टाइटल्स और वाइरल हाइलाइट से क्लिक में जेनरेट होते हैं.";

// And what was the baseline output from the preliminary report when it was tagged 'tl'?
// In preliminary report:
// baseline: Detected Lang tl, Baseline WER 72.41%, CER 52.87%
// promptAssisted: Detected Lang hi, Prompt-assisted WER 41.38%, CER 36.78% (or 56.64%)

function computeLevenshtein<T>(a: T[], b: T[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
      }
    }
  }
  return dp[m][n];
}

console.log("=== HINGLISH CER INVESTIGATION ===");
console.log("Ground Truth:", groundTruth);
console.log("Hypothesis:  ", promptAssistedHypothesis);

// Method 1: Raw characters including whitespace and punctuation
const rawDist = computeLevenshtein(groundTruth.split(''), promptAssistedHypothesis.split(''));
console.log("\n1. Raw characters (with spaces & punct):");
console.log(`   Dist: ${rawDist}, Ref len: ${groundTruth.length}, CER: ${(rawDist / groundTruth.length * 100).toFixed(2)}%`);

// Method 2: Stripping whitespace only (as in benchmark_multilingual_transcription.ts)
const gtNoSpace = groundTruth.replace(/\s+/g, '');
const hypNoSpace = promptAssistedHypothesis.replace(/\s+/g, '');
const noSpaceDist = computeLevenshtein(gtNoSpace.split(''), hypNoSpace.split(''));
console.log("\n2. Whitespace stripped (benchmark_multilingual_transcription.ts logic):");
console.log(`   Dist: ${noSpaceDist}, Ref len: ${gtNoSpace.length}, CER: ${(noSpaceDist / gtNoSpace.length * 100).toFixed(2)}%`);

// Method 3: Unicode NFC vs NFD
const gtNFC = groundTruth.normalize('NFC').replace(/\s+/g, '');
const hypNFC = promptAssistedHypothesis.normalize('NFC').replace(/\s+/g, '');
const nfcDist = computeLevenshtein(gtNFC.split(''), hypNFC.split(''));
console.log("\n3. Unicode NFC (no space):");
console.log(`   Dist: ${nfcDist}, Ref len: ${gtNFC.length}, CER: ${(nfcDist / gtNFC.length * 100).toFixed(2)}%`);

const gtNFD = groundTruth.normalize('NFD').replace(/\s+/g, '');
const hypNFD = promptAssistedHypothesis.normalize('NFD').replace(/\s+/g, '');
const nfdDist = computeLevenshtein(gtNFD.split(''), hypNFD.split(''));
console.log("\n4. Unicode NFD (no space):");
console.log(`   Dist: ${nfdDist}, Ref len: ${gtNFD.length}, CER: ${(nfdDist / gtNFD.length * 100).toFixed(2)}%`);

// Method 5: Punctuation and whitespace stripped
const punctRegex = /[।.,?!;:"'()\[\]{}—–-]/g;
const gtNoPunct = groundTruth.replace(punctRegex, '').replace(/\s+/g, '');
const hypNoPunct = promptAssistedHypothesis.replace(punctRegex, '').replace(/\s+/g, '');
const noPunctDist = computeLevenshtein(gtNoPunct.split(''), hypNoPunct.split(''));
console.log("\n5. Punctuation & whitespace stripped:");
console.log(`   Dist: ${noPunctDist}, Ref len: ${gtNoPunct.length}, CER: ${(noPunctDist / gtNoPunct.length * 100).toFixed(2)}%`);

// Method 6: Lowercased Latin + whitespace stripped
const gtLower = groundTruth.toLowerCase().replace(/\s+/g, '');
const hypLower = promptAssistedHypothesis.toLowerCase().replace(/\s+/g, '');
const lowerDist = computeLevenshtein(gtLower.split(''), hypLower.split(''));
console.log("\n6. Lowercase + whitespace stripped:");
console.log(`   Dist: ${lowerDist}, Ref len: ${gtLower.length}, CER: ${(lowerDist / gtLower.length * 100).toFixed(2)}%`);

// Method 7: Lowercased Latin + Punctuation + whitespace stripped
const gtLowerNoPunct = groundTruth.toLowerCase().replace(punctRegex, '').replace(/\s+/g, '');
const hypLowerNoPunct = promptAssistedHypothesis.toLowerCase().replace(punctRegex, '').replace(/\s+/g, '');
const lowerNoPunctDist = computeLevenshtein(gtLowerNoPunct.split(''), hypLowerNoPunct.split(''));
console.log("\n7. Lowercase + Punctuation + whitespace stripped:");
console.log(`   Dist: ${lowerNoPunctDist}, Ref len: ${gtLowerNoPunct.length}, CER: ${(lowerNoPunctDist / gtLowerNoPunct.length * 100).toFixed(2)}%`);

// Method 8: Intl.Segmenter (Grapheme clusters / Devanagari Aksharas)
const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });
const gtGraphemes = Array.from(segmenter.segment(groundTruth.replace(/\s+/g, ''))).map(s => s.segment);
const hypGraphemes = Array.from(segmenter.segment(promptAssistedHypothesis.replace(/\s+/g, ''))).map(s => s.segment);
const graphemeDist = computeLevenshtein(gtGraphemes, hypGraphemes);
console.log("\n8. Grapheme clusters (Intl.Segmenter, no space):");
console.log(`   Dist: ${graphemeDist}, Ref len: ${gtGraphemes.length}, CER: ${(graphemeDist / gtGraphemes.length * 100).toFixed(2)}%`);

// Method 9: Where did 36.78% come from?
// Could the denominator have been the total characters in ground truth (including spaces)?
console.log(`\n9. noSpaceDist (${noSpaceDist}) / groundTruth.length (${groundTruth.length}): ${(noSpaceDist / groundTruth.length * 100).toFixed(2)}%`);
console.log(`10. rawDist (${rawDist}) / groundTruth.length (${groundTruth.length}): ${(rawDist / groundTruth.length * 100).toFixed(2)}%`);

// Test 11: What if Latin English terms were mixed in hypothesis?
const hypWithLatin = "नमस्ते दोस्तों, आज के इस वीडियो में हम VireoClip के नए AI clipping features को explore करेंगे, जहां आटमाटिक सब्टाइटल्स और वाइरल हाइलाइट से क्लिक में जेनरेट होते हैं.";
const hypWithLatinNoSpace = hypWithLatin.replace(/\s+/g, '');
const distLatin = computeLevenshtein(gtNoSpace.split(''), hypWithLatinNoSpace.split(''));
console.log(`\n11. Hypothesis with Latin terms preserved: Dist ${distLatin}, CER: ${(distLatin / gtNoSpace.length * 100).toFixed(2)}%`);

// Test 12: Reverse CER denominator (hypothesis length)
console.log(`12. Dist ${noSpaceDist} / hyp length (${hypNoSpace.length}): ${(noSpaceDist / hypNoSpace.length * 100).toFixed(2)}%`);

// Test 13: What exact fraction equals 36.78%?
for (let d = 30; d <= 100; d++) {
  for (let l = 100; l <= 200; l++) {
    const val = Number((d / l * 100).toFixed(2));
    if (val === 36.78) {
      console.log(`Found exact 36.78%: ${d} / ${l} = ${(d/l*100).toFixed(4)}%`);
    }
    if (val === 52.87) {
      console.log(`Found exact 52.87%: ${d} / ${l} = ${(d/l*100).toFixed(4)}%`);
    }
  }
}

