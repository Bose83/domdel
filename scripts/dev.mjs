import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAPI} from '../server/api.mjs';
process.env.TZ='Europe/Samara';
await mkdir('.local',{recursive:true});
const db=new PGlite('.local/postgres');
const exists=await db.query("SELECT to_regclass('public.accounts') AS table_name");
if(!exists.rows[0].table_name)await db.exec(await readFile('netlify/database/migrations/202610180001_initial.sql','utf8'));
const pushExists=await db.query("SELECT to_regclass('public.push_subscriptions') AS table_name");
if(!pushExists.rows[0].table_name)await db.exec(await readFile('netlify/database/migrations/202610180002_push.sql','utf8'));
// PGlite is a single connection: serialize complete HTTP transactions locally.
let chain=Promise.resolve();
const pool={connect:async()=>({query:(s,p)=>db.query(s,p),release(){}}),query:(s,p)=>db.query(s,p)};
const handle=createAPI(pool);
createServer((req,res)=>{chain=chain.then(async()=>{try{
 if(req.url.startsWith('/api/')){const parts=[];for await(const part of req){parts.push(part);if(parts.reduce((n,b)=>n+b.length,0)>1200000){res.writeHead(413);res.end();return}}
 const request=new Request('http://localhost:8888'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});const response=await handle(request,{ip:req.socket.remoteAddress});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }else{const paths={'/':'index.html','/client.js':'client.js','/style.css':'style.css','/sw.js':'sw.js','/icon.svg':'icon.svg','/manifest.webmanifest':'manifest.webmanifest'};const file=paths[req.url.split('?')[0]];if(!file){res.writeHead(404);res.end();return}const mime={'html':'text/html; charset=utf-8','js':'text/javascript','css':'text/css','svg':'image/svg+xml','webmanifest':'application/manifest+json'};res.setHeader('Content-Type',mime[file.split('.').pop()]);res.end(await readFile('public/'+file));}
 }catch{res.writeHead(500);res.end('Local server error');}})}).listen(8888,()=>console.log('Дом вместе: http://localhost:8888 — локальная база, отдельная от Netlify'));
