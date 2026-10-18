import {getDatabase} from '@netlify/database';
import {createAPI} from '../../server/api.mjs';
process.env.TZ='Europe/Samara';
let handler;
export default async function(req,context){
 try{
  handler??=createAPI(getDatabase().pool);
  return await handler(req,context);
 }catch(error){
  const missing=error?.name==='MissingDatabaseConnectionError';
  return Response.json({error:missing?'База данных ещё не подключена. Откройте Netlify → Data & Storage → Database и подключите базу, затем повторите публикацию.':'Сервер не смог запуститься. Проверьте журнал функции api в Netlify.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
export const config={path:'/api/*'};
