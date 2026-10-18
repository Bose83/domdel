import webpush from 'web-push';
const keys=webpush.generateVAPIDKeys();
console.log('Добавьте эти две переменные в Netlify → Environment variables, scope Functions. Приватный ключ не добавляйте в репозиторий.\n');
console.log('VAPID_PUBLIC_KEY='+keys.publicKey+'\nVAPID_PRIVATE_KEY='+keys.privateKey);
