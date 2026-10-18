import {JSDOM} from 'jsdom';
import {Script} from 'node:vm';
import source from './household-source.mjs';
// Only this bundled, developer-owned source is executed. Imported text is never code.
const program=new Script(source,{filename:'household.js'});
const blocked=new Set(['entry','profiles','login','local-profile','create-room','join-room','logout','switch-person','member-add','backup-check','backup-restore','export','undo','suggest-tasks']);
export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function runtime(){
 const dom=new JSDOM('<!doctype html><html><body><div id="dv-app"></div></body></html>',{url:'https://household.invalid',runScripts:'outside-only'});
 Object.assign(dom.window,{structuredClone,TextEncoder,TextDecoder});
 dom.window.scrollTo=()=>{};
 program.runInContext(dom.getInternalVMContext(),{timeout:3000});
 return dom;
}
export function seed(name,person){const dom=runtime();try{return structuredClone(dom.window.__engine.seed(name,person));}finally{dom.window.close()}}
function clean(dom){
 const root=dom.window.document.getElementById('dv-app');
 root.querySelectorAll('button[data-action]').forEach(el=>{if(blocked.has(el.dataset.action)){
   const section=el.dataset.action==='member-add'?el.closest('section'):null;
   if(section)section.remove();else el.remove();
 }});
 return root;
}
export async function runRoom(room,actor,ui={},request=null){
 if(!room.members.some(p=>p.id===actor&&p.active))throw new AppError('Вы больше не участник комнаты',403);
 const dom=runtime();try{
 const engine=dom.window.__engine;
 engine.init(structuredClone(room),actor,structuredClone(ui));
 let root=clean(dom),confirmation=null;
 dom.window.confirm=message=>{if(request?.confirmed===true)return true;confirmation=message;return false;};
 if(request){
  const {action,id='',fields={}}=request;
  if(typeof action!=='string'||typeof id!=='string'||id.length>240||blocked.has(action)||action.startsWith('account-'))throw new AppError('Действие недоступно',403);
  const control=Array.from(root.querySelectorAll('button[data-action]')).find(b=>b.dataset.action===action&&(b.dataset.id||'')===id&&!b.disabled);
  if(!control)throw new AppError('Действие уже недоступно. Обновите страницу.',409);
  if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).length>1000)throw new AppError('Неверная форма');
  for(const [key,value] of Object.entries(fields)){
   const el=dom.window.document.getElementById(key);
   if(!el||!root.contains(el)||!['INPUT','SELECT','TEXTAREA'].includes(el.tagName)||el.disabled||el.readOnly||el.type==='file')continue;
   if(el.type==='checkbox'){if(typeof value!=='boolean')throw new AppError('Неверный переключатель');el.checked=value;continue;}
   if(typeof value!=='string'||value.length>(el.maxLength>0?el.maxLength:1048576))throw new AppError('Слишком длинное поле');
   if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===value))throw new AppError('Неизвестное значение');
   el.value=value;
   if(!el.validity.valid)throw new AppError('Проверьте поле «'+(el.closest('label')?.textContent||key).slice(0,80)+'»');
  }
  if(['vote-open','vote-start'].includes(action)&&room.members.find(p=>p.id===id)?.role==='organizer')throw new AppError('Создателя комнаты нельзя исключить',403);
  try{await engine.act(action,id)}catch(error){throw new AppError(error.message||'Проверьте введённые данные')}
 }
 root=clean(dom);
 const out=engine.result();out.html=root.innerHTML;
 if(confirmation)return {confirmation};
 engine.validate(out.room);
 if(out.room.members.filter(p=>p.active&&p.role==='organizer').length!==1||out.room.members.find(p=>p.role==='organizer')?.id!==room.members.find(p=>p.role==='organizer')?.id)throw new AppError('Организатором остаётся создатель комнаты',403);
 if(JSON.stringify(out.room).length>8000000)throw new AppError('Комната достигла лимита данных. Экспортируйте историю.');
 return structuredClone(out);
 }finally{dom.window.close()}
}
