import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyYouTubeFailure,
  extractYtDlpReason,
  mostInformativeFailure,
  toAppError,
  type YouTubeFailure,
  type YouTubeFailureKind,
} from '../utils/youtubeErrorClassifier.js';

/**
 * The strings below are the messages yt-dlp actually prints (either its own, or YouTube's
 * playability reason passed through verbatim). They are the contract this classifier is written
 * against, so they are reproduced here literally rather than paraphrased.
 */

const MASKING_PHRASES = [
  'publicly accessible',
  'verify that the video is public',
  'Please verify',
];

function classifyStderr(stderr: string, maxBytes?: number): YouTubeFailure {
  return classifyYouTubeFailure({ stderr }, maxBytes ? { maxBytes } : {});
}

test('every distinguishable YouTube failure gets its own kind, code and status', () => {
  const cases: Array<{
    label: string;
    stderr: string;
    kind: YouTubeFailureKind;
    code: string;
    statusCode: number;
    terminal: boolean;
  }> = [
    {
      label: 'private video',
      stderr: "ERROR: [youtube] abcdefghijk: Private video. Sign in if you've been granted access to this video",
      kind: 'private',
      code: 'YOUTUBE_PRIVATE_VIDEO',
      statusCode: 403,
      terminal: true,
    },
    {
      label: 'removed by uploader',
      stderr: 'ERROR: [youtube] abcdefghijk: Video unavailable. This video has been removed by the uploader',
      kind: 'removed',
      code: 'YOUTUBE_VIDEO_REMOVED',
      statusCode: 404,
      terminal: true,
    },
    {
      label: 'terminated account',
      stderr:
        'ERROR: [youtube] abcdefghijk: This video is no longer available because the YouTube account associated with this video has been terminated.',
      kind: 'account_terminated',
      code: 'YOUTUBE_ACCOUNT_TERMINATED',
      statusCode: 404,
      terminal: true,
    },
    {
      label: 'geo blocked',
      stderr:
        'ERROR: [youtube] abcdefghijk: Video unavailable. The uploader has not made this video available in your country',
      kind: 'geo_blocked',
      code: 'YOUTUBE_GEO_BLOCKED',
      statusCode: 451,
      terminal: true,
    },
    {
      label: 'copyright blocked',
      stderr:
        'ERROR: [youtube] abcdefghijk: Video unavailable. This video contains content from WMG, who has blocked it on copyright grounds.',
      kind: 'copyright_blocked',
      code: 'YOUTUBE_COPYRIGHT_BLOCKED',
      statusCode: 451,
      terminal: true,
    },
    {
      label: 'members only',
      stderr: 'ERROR: [youtube] abcdefghijk: Join this channel to get access to members-only content',
      kind: 'members_only',
      code: 'YOUTUBE_MEMBERS_ONLY',
      statusCode: 403,
      terminal: true,
    },
    {
      label: 'age restricted',
      stderr: 'ERROR: [youtube] abcdefghijk: Sign in to confirm your age. This video may be inappropriate for some users.',
      kind: 'age_restricted',
      code: 'YOUTUBE_AGE_RESTRICTED',
      statusCode: 403,
      terminal: true,
    },
    {
      label: 'login required',
      stderr: 'ERROR: [youtube] abcdefghijk: Sign in to view this video',
      kind: 'login_required',
      code: 'YOUTUBE_LOGIN_REQUIRED',
      statusCode: 403,
      terminal: true,
    },
    {
      label: 'drm protected',
      stderr: 'ERROR: [youtube] abcdefghijk: This video is DRM protected',
      kind: 'drm_protected',
      code: 'YOUTUBE_DRM_PROTECTED',
      statusCode: 403,
      terminal: true,
    },
    {
      label: 'live recording absent',
      stderr: 'ERROR: [youtube] abcdefghijk: This live stream recording is not available.',
      kind: 'live_not_recorded',
      code: 'YOUTUBE_LIVE_NOT_AVAILABLE',
      statusCode: 404,
      terminal: true,
    },
    {
      label: 'still processing',
      stderr: "ERROR: [youtube] abcdefghijk: We're processing this video. Check back later.",
      kind: 'still_processing',
      code: 'YOUTUBE_STILL_PROCESSING',
      statusCode: 409,
      terminal: true,
    },
    {
      label: 'premiere pending',
      stderr: 'ERROR: [youtube] abcdefghijk: Premieres in 3 hours',
      kind: 'premiere_pending',
      code: 'YOUTUBE_PREMIERE_PENDING',
      statusCode: 409,
      terminal: true,
    },
    {
      label: 'unsupported url',
      stderr: 'ERROR: Unsupported URL: https://example.com/not-a-video',
      kind: 'not_a_video',
      code: 'YOUTUBE_UNSUPPORTED_URL',
      statusCode: 400,
      terminal: true,
    },
    {
      label: 'bot challenge',
      stderr: "ERROR: [youtube] abcdefghijk: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies.",
      kind: 'bot_challenge',
      code: 'YOUTUBE_BOT_CHALLENGE',
      statusCode: 429,
      terminal: false,
    },
    {
      label: 'rate limited',
      stderr: 'ERROR: unable to download video data: HTTP Error 429: Too Many Requests',
      kind: 'rate_limited',
      code: 'YOUTUBE_RATE_LIMITED',
      statusCode: 429,
      terminal: false,
    },
    {
      label: 'format unavailable',
      stderr:
        'ERROR: [youtube] abcdefghijk: Requested format is not available. Use --list-formats for a list of available formats',
      kind: 'format_unavailable',
      code: 'YOUTUBE_FORMAT_UNAVAILABLE',
      statusCode: 502,
      terminal: false,
    },
    {
      label: 'stale extractor',
      stderr: 'ERROR: [youtube] abcdefghijk: The page needs to be reloaded.',
      kind: 'extractor_stale',
      code: 'YOUTUBE_EXTRACTOR_STALE',
      statusCode: 502,
      terminal: false,
    },
    {
      label: 'network failure',
      stderr: 'ERROR: [youtube] abcdefghijk: Unable to download webpage: <urlopen error [Errno -3] Temporary failure in name resolution>',
      kind: 'network',
      code: 'YOUTUBE_NETWORK_ERROR',
      statusCode: 502,
      terminal: false,
    },
    {
      label: 'generic unavailable',
      stderr: 'ERROR: [youtube] abcdefghijk: Video unavailable',
      kind: 'unavailable',
      code: 'YOUTUBE_VIDEO_UNAVAILABLE',
      statusCode: 404,
      terminal: false,
    },
  ];

  for (const c of cases) {
    const f = classifyStderr(c.stderr);
    assert.equal(f.kind, c.kind, `${c.label}: expected kind ${c.kind}, got ${f.kind}`);
    assert.equal(f.code, c.code, `${c.label}: expected code ${c.code}, got ${f.code}`);
    assert.equal(f.statusCode, c.statusCode, `${c.label}: wrong status`);
    assert.equal(f.terminal, c.terminal, `${c.label}: wrong terminal flag`);
    assert.ok(f.message.length > 20, `${c.label}: message too short to be useful`);
  }

  // Each distinguishable cause must map to a distinct code — that is the whole point of the
  // change, since one generic code previously covered all of them.
  const codes = cases.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length, 'every classified cause needs its own code');
});

