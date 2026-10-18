import {getDatabase} from '@netlify/database';
import {createAPI} from '../../server/api.mjs';
process.env.TZ='Europe/Samara';
let handler;
export default async function(req,context){handler??=createAPI(getDatabase().pool);return handler(req,context)}
export const config={path:'/api/*'};
