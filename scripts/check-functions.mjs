import {zipFunctions} from '@netlify/zip-it-and-ship-it';
import {mkdir} from 'node:fs/promises';
await mkdir('.netlify/check-functions',{recursive:true});
const results=await zipFunctions('netlify/functions','.netlify/check-functions',{
 config:{'*':{nodeBundler:'esbuild',nodeVersion:'nodejs22.x',externalNodeModules:['jsdom']}},
});
for(const result of results)console.log(result.name+': packaged ('+result.runtime+')');
if(results.length!==2)throw Error('Expected API and scheduled reminders functions');
