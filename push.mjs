import webpush from 'web-push';
import {hash} from './security.mjs';
import {AppError} from './engine.mjs';
export function validateSubscription(value){
 if(!value||typeof value!=='object'||typeof value.endpoint!=='string'||value.endpoint.length>2048)throw new AppError('Неверная подписка');
 let u;try{u=new URL(value.endpoint)}catch{throw new AppError('Неверная подписка')}
 const h=u.hostname;
 if(u.protocol!=='https:'||u.port||u.username||u.password||!(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com')))throw new AppError('Сервис уведомлений этого браузера пока не поддерживается');
 if(!/^[A-Za-z0-9_-]{87}=?$/.test(value.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22}={0,2}$/.test(value.keys?.auth||''))throw new AppError('Неверные ключи подписки');
 return {endpoint:u.href,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export function notices(room,p,now=Date.now(),since=0){
 if(!p?.active||p.prefs.notifications==='off')return [];
 const t=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Samara',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(now));const a=p.prefs.quietStart,b=p.prefs.quietEnd;
 if(a!==b&&(a<b?t>=a&&t<b:t>=a||t<b))return [];
 const events=room.events.filter(e=>e.remind>0&&e.at>now&&e.at-now<=e.remind*60000&&(!e.people.length||e.people.includes(p.id))&&e.answers?.[p.id]!=='no').map(e=>'event:'+e.id+':'+e.at);
 const tasks=room.tasks.filter(x=>x.status==='open'&&(x.owner===p.id&&!x.accepted||x.proposedTo===p.id)&&x.createdAt>=since).map(x=>'task:'+x.id+':'+(x.proposedTo||x.owner));
 const timers=room.tasks.filter(x=>x.owner===p.id&&x.timerEnd&&x.timerEnd<=now&&x.timerEnd>now-15*60000).map(x=>'timer:'+x.id+':'+x.timerEnd);
 const messages=room.messages.filter(m=>m.author!==p.id&&m.at>Math.max(p.seenChat||0,since,now-86400000)&&(p.prefs.notifications==='all'||m.text.toLowerCase().includes('@'+p.name.toLowerCase())||m.reply&&room.messages.find(x=>x.id===m.reply)?.author===p.id)).map(m=>'message:'+m.id);
 return [...events,...timers,...tasks,...messages];
}
export async function sendReminders(pool,env=process.env,send=webpush.sendNotification.bind(webpush)){
 if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.URL)return {enabled:false,sent:0};
 const start=Date.now();let sent=0;
 const {rows}=await pool.query('SELECT p.*,s.account_id,r.data,m.member_id FROM push_subscriptions p JOIN sessions s ON s.token_hash=p.session_hash JOIN memberships m ON m.account_id=s.account_id JOIN rooms r ON r.id=m.room_id WHERE s.expires_at>$1 ORDER BY p.checked_at ASC LIMIT 20',[start]);
 for(const row of rows){
  if(Date.now()-start>22000)break;
  await pool.query('UPDATE push_subscriptions SET checked_at=$1 WHERE id=$2',[Date.now(),row.id]);
  if(row.last_sent>start-5*60000)continue;
  const person=row.data.members.find(p=>p.id===row.member_id);
  const candidates=notices(row.data,person,start,row.created_at);if(!candidates.length)continue;
  const {rows:delivered}=await pool.query('SELECT notice_key FROM push_deliveries WHERE subscription_id=$1 AND notice_key=ANY($2::text[])',[row.id,candidates]);
  const keys=candidates.filter(k=>!delivered.some(d=>d.notice_key===k));if(!keys.length)continue;
  // Claim all notices atomically. Repeated scheduled runs must not send duplicates.
  const claimed=await pool.query('INSERT INTO push_deliveries(subscription_id,notice_key,created_at) SELECT $1,unnest($2::text[]),$3 ON CONFLICT DO NOTHING RETURNING notice_key',[row.id,keys,start]);
  if(!claimed.rows.length)continue;
  try{
   await send(row.subscription,JSON.stringify({title:'Дом вместе',body:keys.some(k=>k.startsWith('timer:'))?'Подход закончился. Продолжить или отдохнуть?':`В семье есть напоминания: ${keys.length}. Откройте приложение, когда удобно.`,tag:'dom-vmeste'}),{TTL:300,timeout:3000,urgency:'normal',vapidDetails:{subject:env.URL,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});
   await pool.query('UPDATE push_subscriptions SET last_sent=$1 WHERE id=$2',[start,row.id]);sent++;
  }catch(error){
   if([404,410].includes(error.statusCode))await pool.query('DELETE FROM push_subscriptions WHERE id=$1',[row.id]);
   else await pool.query('DELETE FROM push_deliveries WHERE subscription_id=$1 AND notice_key=ANY($2::text[])',[row.id,claimed.rows.map(x=>x.notice_key)]);
  }
 }
 await pool.query('DELETE FROM push_deliveries WHERE created_at<$1',[start-30*86400000]);
 return {enabled:true,sent};
}
export async function subscriptionAction(db,sessionHash,action,body,env=process.env){
 if(action==='push-status'){const {rows}=await db.query('SELECT id FROM push_subscriptions WHERE session_hash=$1',[sessionHash]);return {available:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.URL),publicKey:env.VAPID_PUBLIC_KEY||null,enabled:rows.length>0}}
 if(action==='push-disable'){await db.query('DELETE FROM push_subscriptions WHERE session_hash=$1',[sessionHash]);return {enabled:false}}
 if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.URL)throw new AppError('Владелец сайта ещё не настроил push-уведомления');
 const subscription=validateSubscription(body.subscription);
 const id=hash(subscription.endpoint);
 await db.query('INSERT INTO push_subscriptions(id,session_hash,subscription,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET session_hash=$2,subscription=$3,created_at=$4',[id,sessionHash,JSON.stringify(subscription),Date.now()]);return {enabled:true};
}
