import {subscriptionAction} from './push.mjs';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {seed,runRoom,AppError} from './engine.mjs';
import {randomToken,hash,encodePassword,verifyPassword,cookie,tokenFrom,lifetime,limit} from './security.mjs';
const ok=(data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const text=(v,max,min=1)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)throw new AppError('Проверьте длину введённого текста');return v.trim()};
async function body(req){if(Number(req.headers.get('content-length')||0)>1200000)throw new AppError('Запрос слишком большой',413);if(!req.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Нужен JSON',415);const reader=req.body?.getReader();if(!reader)return {};let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1200000){await reader.cancel();throw new AppError('Запрос слишком большой',413)}parts.push(value)}try{return JSON.parse(Buffer.concat(parts).toString())}catch{throw new AppError('Неверный JSON')}}
export function createAPI(pool){return async function handle(req,context={}){
 let client,tx=false;
 try{
 const path=new URL(req.url).pathname.replace(/^\/api\/?/,'');
 if(!['GET','POST'].includes(req.method))return ok({error:'Метод не поддерживается'},405);
 if(req.method==='POST'&&req.headers.get('origin')!==new URL(req.url).origin)throw new AppError('Запрос с другого сайта запрещён',403);
 const a=req.method==='POST'?await body(req):{};
 // Netlify supplies context.ip; never trust a user-supplied X-Forwarded-For.
 const ip=context.ip||'local';
 client=await pool.connect();
 if(!await limit(client,'all:'+ip,600,60000))throw new AppError('Слишком много запросов. Подождите минуту.',429);
 if(['register','login','recover'].includes(path)&&req.method==='POST'){
  const login=text(a.login,40,3).toLowerCase();if(!/^[a-z0-9_.-]+$/.test(login))throw new AppError('Логин: 3–40 латинских букв, цифр, точек, дефисов или подчёркиваний');
  if(!await limit(client,'auth-ip:'+ip,35)||!await limit(client,'auth-login:'+login,12))throw new AppError('Слишком много попыток. Попробуйте через 15 минут.',429);
  const password=text(a.password,128,12);
  let {rows:[user]}=await client.query('SELECT * FROM accounts WHERE login=$1',[login]);
  let recovery=null;
  if(path==='register'){
   if(user)throw new AppError('Логин недоступен. Выберите другой или войдите.');
   const name=text(a.name,60);recovery=randomToken();
   user={id:randomUUID(),name,login};
   const encoded=await encodePassword(password);
   await client.query('BEGIN');tx=true;
   await client.query('INSERT INTO accounts(id,login,name,password_hash,recovery_hash,created_at) VALUES($1,$2,$3,$4,$5,$6)',[user.id,login,name,encoded,hash(recovery),Date.now()]);
  }else if(path==='login'){
   await client.query('BEGIN');tx=true;
   ({rows:[user]}=await client.query('SELECT * FROM accounts WHERE login=$1 FOR UPDATE',[login]));
   const valid=await verifyPassword(password,user?.password_hash);if(!user||!valid)throw new AppError('Неверный логин или пароль',401);
  }else{
   const provided=typeof a.recovery==='string'?a.recovery.trim():'';
   if(!/^[a-f0-9]{64}$/.test(provided)||!user||hash(provided)!==user.recovery_hash)throw new AppError('Неверный логин или код восстановления',401);
   const oldRecovery=user.recovery_hash;recovery=randomToken();const encoded=await encodePassword(password);
   await client.query('BEGIN');tx=true;
   const changed=await client.query('UPDATE accounts SET password_hash=$1,recovery_hash=$2 WHERE id=$3 AND recovery_hash=$4 RETURNING id',[encoded,hash(recovery),user.id,oldRecovery]);
   if(!changed.rows.length)throw new AppError('Код уже использован',409);
   await client.query('DELETE FROM sessions WHERE account_id=$1',[user.id]);
  }
  const token=randomToken();
  await client.query('INSERT INTO sessions(token_hash,account_id,expires_at,touched_at) VALUES($1,$2,$3,$4)',[hash(token),user.id,Date.now()+lifetime,Date.now()]);
  await client.query('DELETE FROM sessions WHERE expires_at<$1',[Date.now()]);
  await client.query('DELETE FROM rate_limits WHERE expires_at<$1',[Date.now()]);
  if(tx){await client.query('COMMIT');tx=false}
  return ok({user:{name:user.name,login},recovery},200,{'Set-Cookie':cookie(req,token)});
 }
 const token=tokenFrom(req);if(!/^[a-f0-9]{64}$/.test(token))throw new AppError('Войдите в аккаунт',401);
 const sessionHash=hash(token);
 if(path==='join'&&req.method==='POST'){
  const {rows:[probe]}=await client.query('SELECT account_id FROM sessions WHERE token_hash=$1 AND expires_at>$2',[sessionHash,Date.now()]);
  if(!probe)throw new AppError('Войдите в аккаунт',401);
  if(!await limit(client,'join:'+probe.account_id,5))throw new AppError('Слишком много попыток. Попробуйте через 15 минут.',429);
 }
 await client.query('BEGIN');tx=true;
 const {rows:[session]}=await client.query('SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>$2 FOR UPDATE',[sessionHash,Date.now()]);
 if(!session)throw new AppError('Войдите в аккаунт',401);
 const {rows:[user]}=await client.query('SELECT id,name,login FROM accounts WHERE id=$1',[session.account_id]);
 if(['logout','logout-all'].includes(path)&&req.method==='POST'){
  await client.query(path==='logout-all'?'DELETE FROM sessions WHERE account_id=$1':'DELETE FROM sessions WHERE token_hash=$1',[path==='logout-all'?user.id:sessionHash]);
  await client.query('COMMIT');tx=false;return ok({ok:true},200,{'Set-Cookie':cookie(req,'',true)});
 }
 if(['push-status','push-enable','push-disable'].includes(path)){
 if(path!=='push-status'&&req.method!=='POST')throw new AppError('Нужен POST',405);
 const result=await subscriptionAction(client,sessionHash,path,a);await client.query('COMMIT');tx=false;return ok(result);
 }
 let {rows:[membership]}=await client.query('SELECT * FROM memberships WHERE account_id=$1',[user.id]);
 let roomRow;
 if(membership){({rows:[roomRow]}=await client.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[membership.room_id]));if(!roomRow?.data.members.some(p=>p.id===membership.member_id&&p.active)){await client.query('DELETE FROM memberships WHERE account_id=$1',[user.id]);membership=null;roomRow=null;session.ui={};}}
 if(!membership){
  if(path==='create'&&req.method==='POST'){
   // Account row lock prevents two devices creating rooms for the same account.
   await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[user.id]);
   const existing=await client.query('SELECT account_id FROM memberships WHERE account_id=$1',[user.id]);if(existing.rows.length)throw new AppError('У вас уже есть комната. Обновите страницу.',409);
   const pending=await client.query('SELECT 1 FROM pending_joins WHERE account_id=$1',[user.id]);if(pending.rows.length)throw new AppError('Сначала отмените заявку на вступление.');
   const room=seed(text(a.name,80),user.name);
   room.id=randomUUID();
   await client.query('INSERT INTO rooms(id,creator,code,data) VALUES($1,$2,$3,$4)',[room.id,user.id,room.code,JSON.stringify(room)]);
   await client.query('INSERT INTO memberships(account_id,room_id,member_id) VALUES($1,$2,$3)',[user.id,room.id,room.members[0].id]);
   await client.query('DELETE FROM pending_joins WHERE account_id=$1',[user.id]);
   membership={room_id:room.id,member_id:room.members[0].id};roomRow={id:room.id,data:room,version:0};session.ui={};
  }else if(path==='join'&&req.method==='POST'){
   const code=text(a.code,10,10).toUpperCase();if(!/^[A-Z2-9]{10}$/.test(code))throw new AppError('Нужен код из 10 букв и цифр');
   const {rows:[target]}=await client.query('SELECT * FROM rooms WHERE code=$1 FOR UPDATE',[code]);if(!target)throw new AppError('Не удалось отправить заявку. Проверьте код.');
   if(target.data.members.length>=100)throw new AppError('В комнате достигнут лимит участников');
   const role=a.role==='child'?'child':'member';const request={id:randomUUID(),name:user.name,role,status:'pending',at:Date.now()};
   const prior=await client.query('SELECT * FROM pending_joins WHERE account_id=$1',[user.id]);
   if(prior.rows[0])throw new AppError('У вас уже есть заявка. Дождитесь ответа или отмените её.');
   target.data.requests.push(request);
   await client.query('INSERT INTO pending_joins(account_id,room_id,request_id) VALUES($1,$2,$3)',[user.id,target.id,request.id]);
   await client.query('UPDATE rooms SET data=$1,version=version+1 WHERE id=$2',[JSON.stringify(target.data),target.id]);
  }else if(path==='cancel-join'&&req.method==='POST'){
   const {rows:[pending]}=await client.query('SELECT * FROM pending_joins WHERE account_id=$1',[user.id]);
   if(pending){const {rows:[target]}=await client.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[pending.room_id]);const q=target.data.requests.find(x=>x.id===pending.request_id);if(q?.status==='pending')q.status='rejected';await client.query('UPDATE rooms SET data=$1,version=version+1 WHERE id=$2',[JSON.stringify(target.data),target.id]);await client.query('DELETE FROM pending_joins WHERE account_id=$1',[user.id]);}
  }else if(path!=='view')throw new AppError('Сначала создайте комнату или вступите в неё',403);
  if(!membership){
   await client.query('UPDATE sessions SET expires_at=$1,touched_at=$2 WHERE token_hash=$3',[Date.now()+lifetime,Date.now(),sessionHash]);
   const {rows:[pending]}=await client.query('SELECT request_id FROM pending_joins WHERE account_id=$1',[user.id]);
   await client.query('COMMIT');tx=false;return ok({setup:true,user,pending:!!pending},200,{'Set-Cookie':cookie(req,token)});
  }
 }
 if(path==='export'&&req.method==='GET'){
  if(roomRow.creator!==user.id)throw new AppError('Экспорт доступен организатору',403);
  await client.query('COMMIT');tx=false;
  return ok({version:3,rooms:[roomRow.data],roomId:roomRow.id,actor:null},200,{'Content-Disposition':'attachment; filename="dom-vmeste-backup.json"'});
 }
 if(!['view','action','create'].includes(path))throw new AppError('Не найдено',404);
 let action=null;
 if(path==='action'){
  if(req.method!=='POST')throw new AppError('Нужен POST',405);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a.requestId||''))throw new AppError('Неверный идентификатор запроса');
  const repeat=await client.query('SELECT 1 FROM requests WHERE session_hash=$1 AND request_id=$2',[sessionHash,a.requestId]);
  if(!repeat.rows.length){
   if(a.revision!==session.revision||a.version!==roomRow.version)throw new AppError('Данные изменились на другом устройстве. Обновите страницу и повторите действие.',409);
   action=a;
  }
 }
 const out=await runRoom(roomRow.data,membership.member_id,session.ui,action);
 if(out.confirmation){await client.query('COMMIT');tx=false;return ok(out)}
 if(action?.action==='request-accept'||action?.action==='request-reject'){
  const q=out.room.requests.find(q=>q.id===action.id);
  const {rows:[pending]}=await client.query('SELECT * FROM pending_joins WHERE room_id=$1 AND request_id=$2',[roomRow.id,q.id]);
  if(!pending)throw new AppError('Заявка уже отменена',409);
  if(q.status==='accepted')await client.query('INSERT INTO memberships(account_id,room_id,member_id) VALUES($1,$2,$3)',[pending.account_id,roomRow.id,q.memberId]);
  await client.query('DELETE FROM pending_joins WHERE account_id=$1',[pending.account_id]);
 }
 if(!isDeepStrictEqual(JSON.parse(JSON.stringify(out.room)),roomRow.data)){
  roomRow.version++;
  await client.query('UPDATE rooms SET data=$1,code=$2,version=$3 WHERE id=$4',[JSON.stringify(out.room),out.room.code,roomRow.version,roomRow.id]);
 }
 await client.query('UPDATE sessions SET ui=$1,revision=revision+1,expires_at=$2,touched_at=$3 WHERE token_hash=$4',[JSON.stringify(out.ui),Date.now()+lifetime,Date.now(),sessionHash]);
 if(action)await client.query('INSERT INTO requests(session_hash,request_id,created_at) VALUES($1,$2,$3)',[sessionHash,a.requestId,Date.now()]);
 await client.query('DELETE FROM requests WHERE created_at<$1',[Date.now()-86400000]);
 await client.query('COMMIT');tx=false;
 return ok({html:out.html,prefs:out.prefs,timers:out.timers,version:roomRow.version,revision:session.revision+1,user},200,{'Set-Cookie':cookie(req,token)});
 }catch(error){
 if(tx)try{await client.query('ROLLBACK')}catch{}
 const status=error instanceof AppError?error.status:error.code==='23505'?409:error.code==='40P01'?409:500;
 return ok({error:status===500?'Не удалось сохранить изменения. Попробуйте снова.':error.code==='23505'?'Данные уже изменились. Обновите страницу.':error.code==='40P01'?'Одновременное изменение. Повторите действие.':error.message},status);
 }finally{client?.release()}
 }}
