import type {OutputPlatform,PlatformFitDetail} from '../types/index.js';

/** Candidate-only advice, not validation of an exported asset or publishing account.
 * Policies checked against the linked operator help on 2026-11-20.
 * Recheck these sources when changing conditions; do not infer account entitlement.
 */
const sources={
 shorts:'https://support.google.com/youtube/answer/15424877?hl=en',
 instagram:'https://my.workplace.com/help/instagram/2720958398006062',
 tiktok:'https://support.tiktok.com/pt_BR/using-tiktok/creating-videos/camera-tools',
 linkedin:'https://www.linkedin.com/help/linkedin/answer/a548372',
 x:'https://help.x.com/en/using-x/x-videos',
 youtube:'https://support.google.com/youtube/answer/71673?hl=en',
} as const;

export function candidatePlatformAdvice(duration:number,overall:number,insight:number|null,hasFaceInHook:boolean):Record<OutputPlatform,PlatformFitDetail>{
 const valid=Number.isFinite(duration)&&duration>0;
 const within=(max:number,min=0)=>valid&&duration>=min&&duration<=max;
 const base=(platform:OutputPlatform,score:number,ratio:PlatformFitDetail['recommended_ratio'],durationStatus:NonNullable<PlatformFitDetail['duration_check']>['status'],reason:string):PlatformFitDetail=>({
  // Legacy consumers use suitable for inclusion. Unknown account conditions must
  // not silently exclude a candidate. This boolean is never a publishing grant.
  suitable:valid&&durationStatus!=='outside-checked-range',
  score:Math.max(0,Math.min(100,score)),score_basis:'editorial-heuristic',
  recommended_ratio:ratio,reason:valid?`Editorial heuristic only; no reach or upload guarantee. ${reason}`:'Duration is invalid or missing. Technical eligibility and editorial fit need review; no upload guarantee.',
  duration_check:{status:valid?durationStatus:'unknown',checked_at:'2026-11-20',source_url:sources[platform]},
  publishing_eligibility:'unverified',
 });
 return {
  shorts:base('shorts',overall+2,'9:16',within(180)?'within-checked-range':'outside-checked-range',
   `${within(180)?'Within the 3-minute Shorts duration ceiling.':'Outside the 3-minute Shorts duration ceiling.'} Classification also requires a square or vertical final video and the applicable upload date. For new uploads the date condition applies to both standard and Official Artist channels. A Short over 1 minute with an active Content ID claim is blocked globally. Final aspect ratio, claims, music rights and account status are not checked here.`),
  instagram:base('instagram',overall,'9:16',within(1200)?'within-checked-range':'outside-checked-range',
   `${within(1200)?'Within the 20-minute Reels creation duration described by Instagram Help.':'Outside the 20-minute Reels creation duration described by Instagram Help.'} Reels over 3 minutes are not recommended to new audiences. Being within 3 minutes does not guarantee recommendation. Reels availability, final file requirements, account eligibility and music rights need checking.`),
  tiktok:base('tiktok',overall+(hasFaceInHook?5:0),'9:16',within(3600)?'within-checked-range':'outside-checked-range',
   `${within(3600)?'Within the 60-minute uploaded-video duration described by TikTok Help.':'Outside the 60-minute uploaded-video duration described by TikTok Help.'} In-app recording has a separate 10-minute ceiling; a selected sound can limit duration. Account availability, final file and music rights need checking. Face presence is only a scoring heuristic, not evidence of FYP performance.`),
  linkedin:base('linkedin',(insight??50)+5,'1:1',within(900,3)?'within-checked-range':within(900,2)?'account-or-route-dependent':'outside-checked-range',
   'LinkedIn lists 15 minutes maximum, with a 3-second desktop minimum and 2-second mobile minimum. File size (75 KB to 5 GB), supported codec, resolution, aspect ratio, frame rate and bit rate must also pass. These final-file checks and audience relevance are not measured here.'),
  x:base('x',overall,'16:9',within(140)?'within-checked-range':valid?'account-or-route-dependent':'unknown',
   `${within(140)?'Within the 140-second non-subscriber web-upload duration ceiling.':'Duration exceeds the non-subscriber web-upload ceiling; longer uploads depend on the paid plan and upload route, not an automatic rejection.'} Non-subscriber web uploads also have a 512 MB file limit. Subscription entitlement, current uploader limits, final encoding, resolution, file size and rights are not checked.`),
  youtube:base('youtube',overall-5,'16:9',within(900)?'within-checked-range':within(43200)?'account-or-route-dependent':'outside-checked-range',
   'YouTube allows up to 15 minutes by default; longer uploads require account verification, up to 12 hours or 256 GB, whichever is less. Final file, channel restrictions and rights are not checked. A square or vertical upload up to 3 minutes may be classified as a Short rather than a regular video.'),
 };
}
