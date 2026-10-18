import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
test('function loads when CommonJS cannot require ESM and reports missing database',()=>{
 const code=`delete process.env.NETLIFY_DB_URL;const {default:handler}=await import('./netlify/functions/api.mjs');const r=await handler(new Request('https://app.test/api/view'),{});const data=await r.json();if(r.status!==503||!data.error.includes('База данных'))process.exit(1);`;
 const result=spawnSync(process.execPath,['--no-experimental-require-module','--input-type=module','-e',code],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('client replaces loading screen with a retry screen on server failure',async()=>{
 const dom=new JSDOM('<div id="connection"></div><div id="dv-app">Открываем ваш дом…</div>',{url:'https://app.test',runScripts:'outside-only',pretendToBeVisual:true});
 try{dom.window.fetch=async()=>Response.json({error:'База данных ещё не подключена'},{status:503});dom.window.eval(await readFile('public/client.js','utf8'));
 for(let i=0;i<30&&!dom.window.document.getElementById('retry-connection');i++)await new Promise(r=>setTimeout(r,10));
 assert(dom.window.document.getElementById('retry-connection'));assert(!dom.window.document.getElementById('dv-app').textContent.includes('Открываем ваш дом'));assert(dom.window.document.getElementById('connection').textContent.includes('База данных'));
 }finally{dom.window.close()}
});
