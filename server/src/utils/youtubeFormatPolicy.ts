/** Source detail wins over container/codec convenience. A low-resolution H.264
 * stream must not hide a sharper supported stream. The 1080 ceiling is applied
 * to every alternative so a fallback cannot silently acquire 1440p/4K instead. */
export const YOUTUBE_SOURCE_FORMAT='bestvideo[height<=1080]+bestaudio/best[height<=1080]';
export const YOUTUBE_SOURCE_FORMAT_SORT='res:1080,fps,vcodec:h264,acodec:aac';