test('the generic "publicly accessible" message is never produced for any failure', () => {
  const samples = [
    "ERROR: [youtube] abcdefghijk: Private video. Sign in if you've been granted access to this video",
    'ERROR: [youtube] abcdefghijk: Video unavailable. The uploader has not made this video available in your country',
    'ERROR: [youtube] abcdefghijk: Requested format is not available',
    'ERROR: [youtube] abcdefghijk: Sign in to confirm your age',
    'ERROR: something nobody has ever seen before',
    '',
  ];

  for (const stderr of samples) {
    const f = classifyStderr(stderr);
    for (const phrase of MASKING_PHRASES) {
      assert.ok(
        !f.message.toLowerCase().includes(phrase.toLowerCase()),
        `message for ${JSON.stringify(stderr)} still masks the cause with "${phrase}": ${f.message}`
      );
    }
  }
});

test('specific causes win over the generic "Video unavailable" prefix they share', () => {
  // All three of these begin with "Video unavailable"; ordering decides whether the user is told
  // the real reason or a useless generic one.
  assert.equal(
    classifyStderr('ERROR: [youtube] x: Video unavailable. The uploader has not made this video available in your country').kind,
    'geo_blocked'
  );
  assert.equal(
    classifyStderr('ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader').kind,
    'removed'
  );
  assert.equal(classifyStderr('ERROR: [youtube] x: Video unavailable').kind, 'unavailable');
});

test('bot challenge is not confused with age restriction', () => {
  // Both say "Sign in to confirm ..." and previously shared one message.
  assert.equal(classifyStderr("ERROR: Sign in to confirm you're not a bot").kind, 'bot_challenge');
  assert.equal(classifyStderr('ERROR: Sign in to confirm you’re not a bot').kind, 'bot_challenge', 'curly apostrophe');
  assert.equal(classifyStderr('ERROR: Sign in to confirm your age').kind, 'age_restricted');
});

