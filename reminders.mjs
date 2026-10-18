import {getDatabase} from '@netlify/database';
import {sendReminders} from '../../server/push.mjs';
export default async()=>{await sendReminders(getDatabase().pool)};
export const config={schedule:'* * * * *'};
