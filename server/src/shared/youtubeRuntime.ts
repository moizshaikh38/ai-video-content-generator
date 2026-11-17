/** Use the installed server runtime, never auto-download executable scripts.
 * This repairs JS-runtime discovery only, not YouTube account/IP challenges.
 * PyPI yt-dlp must include matching default/EJS dependencies at installation. */
export function supportedYouTubeJsArgs(nodeVersion:string,nodePath:string):string[]{
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(nodeVersion);
 return match&&Number(match[1])>=22&&nodePath.length>0&&!/[\r\n\0]/.test(nodePath)
  ? ['--js-runtimes',`node:${nodePath}`,'--no-remote-components']:[];
}
