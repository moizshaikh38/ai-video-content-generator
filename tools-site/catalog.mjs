export const origin = 'https://vireoclip.vercel.app';
export const pages = [
 {slug:'',title:'Free video tools',short:'Video tools',description:'Small, useful tools for video creators. Convert subtitle files, calculate video dimensions and plan your own safe zones, right in your browser.',eyebrow:'THE CREATOR WORKBENCH',lines:['Less busywork.','More creating.'],kind:'hub'},
 {slug:'subtitle-converter',title:'SRT to VTT converter',short:'Subtitle converter',description:'Convert simple SRT and WebVTT subtitle files in your browser. Preview cue counts and download your converted captions without uploading a file.',eyebrow:'01 / CAPTIONS',lines:['Same words.','A new format.'],kind:'subtitles'},
 {slug:'aspect-ratio-calculator',title:'Video aspect ratio calculator',short:'Aspect ratio calculator',description:'Calculate a video aspect ratio and matching dimensions. Compare portrait, square and landscape canvas sizes without uploading your footage.',eyebrow:'02 / FRAMING',lines:['Find your','frame size.'],kind:'ratio'},
 {slug:'safe-zone-planner',title:'Video safe zone planner',short:'Safe zone planner',description:'Plan custom guide margins on a vertical, square or landscape video canvas. Preview a local still and download a transparent PNG guide.',eyebrow:'03 / COMPOSITION',lines:['Give your','story room.'],kind:'safe'},
];
export const pathFor = p => '/tools/' + (p.slug ? p.slug+'/' : '');
