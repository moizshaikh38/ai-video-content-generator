import fs from'node:fs';import path from'node:path';
process.env.VITE_API_URL='/api';
const root=process.cwd(),html=path.join(root,'qualification-studio-static.html');
fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module" src="/src/harness/localQualificationStudio.tsx"></script></body></html>');
try{const{build}=await import('vite');await build({root,build:{outDir:process.env.QUALIFICATION_STATIC_OUT||'/downloads/vireo-studio-fullcandidate-resume-0221/static',emptyOutDir:false,copyPublicDir:false,rollupOptions:{input:html}}});}finally{fs.unlinkSync(html)}
