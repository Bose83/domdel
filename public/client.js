const root=document.getElementById('dv-app'),status=document.getElementById('connection');
let view=null,busy=false,dirty=false,authMode='login',recoveryCode=null,announced=new Set(),audio=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text){status.textContent=text;}
async function api(path,body){const response=await fetch('/api/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});let data;try{data=await response.json()}catch{throw Error('Сервер не ответил. Проверьте подключение.')}if(!response.ok){const error=Error(data.error||'Не удалось выполнить действие');error.status=response.status;throw error}return data}
function field(id,title,type='text',extra=''){return `<label>${title}<input id="${id}" type="${type}" ${extra}></label>`}
function auth(){view=null;root.setAttribute('aria-busy','false');root.innerHTML=`<main class="entry"><span class="pill">Дом вместе</span><h1>Меньше забот.<br>Больше дома.</h1><p class="muted">Семейные дела, планы и разговоры в одном месте.</p><form id="auth-form"><h2>${{login:'С возвращением',register:'Создать аккаунт',recover:'Восстановить доступ'}[authMode]}</h2>${field('auth-login','Логин','text','required minlength="3" maxlength="40" pattern="[A-Za-z0-9_.\\-]+" autocomplete="username" autocapitalize="none" spellcheck="false"')}${authMode==='register'?field('auth-name','Как вас зовут','text','required maxlength="60" autocomplete="given-name"'):''}${authMode==='recover'?field('auth-recovery','Секретный код восстановления','text','required maxlength="64" autocomplete="off" spellcheck="false"'):''}${field('auth-password',authMode==='recover'?'Новый пароль':'Пароль','password',`required minlength="12" maxlength="128" autocomplete="${authMode==='login'?'current-password':'new-password'}"`)}<p class="muted">Пароль — от 12 символов. Устройство запомнит вход. Email не нужен.</p><button class="primary" type="submit">${authMode==='login'?'Войти':authMode==='register'?'Зарегистрироваться':'Восстановить'}</button></form><div class="row">${['login','register','recover'].filter(m=>m!==authMode).map(m=>`<button data-auth="${m}">${{login:'Уже есть аккаунт',register:'Создать аккаунт',recover:'Забыли пароль?'}[m]}</button>`).join('')}</div></main>`;}
function recovery(code){recoveryCode=code;root.innerHTML=`<main class="entry"><h1>Сохраните код восстановления</h1><p>Он заменит письмо на почту, если вы забудете пароль. Показываем его только сейчас. Храните отдельно от устройства и никому не передавайте.</p><label>Ваш код<input id="recovery-code" readonly value="${esc(code)}"></label><div class="row"><button data-local="copy-recovery">Скопировать</button><button data-local="download-recovery">Скачать код</button></div><p class="muted">После восстановления выдаётся новый код, прежний перестаёт действовать.</p><button class="primary" data-local="recovery-saved">Код сохранён — продолжить</button></main>`;}
function setup(data){root.innerHTML=`<header><b>Дом вместе</b><button data-local="logout">Выйти</button></header><main class="entry"><h1>Привет, ${esc(data.user.name)}</h1>${data.pending?'<section class="panel"><h2>Заявка отправлена</h2><p>Любой участник семьи может принять её в разделе «Семья». Страница обновится автоматически.</p><button data-local="cancel-join">Отменить заявку</button></section>':`<section class="panel"><h2>Создать комнату</h2><form id="create-form">${field('room-name','Название','text','value="Наша семья" required maxlength="80"')}<button class="primary" type="submit">Создать комнату</button></form></section><section class="panel"><h2>Войти в комнату</h2><form id="join-form">${field('join-code','Код из 10 букв и цифр','text','required minlength="10" maxlength="10" autocapitalize="characters" spellcheck="false"')}<label>Профиль<select id="join-role"><option value="member">Взрослый</option><option value="child">Ребёнок</option></select></label><button type="submit">Отправить заявку</button></form><p class="muted">Код находится в разделе «Семья» у участника комнаты.</p></section>`}</main>`;}
function display(data){view=data;dirty=false;root.setAttribute('aria-busy','false');if(data.setup)setup(data);else{root.innerHTML=data.html;root.classList.toggle('no-motion',!data.prefs?.motion);tickTimers();}message('');}
async function refresh(){if(busy||recoveryCode||dirty||document.hidden)return;busy=true;try{display(await api('view'))}catch(e){if(e.status===401)auth();else message(e.message)}finally{busy=false}}
function values(){const result={};root.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{if(el.type==='file'||el.disabled||el.readOnly)return;result[el.id]=el.type==='checkbox'?el.checked:el.value});return result}
async function copy(el){el.focus();el.select();try{await navigator.clipboard.writeText(el.value);message('Скопировано.')}catch{message('Код выделен. Удерживайте его и выберите «Скопировать».')}}
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function unlockAudio(){if(audio)return;try{const C=window.AudioContext||window.webkitAudioContext;if(C){audio=new C();audio.resume()}}catch{}}
function quiet(){const p=view?.prefs;if(!p||p.notifications==='off')return true;const t=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Samara',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());return p.quietStart===p.quietEnd?false:p.quietStart<p.quietEnd?t>=p.quietStart&&t<p.quietEnd:t>=p.quietStart||t<p.quietEnd;}
function beep(){if(!audio||!view?.prefs?.timerSound||quiet())return;const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=650;g.gain.value=.06;o.connect(g);g.connect(audio.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.5);o.stop(audio.currentTime+.5);}
function tickTimers(){for(const t of view?.timers||[]){const el=Array.from(root.querySelectorAll('[data-timer]')).find(e=>e.dataset.timer===t.id),seconds=Math.max(0,Math.ceil((t.end-Date.now())/1000));if(el)el.textContent=seconds?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Время подхода закончилось';const key=t.id+':'+t.end;if(!seconds&&!announced.has(key)){announced.add(key);beep();refresh();}}}
root.addEventListener('input',()=>{dirty=true});root.addEventListener('change',()=>{dirty=true});
root.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const form=event.target;if(!form.reportValidity())return;busy=true;const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;try{
 if(form.id==='auth-form'){const data=await api(authMode,{login:root.querySelector('#auth-login').value,password:root.querySelector('#auth-password').value,name:root.querySelector('#auth-name')?.value,recovery:root.querySelector('#auth-recovery')?.value});dirty=false;if(data.recovery)recovery(data.recovery);else display(await api('view'));}
 else if(form.id==='create-form')display(await api('create',{name:root.querySelector('#room-name').value}));
 else if(form.id==='join-form')display(await api('join',{code:root.querySelector('#join-code').value,role:root.querySelector('#join-role').value}));
 }catch(e){message(e.message)}finally{busy=false;if(button?.isConnected)button.disabled=false}});
root.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b||b.disabled||busy)return;unlockAudio();
 if(b.dataset.auth){authMode=b.dataset.auth;dirty=false;auth();message('');return}
 const local=b.dataset.local||b.dataset.action;
 if(local==='copy-code'){await copy(root.querySelector('#room-code'));return}
 if(local==='copy-recovery'){await copy(root.querySelector('#recovery-code'));return}
 if(local==='download-recovery'){download('dom-vmeste-recovery.json',JSON.stringify({site:location.origin,recovery:recoveryCode},null,2));return}
 if(local==='recovery-saved'){recoveryCode=null;dirty=false;await refresh();return}
 if(!local)return;
 busy=true;b.disabled=true;try{
 if(local==='account-logout'||local==='logout'||local==='account-logout-all'){
  if(local==='account-logout-all'&&!confirm('Выйти на всех устройствах, включая это?'))return;
  await api(local==='account-logout-all'?'logout-all':'logout',{});dirty=false;auth();return;
 }
 if(local==='account-push-enable'){await enablePush();return}
 if(local==='account-push-disable'){await api('push-disable',{});const reg=await navigator.serviceWorker?.getRegistration();await (await reg?.pushManager.getSubscription())?.unsubscribe();message('Push на этом устройстве отключены.');return}
 if(local==='account-export'){const data=await api('export');download('dom-vmeste-backup.json',JSON.stringify(data,null,2));return}
 if(local==='cancel-join'){display(await api('cancel-join',{}));return}
 const fields=values();
 if(local==='parse-import'){const file=root.querySelector('#bulk-file')?.files[0];if(file){if(!/\.(txt|json)$/i.test(file.name)||file.size>1048576)throw Error('Выберите TXT или JSON до 1 МБ');fields.bulk=await file.text();}}
 const payload={action:local,id:b.dataset.id||'',fields,revision:view.revision,version:view.version,requestId:crypto.randomUUID()};
 let data=await api('action',payload);
 if(data.confirmation){if(!confirm(data.confirmation))return;data=await api('action',{...payload,confirmed:true});}
 display(data);
 }catch(e){if(e.status===401){dirty=false;auth();}else if(e.status===409){message(e.message+' Ваши введённые данные пока оставлены на экране.');const refreshButton=document.createElement('button');refreshButton.textContent='Обновить';refreshButton.onclick=()=>{if(!dirty||confirm('Обновить страницу? Несохранённый ввод будет потерян.')){dirty=false;refresh();}};status.append(' ',refreshButton);}else message(e.message)}finally{busy=false;if(b.isConnected)b.disabled=false}});
window.addEventListener('online',()=>{if(!dirty)refresh()});window.addEventListener('offline',()=>message('Нет сети. Новые действия будут доступны после подключения.'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
setInterval(refresh,20000);setInterval(tickTimers,1000);refresh();

async function enablePush(){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Этот браузер не поддерживает push. На iPhone откройте приложение с экрана «Домой».');
 const config=await api('push-status');if(!config.available)throw Error('Push пока не настроены владельцем сайта. Инструкция находится в README.');
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Уведомления не разрешены. Их можно включить в настройках браузера.');
 const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
 const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await api('push-enable',{subscription:sub.toJSON()});message('Push включены. Тихие часы и выбранный режим будут соблюдаться.');
}