test('process-level failures are classified without any yt-dlp stderr', () => {
  const timedOut = classifyYouTubeFailure({ killed: true, signal: 'SIGTERM', message: 'spawn timeout' });
  assert.equal(timedOut.kind, 'timeout');
  assert.equal(timedOut.code, 'YOUTUBE_TIMEOUT');
  assert.equal(timedOut.terminal, true);

  const missing = classifyYouTubeFailure({
    message: 'spawn /usr/bin/yt-dlp ENOENT',
    errCode: 'ENOENT',
  });
  assert.equal(missing.kind, 'downloader_missing');
  assert.equal(missing.code, 'YOUTUBE_DOWNLOADER_UNAVAILABLE');

  const noModule = classifyYouTubeFailure({ stderr: '/usr/bin/python3: No module named yt_dlp' });
  assert.equal(noModule.kind, 'downloader_missing');
});

test('a max-filesize abort is reported as too large, not as a timeout', () => {
  // yt-dlp aborts the process on a size cap, so `killed` is set too; size must win.
  const f = classifyYouTubeFailure(
    {
      stderr: 'ERROR: File is larger than max-filesize (600000000 bytes > 524288000 bytes). Aborting.',
      killed: true,
      signal: 'SIGTERM',
    },
    { maxBytes: 500 * 1024 * 1024 }
  );
  assert.equal(f.kind, 'too_large');
  assert.equal(f.code, 'YOUTUBE_FILE_TOO_LARGE');
  assert.ok(f.message.includes('500 MB'), `expected the cap in the message, got: ${f.message}`);
});

test('our own CLI flags echoed back by child_process never drive the classification', () => {
  // Regression: child_process prefixes the message with "Command failed: <argv>", which includes
  // `--max-filesize 500M`. That once made an unavailable video report as YOUTUBE_FILE_TOO_LARGE.
  const echoed =
    'Command failed: /app/yt-dlp --no-warnings --no-playlist --max-filesize 500M ' +
    '--extractor-args youtube:player_client=default,web_safari -f best https://www.youtube.com/watch?v=x\n' +
    'ERROR: [youtube] x: This video is unavailable';

  const f = classifyYouTubeFailure(
    { message: echoed, stderr: 'ERROR: [youtube] x: This video is unavailable' },
    { maxBytes: 500 * 1024 * 1024 }
  );
  assert.equal(f.kind, 'unavailable', `classified from our own flags: ${f.kind}`);
  assert.equal(f.code, 'YOUTUBE_VIDEO_UNAVAILABLE');

  // Same hazard via the timeout path: a killed process plus the echoed flag is not a size abort.
  const killed = classifyYouTubeFailure(
    { message: echoed, killed: true, signal: 'SIGTERM' },
    { maxBytes: 500 * 1024 * 1024 }
  );
  assert.equal(killed.kind, 'timeout', `expected timeout, got ${killed.kind}`);
});

test('an unrecognised failure surfaces the real yt-dlp reason instead of a guess', () => {
  const f = classifyStderr('ERROR: [youtube] dQw4w9WgXcQ: Something entirely new broke');
  assert.equal(f.kind, 'unknown');
  assert.ok(
    f.message.includes('Something entirely new broke'),
    `the actual reason must reach the user, got: ${f.message}`
  );
  // The bare video id is yt-dlp noise and must not leak into the UI.
  assert.ok(!f.message.includes('dQw4w9WgXcQ'), `video id leaked: ${f.message}`);
});

test('extractYtDlpReason strips yt-dlp prefixes, hints and self-update nags', () => {
  assert.equal(
    extractYtDlpReason('ERROR: [youtube] dQw4w9WgXcQ: Requested format is not available. Use --list-formats for a list of available formats'),
    'Requested format is not available.'
  );
  assert.equal(extractYtDlpReason('[download] Destination: x.mp4\nERROR: [youtube] Video unavailable'), 'Video unavailable');
  // Progress chatter carries no reason at all.
  assert.equal(extractYtDlpReason('[download] Destination: x.mp4\n[download] 100% of 1.00MiB'), undefined);
  // Last resort: a line that merely mentions an error is still better than nothing.
  assert.equal(extractYtDlpReason('unable to continue: upstream error while muxing'), 'unable to continue: upstream error while muxing');
});

test('mostInformativeFailure prefers the actionable cause over a vague one', () => {
  const vague = classifyStderr('ERROR: [youtube] x: Video unavailable');
  const bot = classifyStderr("ERROR: Sign in to confirm you're not a bot");
  const format = classifyStderr('ERROR: Requested format is not available');

  assert.equal(mostInformativeFailure([vague, bot, format])?.kind, 'bot_challenge');
  assert.equal(mostInformativeFailure([vague, format])?.kind, 'format_unavailable');
  assert.equal(mostInformativeFailure([])?.kind, undefined);
});

test('toAppError carries the classified message, status and code', () => {
  const f = classifyStderr('ERROR: [youtube] x: Join this channel to get access to members-only content');
  const err = toAppError(f);
  assert.equal(err.statusCode, 403);
  assert.equal(err.code, 'YOUTUBE_MEMBERS_ONLY');
  assert.equal(err.message, f.message);
  assert.equal(err.isOperational, true);
});
