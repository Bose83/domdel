import {randomBytes,createHash,scrypt as _scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(_scrypt);
export const randomToken=()=>randomBytes(32).toString('hex');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export async function encodePassword(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});return salt+':'+key.toString('hex')}
export async function verifyPassword(password,encoded){const [salt,key]=(encoded||'00000000000000000000000000000000:'+ '0'.repeat(64)).split(':');const actual=await scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});return timingSafeEqual(actual,Buffer.from(key,'hex'))}
export const cookieName=req=>new URL(req.url).protocol==='https:'?'__Host-dv-session':'dv-session-local';
export const tokenFrom=req=>(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(req)+'='))?.split('=')[1]||'';
export const lifetime=180*86400000;
export function cookie(req,token,clear=false){return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:lifetime/1000}${new URL(req.url).protocol==='https:'?'; Secure':''}`}
export async function limit(db,key,max,period=900000){const bucket=Math.floor(Date.now()/period);const id=hash(key+':'+bucket);const {rows}=await db.query('INSERT INTO rate_limits(key,attempts,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=rate_limits.attempts+1 RETURNING attempts',[id,Date.now()+period*2]);return rows[0].attempts<=max}
