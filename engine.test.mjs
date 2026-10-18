import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {seed,runRoom} from '../server/engine.mjs';
process.env.TZ='Europe/Samara';
function controls(html){const dom=new JSDOM(html);const fields={};dom.window.document.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{if(!el.readOnly&&el.type!=='file')fields[el.id]=el.type==='checkbox'?el.checked:el.value});dom.window.close();return fields}
function harness(){let room=seed('Тестовая семья','Организатор'),actor=room.members[0].id,ui={},out;return {get room(){return room},get actor(){return actor},get out(){return out},async open(){out=await runRoom(room,actor,ui);room=out.room;ui=out.ui;return out},async act(action,id='',fields={},confirmed=true){out=await runRoom(room,actor,ui,{action,id,fields:{...controls(out.html),...fields},confirmed});if(out.room){room=out.room;ui=out.ui}return out},switch(id){actor=id;ui={}},add(name,role='member'){const p=structuredClone(room.members[0]);Object.assign(p,{id:crypto.randomUUID(),name,role,stars:0,total:0});room.members.push(p);return p.id}}}
test('household workflow, role enforcement, tasks, timer, imports, events and votes',async()=>{
 const h=harness();await h.open();assert(!h.out.html.includes('suggest-minutes'));assert(h.out.html.includes('С чего начать'));
 const organizer=h.actor,alice=h.add('Алиса'),bob=h.add('Борис');
 await assert.rejects(()=>h.act('switch-person',alice));
 await h.act('new-task');await h.act('save-task','',{'task-title':'Выгрузить посудомойку','task-owner':'','task-quality':false});
 const task=h.room.tasks[0];assert.equal(task.title,'Выгрузить посудомойку');
 await h.act('tab','today');assert(h.out.html.includes('Беру'));
 await h.act('take',task.id);await h.act('timer-open',task.id);await h.act('timer-start',task.id,{'timer-duration':'20'});assert(h.room.tasks[0].timerEnd>Date.now());
 await h.act('timer-pause',task.id);await h.act('done',task.id);assert.equal(h.room.tasks[0].status,'done');assert.equal(h.room.members[0].stars,1);
 await assert.rejects(()=>h.act('done',task.id));
 await h.act('tab','more');await h.act('tab','spaces');await h.act('space-add','',{'space-name':'Кухня'});assert.equal(h.room.spaces[0].name,'Кухня');
 await h.act('tab','more');await h.act('tab','import');
 await h.act('parse-import','',{bulk:'Полить цветы\nПокормить собак'});assert(h.out.html.includes('import-confirm'));
 await h.act('import-confirm');assert.equal(h.room.tasks.length,3);
 await h.act('tab','more');await h.act('tab','import');await assert.rejects(()=>h.act('parse-import','',{bulk:'[{"title":"X","script":"process.exit()"}]'}));
 await h.open();await h.act('tab','calendar');await h.act('new-event');await h.act('event-save','',{'event-title':'Театр','event-at':'2026-12-01T18:00'});assert.equal(h.room.events[0].title,'Театр');
 await h.act('tab','chat');await h.act('chat-send','',{'chat-text':'<script>alert(1)</script>'});assert(h.out.html.includes('&lt;script&gt;'));assert(!h.out.html.includes('<script>alert'));
 await h.act('tab','more');await h.act('tab','family');assert(!h.out.html.includes('switch-person'));assert(!h.out.html.includes('member-add'));
 await h.act('rotate-code');const old=h.room.code;await h.act('rotate-code-confirm');assert.notEqual(h.room.code,old);assert.match(h.room.code,/^[A-Z2-9]{10}$/);
 await assert.rejects(()=>h.act('vote-open',organizer));
 h.switch(alice);await h.open();await assert.rejects(()=>h.act('room-save','',{'settings-room':'hacked'}));
 await h.act('tab','more');await h.act('tab','family');await h.act('vote-open',bob);await h.act('vote-start',bob,{'vote-reason':'Проверка исключения'});const vote=h.room.votes[0];await h.act('vote-yes',vote.id);
 h.switch(organizer);await h.open();await h.act('tab','more');await h.act('tab','family');await h.act('vote-yes',vote.id);assert.equal(h.room.members.find(x=>x.id===bob).active,false);
 h.switch(bob);await assert.rejects(()=>h.open());
});
export {harness,controls};
test('templates, assignments, transfers, rewards, reviews and personal restrictions',async()=>{
 const h=harness();await h.open();const org=h.actor,alice=h.add('Алиса'),child=h.add('Миша','child');
 await h.act('tab','more');await h.act('tab','templates');await h.act('starter-templates');assert.equal(h.room.templates.length,19);await h.act('starter-templates');assert.equal(h.room.templates.length,19);
 await h.act('new-template');await h.act('save-task','',{'task-title':'Пыль раз в неделю','task-owner':alice,'tpl-frequency':'weekly','week-1':true,'tpl-enabled':false});assert.equal(h.room.templates.length,20);assert.equal(h.room.templates.at(-1).accepted,false);
 await h.act('tab','today');await h.act('new-task');await h.act('save-task','',{'task-title':'Уборка кухни','task-owner':alice,'task-quality':true});const task=h.room.tasks.at(-1);
 h.switch(alice);await h.open();await h.act('accept',task.id);await h.act('return-open',task.id);await h.act('return-confirm',task.id,{'return-to':org});assert.equal(h.room.tasks.at(-1).owner,null);
 h.switch(org);await h.open();await h.act('transfer-accept',task.id);assert.equal(h.room.tasks.at(-1).owner,org);
 // Ask for review on each completion for a focused quality scenario.
 await h.act('tab','settings');await h.act('rules-save','',{'rule-every':'1'});
 await h.act('tab','today');await h.act('done',task.id);await h.act('self',task.id+'|5');assert.equal(h.room.tasks.at(-1).reviewer,alice);
 h.switch(alice);await h.open();await h.act('tab','more');await h.act('tab','reviews');await h.act('review',task.id+'|1');assert.equal(h.room.tasks.at(-1).penaltyApplied,true);assert.equal(h.room.members[0].stars,0);
 await h.act('review',task.id+'|5');assert.equal(h.room.tasks.at(-1).penaltyApplied,false);assert.equal(h.room.members[0].stars,1);
 await h.act('tab','settings');await h.act('profile-save','',{'profile-name':'Алиса','blocked':'полить','pref-phrases':false});assert.equal(h.room.members.find(p=>p.id===alice).blocked,'полить');
 h.switch(child);await h.open();await h.act('tab','more');await h.act('tab','rewards');await h.act('goal-save','',{'goal-name':'Кино','goal-cost':'5'});assert(h.room.members.find(p=>p.id===child).goalRequest);
 h.switch(org);await h.open();await h.act('tab','more');await h.act('tab','rewards');await h.act('goal-approve',child);assert.equal(h.room.members.find(p=>p.id===child).goal,'Кино');
 await h.act('adjust-stars','',{'adjust-person':child,'adjust-delta':'5','adjust-reason':'Помог по дому'});await h.act('redeem',child);assert.equal(h.room.members.find(p=>p.id===child).stars,0);
 await h.act('tab','more');await h.act('tab','memory');await h.act('memory-save','',{'memory-text':'Поливаем цветы по вторникам.'});assert.equal(h.room.memory,'Поливаем цветы по вторникам.');
});
test('expired timer offers extension, session rewards cannot be duplicated, destructive actions confirm',async()=>{
 const h=harness();await h.open();await h.act('new-task');await h.act('save-task','',{'task-title':'Разобрать шкаф','task-owner':h.actor,'task-quality':false});const id=h.room.tasks[0].id;
 await h.act('timer-open',id);await h.act('timer-start',id,{'timer-duration':'20'});h.room.tasks[0].timerEnd=Date.now()-1000;await h.open();assert(h.out.html.includes('timer-extend'));
 await h.act('timer-extend',id);assert(h.room.tasks[0].timerEnd>Date.now());h.room.tasks[0].timerEnd=Date.now()-1000;await h.open();await h.act('session-end',id);assert.equal(h.room.members[0].stars,1);
 await h.act('done',id);assert.equal(h.room.members[0].stars,1);
 await h.act('tab','more');await h.act('tab','spaces');await h.act('space-add','',{'space-name':'Кладовая'});const space=h.room.spaces[0].id;const preview=await h.act('space-delete',space,{},false);assert(preview.confirmation);assert.equal(h.room.spaces.length,1);
 await h.open();await h.act('space-delete',space,{},true);assert.equal(h.room.spaces.length,0);
});
