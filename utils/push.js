const fetch = require('node-fetch');

// Envía una notificación push a un dispositivo usando FCM
async function sendPushNotification(fcmToken, title, body, data = {}) {
  const serverKey = process.env.FCM_SERVER_KEY || 'AQUI_TU_SERVER_KEY'; // Reemplaza por tu clave de servidor FCM
  const message = {
    to: fcmToken,
    notification: {
      title,
      body
    },
    data
  };

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });

  const result = await response.json();
  return result;
}

module.exports = { sendPushNotification };
