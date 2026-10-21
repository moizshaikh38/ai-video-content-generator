import { AppError } from '../types/index.js';

/**
 * Distinguishable reasons a YouTube extraction or download can fail.
 *
 * `terminal` kinds describe the video itself (private, removed, members-only, ...) and will
 * fail identically no matter which player client is used, so the caller must stop retrying.
 * Non-terminal kinds describe *our* extraction attempt (a blocked player client, a stale
 * signature, a bot challenge) and are worth retrying with a different client profile.
 */
export type YouTubeFailureKind =
  | 'private'
  | 'removed'
  | 'account_terminated'
  | 'geo_blocked'
  | 'copyright_blocked'
  | 'members_only'
  | 'age_restricted'
  | 'login_required'
  | 'drm_protected'
  | 'live_in_progress'
  | 'live_not_recorded'
  | 'premiere_pending'
  | 'still_processing'
  | 'not_a_video'
  | 'unavailable'
  | 'bot_challenge'
  | 'rate_limited'
  | 'format_unavailable'
  | 'extractor_stale'
  | 'network'
  | 'timeout'
  | 'too_large'
  | 'downloader_missing'
  | 'unknown';

export interface YouTubeFailure {
  kind: YouTubeFailureKind;
  /** User-facing message. Never a generic "verify the video is public" catch-all. */
  message: string;
  statusCode: number;
  /** AppError code surfaced to the client. */
  code: string;
  /** True when retrying with another player client cannot possibly help. */
  terminal: boolean;
  /** Cleaned yt-dlp reason line, kept for logs and for composing unknown-failure messages. */
  reason?: string;
}

export interface ClassifyYouTubeFailureInput {
  stderr?: string;
  stdout?: string;
  /** `error.message` from child_process. */
  message?: string;
  /** `error.killed` — set when execFile hit its timeout. */
  killed?: boolean;
  /** `error.code` from child_process (e.g. 'ETIMEDOUT', 'ENOENT'). */
  errCode?: string | number;
  /** `error.signal` from child_process. */
  signal?: string | null;
}

export interface ClassifyYouTubeFailureContext {
  /** Byte ceiling in force for this download, used to word the too-large message. */
  maxBytes?: number;
}

/**
 * Higher wins when several attempts fail with different non-terminal reasons: we report the
 * most actionable one rather than whichever happened to come last.
 */
const REPORTING_PRIORITY: Record<YouTubeFailureKind, number> = {
  private: 100,
  removed: 100,
  account_terminated: 100,
  geo_blocked: 100,
  copyright_blocked: 100,
  members_only: 100,
  age_restricted: 100,
  login_required: 100,
  drm_protected: 100,
  live_in_progress: 100,
  live_not_recorded: 100,
  premiere_pending: 100,
  still_processing: 100,
  not_a_video: 100,
  too_large: 95,
  downloader_missing: 90,
  timeout: 85,
  bot_challenge: 70,
  rate_limited: 65,
  format_unavailable: 50,
  extractor_stale: 45,
  unavailable: 30,
  network: 20,
  unknown: 10,
};

/**
 * Pulls the most informative line out of yt-dlp stderr and strips the noise yt-dlp prefixes it
 * with (`ERROR:`, `[youtube]`, the bare video id) so the text can be shown to a user as-is.
 */
