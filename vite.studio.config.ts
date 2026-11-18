import {mergeConfig} from 'vite';
import baseConfig from './vite.config';
export default mergeConfig(typeof baseConfig==='function'?baseConfig({command:'build',mode:'production',isSsrBuild:false,isPreview:false}):baseConfig,{build:{outDir:'dist-studio',rollupOptions:{input:'studio-preparation.html'}}});
