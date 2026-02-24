const admin = require('firebase-admin');

let serviceAccount;

try {
    // 1. Intenta cargar el archivo (Esto funcionará en tu PC)
    serviceAccount = require('../serviceAccountKey.json');
} catch (e) {
    // 2. Si el archivo NO existe (como en Render), usa la variable de entorno
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        console.error("ERROR: No se encontró la configuración de Firebase en el archivo ni en la variable");
    }
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

module.exports = admin;