export function extractYtDlpReason(stderr: string): string | undefined {
  const lines = String(stderr || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const candidate =
    lines.find((l) => l.startsWith('ERROR:')) ||
    lines.find((l) => /\bHTTP Error\b/i.test(l)) ||
    lines.find((l) => /\berror\b/i.test(l));

  if (!candidate) return undefined;

  let reason = candidate
    .replace(/^ERROR:\s*/i, '')
    .replace(/^\[[a-z0-9_:+-]+\]\s*/i, '')
    // yt-dlp prefixes the 11-char video id on extractor errors; it means nothing to a user.
    .replace(/^[A-Za-z0-9_-]{11}:\s*/, '')
    .replace(/\s*Use --list-formats for a list of available formats\.?$/i, '')
    .replace(/;?\s*please report this issue on\s+https?:\/\/\S+.*$/i, '')
    .trim();

  // Drop yt-dlp's self-update nag, which is not actionable for our users.
  reason = reason.replace(/\s*Make sure you are using the latest version.*$/i, '').trim();

  return reason || undefined;
}

/**
 * `child_process` prefixes a failed call's message with `Command failed: <full argv>`, which
 * contains every flag we passed (`--max-filesize 500M`, `--extractor-args ...`) plus the video
 * URL. Matching patterns against that would let our own arguments masquerade as yt-dlp output,
 * so the echoed command line is removed before classification. Messages that carry no echoed
 * command (`spawn ... ENOENT`) are left untouched.
 */
function stripEchoedCommand(message: string): string {
  if (!/^Command failed:/i.test(message)) return message;
  const nl = message.indexOf('\n');
  return nl === -1 ? '' : message.slice(nl + 1);
}

interface Rule {
  kind: YouTubeFailureKind;
  /** Matched case-insensitively against the combined stderr/stdout/message haystack. */
  patterns: RegExp[];
}

/**
 * Ordered most-specific first. Several YouTube reasons are prefixed with the generic
 * "Video unavailable", so the specific causes (geo, copyright, termination) must be tested
 * before the generic `unavailable` rule or they would be misreported as plain unavailability.
 */
const RULES: Rule[] = [
  {
    kind: 'bot_challenge',
    patterns: [
      /sign in to confirm you[’'`]?re not a bot/i,
      /confirm you[’'`]?re not a bot/i,
      /bot detection/i,
    ],
  },
  {
    kind: 'age_restricted',
    patterns: [
      /sign in to confirm your age/i,
      /age-restricted/i,
      /confirm your age/i,
      /inappropriate for some users/i,
      /age.?restricted content/i,
    ],
  },
  {
    kind: 'members_only',
    patterns: [
      /join this channel/i,
      /members[- ]only/i,
      /available to this channel[’'`]?s members/i,
      /paid members/i,
      /purchase (?:or rent )?this video/i,
    ],
  },
  {
    kind: 'private',
    patterns: [
      /private video/i,
      /this video is private/i,
      /sign in if you[’'`]?ve been granted access/i,
      /login if you have permissions to watch/i,
    ],
  },
  {
    kind: 'geo_blocked',
    patterns: [
      /not made this video available in your country/i,
      /not available in your (?:country|region|location)/i,
      /unavailable in your (?:country|region|location)/i,
      /blocked it in your country/i,
      /video is geo.?restricted/i,
      /\bgeo.?restricted\b/i,
    ],
  },
  {
    kind: 'copyright_blocked',
    patterns: [
      /blocked it on copyright grounds/i,
      /copyright (?:claim|grounds|infringement)/i,
      /rightholder complaint/i,
    ],
  },
  {
    kind: 'account_terminated',
    patterns: [/account associated with this video has been terminated/i, /account has been terminated/i],
  },
  {
    kind: 'removed',
    patterns: [
      /has been removed/i,
      /removed by the uploader/i,
      /violating youtube[’'`]?s (?:terms of service|community guidelines|policy)/i,
      /no longer available/i,
    ],
  },
  {
    kind: 'drm_protected',
    patterns: [/drm.?protected/i, /is drm protected/i, /protected by drm/i],
  },
  {
    kind: 'still_processing',
    patterns: [/we[’'`]?re processing this video/i, /still being processed/i, /check back later/i],
  },
  {
    kind: 'premiere_pending',
    patterns: [/premieres in/i, /will begin in/i, /this live event will begin/i, /scheduled for/i],
  },
  {
    kind: 'live_not_recorded',
    patterns: [/live stream recording is not available/i, /live event has ended/i],
  },
  {
    kind: 'live_in_progress',
    patterns: [/is (?:a )?live (?:event|stream) and cannot be downloaded/i, /currently live/i, /live event is in progress/i],
  },
  {
    kind: 'login_required',
    patterns: [
      /sign in to view this video/i,
      /login required/i,
      /this video requires payment/i,
      /you must be signed in/i,
      /account cookies are no longer valid/i,
    ],
  },
  {
    kind: 'not_a_video',
    patterns: [/unsupported url/i, /is not a valid url/i, /unable to extract video id/i, /does not have a video/i],
  },
  {
    kind: 'too_large',
    // Must match yt-dlp's actual abort wording only. A bare `max-filesize` match would also hit
    // the `--max-filesize` flag that Node echoes back inside its "Command failed:" message.
    patterns: [
      /file is larger than max-filesize/i,
      /aborting because of max.?filesize/i,
      /max-filesize.*aborting/i,
    ],
  },
  {
    kind: 'downloader_missing',
    patterns: [
      /no module named ['"]?yt_dlp/i,
      /command not found/i,
      /\bENOENT\b/,
      /is not recognized as an internal or external command/i,
    ],
  },
  {
    kind: 'format_unavailable',
    patterns: [
      /requested format is not available/i,
      /no video formats found/i,
      /only images are available/i,
      /requested format is not available/i,
    ],
  },
  {
    kind: 'rate_limited',
    patterns: [/http error 429/i, /too many requests/i, /rate.?limit/i],
  },
  {
    kind: 'extractor_stale',
    patterns: [
      /the page needs to be reloaded/i,
      /unable to extract (?:yt initial|player|nsig|signature|js player|player response)/i,
      /nsig extraction failed/i,
      /signature extraction failed/i,
      /po token/i,
      /player response/i,
      /some formats (?:may be )?missing/i,
      /http error 40[03]/i,
    ],
  },
  {
    kind: 'network',
    patterns: [
      /unable to download (?:webpage|api page|json)/i,
      /\bECONNRESET\b/,
      /\bETIMEDOUT\b/,
      /\bEAI_AGAIN\b/,
      /\bENOTFOUND\b/,
      /connection (?:reset|refused|timed out)/i,
      /temporary failure in name resolution/i,
      /ssl/i,
      /http error 5\d\d/i,
    ],
  },
];

function describe(
  kind: YouTubeFailureKind,
  reason: string | undefined,
  ctx: ClassifyYouTubeFailureContext
): { message: string; statusCode: number; code: string; terminal: boolean } {
  const maxMb = ctx.maxBytes ? Math.max(1, Math.round(ctx.maxBytes / (1024 * 1024))) : undefined;

  switch (kind) {
    case 'private':
      return {
        message: 'This YouTube video is private, so it cannot be imported. Ask the owner to make it public or unlisted, or upload the file directly.',
        statusCode: 403,
        code: 'YOUTUBE_PRIVATE_VIDEO',
        terminal: true,
      };
    case 'removed':
      return {
        message: 'This YouTube video has been removed and is no longer available to download.',
        statusCode: 404,
        code: 'YOUTUBE_VIDEO_REMOVED',
        terminal: true,
      };
    case 'account_terminated':
      return {
        message: 'The YouTube channel that posted this video has been terminated, so the video can no longer be downloaded.',
        statusCode: 404,
        code: 'YOUTUBE_ACCOUNT_TERMINATED',
        terminal: true,
      };
    case 'geo_blocked':
      return {
        message: 'This YouTube video is not available in the region our servers run in, so it cannot be imported. Upload the file directly instead.',
        statusCode: 451,
        code: 'YOUTUBE_GEO_BLOCKED',
        terminal: true,
      };
    case 'copyright_blocked':
      return {
        message: 'This YouTube video is blocked on copyright grounds and cannot be imported.',
        statusCode: 451,
        code: 'YOUTUBE_COPYRIGHT_BLOCKED',
        terminal: true,
      };
    case 'members_only':
      return {
        message: 'This YouTube video is members-only or requires a purchase, so it cannot be imported. Upload the file directly instead.',
        statusCode: 403,
        code: 'YOUTUBE_MEMBERS_ONLY',
        terminal: true,
      };
    case 'age_restricted':
      return {
        message: 'This YouTube video is age-restricted. Importing it requires signed-in YouTube cookies on the server, so upload the file directly instead.',
        statusCode: 403,
        code: 'YOUTUBE_AGE_RESTRICTED',
        terminal: true,
      };
    case 'login_required':
      return {
        message: 'This YouTube video requires a signed-in account to watch, so it cannot be imported. Upload the file directly instead.',
        statusCode: 403,
        code: 'YOUTUBE_LOGIN_REQUIRED',
        terminal: true,
      };
    case 'drm_protected':
      return {
        message: 'This YouTube video is DRM-protected and cannot be downloaded.',
        statusCode: 403,
        code: 'YOUTUBE_DRM_PROTECTED',
        terminal: true,
      };
    case 'live_in_progress':
      return {
        message: 'This YouTube video is currently live. Wait until the stream ends and its recording is published, then import it again.',
        statusCode: 409,
        code: 'YOUTUBE_LIVE_IN_PROGRESS',
        terminal: true,
      };
    case 'live_not_recorded':
      return {
        message: 'This YouTube live stream has no downloadable recording available.',
        statusCode: 404,
        code: 'YOUTUBE_LIVE_NOT_AVAILABLE',
        terminal: true,
      };
    case 'premiere_pending':
      return {
        message: 'This YouTube video has not premiered yet. Import it again once it is live.',
        statusCode: 409,
        code: 'YOUTUBE_PREMIERE_PENDING',
        terminal: true,
      };
    case 'still_processing':
      return {
        message: 'YouTube is still processing this video, so it cannot be downloaded yet. Try again in a few minutes.',
        statusCode: 409,
        code: 'YOUTUBE_STILL_PROCESSING',
        terminal: true,
      };
    case 'not_a_video':
      return {
        message: 'That link does not point to a single downloadable YouTube video. Paste a standard video URL (youtube.com/watch?v=... or youtu.be/...).',
        statusCode: 400,
        code: 'YOUTUBE_UNSUPPORTED_URL',
        terminal: true,
      };
    case 'too_large':
      return {
        message: maxMb
          ? `This YouTube video is larger than the maximum allowed size of ${maxMb} MB. Import a shorter time range instead.`
          : 'This YouTube video is larger than the maximum allowed size. Import a shorter time range instead.',
        statusCode: 413,
        code: 'YOUTUBE_FILE_TOO_LARGE',
        terminal: true,
      };
    case 'timeout':
      return {
        message: 'The YouTube download timed out before it finished. Try again, or import a shorter time range.',
        statusCode: 504,
        code: 'YOUTUBE_TIMEOUT',
        terminal: true,
      };
    case 'downloader_missing':
      return {
        message: 'The video downloader is not installed on the server, so YouTube links cannot be imported right now.',
        statusCode: 500,
        code: 'YOUTUBE_DOWNLOADER_UNAVAILABLE',
        terminal: true,
      };
    case 'bot_challenge':
      return {
        message: 'YouTube is challenging our server as a suspected bot and refused to serve this video. Configure YOUTUBE_COOKIES on the server, or upload the file directly.',
        statusCode: 429,
        code: 'YOUTUBE_BOT_CHALLENGE',
        terminal: false,
      };
    case 'rate_limited':
      return {
        message: 'YouTube is rate-limiting our server right now. Wait a few minutes and try this import again.',
        statusCode: 429,
        code: 'YOUTUBE_RATE_LIMITED',
        terminal: false,
      };
    case 'format_unavailable':
      return {
        message: 'YouTube did not offer any downloadable video format for this link. This usually means the downloader needs updating on the server.',
        statusCode: 502,
        code: 'YOUTUBE_FORMAT_UNAVAILABLE',
        terminal: false,
      };
    case 'extractor_stale':
      // Two causes produce this and we cannot tell them apart from the output alone: the
      // downloader being behind YouTube's current player, or YouTube refusing to hand our
      // server a player response at all (routine for datacenter IPs without cookies). Naming
      // only the first one sends operators to update an already-current downloader.
      return {
        message:
          'YouTube would not return playable data for this video to our server. Either the downloader needs updating, or YouTube is refusing our server and YOUTUBE_COOKIES needs configuring. Uploading the file directly will work in the meantime.',
        statusCode: 502,
        code: 'YOUTUBE_EXTRACTOR_STALE',
        terminal: false,
      };
    case 'network':
      return {
        message: 'We could not reach YouTube to download this video. Check the server network and try again.',
        statusCode: 502,
        code: 'YOUTUBE_NETWORK_ERROR',
        terminal: false,
      };
    case 'unavailable':
      return {
        message: 'YouTube reports this video as unavailable, so it cannot be imported.',
        statusCode: 404,
        code: 'YOUTUBE_VIDEO_UNAVAILABLE',
        terminal: false,
      };
    case 'unknown':
    default:
      return {
        message: reason
          ? `YouTube refused this download: ${reason}`
          : 'The YouTube download failed for an unrecognised reason. The server logs hold the downloader output.',
        statusCode: 502,
        code: 'YOUTUBE_DOWNLOAD_FAILED',
        terminal: false,
      };
  }
}

/**
 * Maps a failed yt-dlp invocation onto a single distinguishable cause.
 *
 * Deliberately never returns a "please verify the video is publicly accessible" style message:
 * every branch either names the real restriction on the video or says that our own extraction
 * stack is at fault.
 */
export function classifyYouTubeFailure(
  input: ClassifyYouTubeFailureInput,
  ctx: ClassifyYouTubeFailureContext = {}
): YouTubeFailure {
  const stderr = String(input.stderr || '');
  const message = stripEchoedCommand(String(input.message || ''));
  const haystack = [stderr, String(input.stdout || ''), message].join('\n');
  const reason = extractYtDlpReason(stderr) || extractYtDlpReason(message);

  // A killed child process is our own timeout, which yt-dlp never gets to explain in stderr.
  const timedOut =
    input.killed === true ||
    input.errCode === 'ETIMEDOUT' ||
    input.signal === 'SIGTERM' ||
    input.signal === 'SIGKILL';

  // max-filesize aborts also kill the process, so let an explicit size abort win over the timeout.
  const sizeAborted = /file is larger than max-filesize|aborting because of max.?filesize/i.test(haystack);

  if (timedOut && !sizeAborted) {
    const d = describe('timeout', reason, ctx);
    return { kind: 'timeout', reason, ...d };
  }

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) {
      const d = describe(rule.kind, reason, ctx);
      return { kind: rule.kind, reason, ...d };
    }
  }

  // Generic unavailability is checked last so the specific causes above can claim it first.
  if (/video unavailable|this video is unavailable|video is unavailable/i.test(haystack)) {
    const d = describe('unavailable', reason, ctx);
    return { kind: 'unavailable', reason, ...d };
  }

  const d = describe('unknown', reason, ctx);
  return { kind: 'unknown', reason, ...d };
}

/** Builds the AppError that the API surfaces for a classified failure. */
export function toAppError(failure: YouTubeFailure): AppError {
  return new AppError(failure.message, failure.statusCode, failure.code);
}

/**
 * Picks the failure worth reporting after every retry profile has been exhausted, so a vague
 * "unavailable" from one client never hides a precise "bot challenge" from another.
 */
export function mostInformativeFailure(failures: YouTubeFailure[]): YouTubeFailure | undefined {
  return failures.reduce<YouTubeFailure | undefined>((best, cur) => {
    if (!best) return cur;
    return REPORTING_PRIORITY[cur.kind] > REPORTING_PRIORITY[best.kind] ? cur : best;
  }, undefined);
}
