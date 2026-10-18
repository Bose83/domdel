import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {createAPI} from '../server/api.mjs';
process.env.TZ='Europe/Samara';
test('client DOM to API: registration, recovery code, create room, task and remembered device',async()=>{
 const db=new PGlite();for(const file of ['202610180001_initial.sql','202610180002_push.sql'])await db.exec(await readFile('netlify/database/migrations/'+file,'utf8'));
 const handler=createAPI({connect:async()=>({query:(s,p)=>db.query(s,p),release(){}}),query:(s,p)=>db.query(s,p)});
 let cookie='';
 const script=await readFile('public/client.js','utf8');
 const open=()=>{const dom=new JSDOM('<div id="connection"></div><div id="dv-app"></div>',{url:'https://app.test',runScripts:'outside-only',pretendToBeVisual:true});dom.window.fetch=async(path,options={})=>{const req=new Request('https://app.test'+path,{...options,headers:{...options.headers,origin:'https://app.test',cookie}});const response=await handler(req,{ip:'browser'});if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response};dom.window.confirm=()=>true;dom.window.eval(script);return dom};
 let dom=open();
 const wait=async(predicate)=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20))}assert.fail(dom.window.document.body.textContent)};
 const click=selector=>{const el=dom.window.document.querySelector(selector);assert(el,selector);el.click()};
 const fill=(id,value)=>{const el=dom.window.document.getElementById(id);assert(el,id);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))};
 try{
 await wait(()=>dom.window.document.querySelector('[data-auth="register"]'));click('[data-auth="register"]');fill('auth-login','browseruser');fill('auth-name','Семья');fill('auth-password','browser-test-password');click('#auth-form button[type=submit]');
 await wait(()=>dom.window.document.querySelector('#recovery-code'));assert.match(dom.window.document.getElementById('recovery-code').value,/^[a-f0-9]{64}$/);click('[data-local="recovery-saved"]');
 await wait(()=>dom.window.document.querySelector('#create-form'));fill('room-name','Дом из браузера');click('#create-form button[type=submit]');
 await wait(()=>dom.window.document.querySelector('[data-action="new-task"]'));click('[data-action="new-task"]');
 await wait(()=>dom.window.document.querySelector('#task-title'));fill('task-title','Погулять с собакой');click('[data-action="save-task"]');
 await wait(()=>dom.window.document.querySelector('[data-action="take"]'));click('[data-action="take"]');await wait(()=>dom.window.document.querySelector('[data-action="done"]'));
 dom.window.close();dom=open();await wait(()=>dom.window.document.querySelector('[data-action="done"]'));assert(dom.window.document.body.textContent.includes('Дом из браузера'));
 assert(!dom.window.document.querySelector('#auth-form'));
 }finally{dom.window.close();await db.close()}
});
