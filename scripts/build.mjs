import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await writeFile('server/household-source.mjs','export default '+JSON.stringify(await readFile('src/household.js','utf8'))+';\n');
for(const file of ['server/api.mjs','server/engine.mjs','server/security.mjs','server/household-source.mjs','netlify/functions/api.mjs','public/client.js']){
 const check=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(check.status)process.exit(check.status);
}
const html=await readFile('public/index.html','utf8');if(!html.includes('/client.js'))throw Error('Missing client entry');
console.log('Netlify bundle source and static entry checked. Database migrations are applied by Netlify.');
