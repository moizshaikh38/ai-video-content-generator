# Verified private product-media backup and capacity recovery

Date: 2026-11-19, approximately 01:43 to 01:50 IST.

## Scope and result

The user approved private Drive backup and verification of 1,784 older product image samples, followed by removal of only those verified local copies. A later follow-up added old product clips to private backup, without local MP4 deletion.

- 1,784 PNGs from seven older caption comparison batches were backed up in 44 bounded ZIP parts.
- Logical PNG bytes: 901,046,950. Original unique allocated bytes: 904,728,576.
- Each uploaded ZIP was downloaded again. Whole-archive SHA256, ZIP membership, and every member's SHA256 were compared with the pre-existing original-file manifest before removal of that part's original PNGs.
- Every folder and file had only the expected owner permission, moizshaikh381@gmail.com. No link-access permission was added.
- All 440 non-whitelisted files in the wider nine-group inventory remained local and matched their pre-operation SHA256. No whole-directory deletion was used.
- Seven old 8-second preview/export comparison clips, 11,078,138 bytes total, were also uploaded individually, downloaded and hash-verified. Every original local MP4 was preserved.
- Included image/clip pixels were inspected as product footage and caption comparisons. No internal transcripts, logs, scripts, JSON evidence or unrelated screenshots were uploaded.

Private image archive folder:
https://drive.google.com/drive/folders/1feYvn1YY1a2j5Cm1sMRLVAg8epbvKuf3?authuser=moizshaikh381%40gmail.com

Private old clip folder:
https://drive.google.com/drive/folders/1fOp4hDqU-IgiPP7W9OKf08fQ3NJj3nKy?authuser=moizshaikh381%40gmail.com

## Capacity and limits

Free bytes before the archive: 368,742,400.
Free bytes after image cleanup: 1,272,340,480.
Free bytes after final clip verification/receipts: 1,272,205,312.

The upload interface rejected the initial 32 MiB part because its limit is 25 MiB; no corresponding upload or source deletion occurred. Parts were rebuilt at 20 MiB. The early multi-part disk guard underestimated reserved download copies and briefly used about 4 MiB of the intended 256 MiB reserve. Those confirmed downloads were immediately verified and their authorized originals removed; accounting was fixed to reserve every outstanding download. No corrupted or missing excluded file was found in the final preservation check.

The operation restored room for ordinary work. It did not qualify genuine 4K, authorize another render, change production, or prove capacity for a particular long-source run. Re-budget source, intermediate/output copies, CPU and memory for the actual proposed qualification before attempting one. Original videos, latest results, transcript/source bindings and other excluded evidence remain local.
