const nodemailer = require('nodemailer');
require('dotenv').config();

// Create email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Send password reset email with token
 * @param {string} email - User's email address
 * @param {string} token - Reset token
 * @param {string} userName - User's name
 */
async function sendPasswordResetEmail(email, token, userName) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM || `"Deyla" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Recuperación de Contraseña - Deyla',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            margin: 0;
            padding: 0;
            background-color: #f8f9fa;
        }
        .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        .header {
            background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%);
            color: #ffffff;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #1a1a1a;
        }
        .message {
            font-size: 15px;
            color: #666666;
            margin-bottom: 30px;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .reset-button {
            display: inline-block;
            background-color: #1a1a1a;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 40px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            transition: background-color 0.3s;
        }
        .reset-button:hover {
            background-color: #333333;
        }
        .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .info-box p {
            margin: 0;
            font-size: 14px;
            color: #666666;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            font-size: 13px;
            color: #666666;
        }
        .link {
            color: #007bff;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Deyla</h1>
        </div>
        <div class="content">
            <div class="greeting">
                Hola ${userName || 'Usuario'},
            </div>
            <div class="message">
                <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en Deyla.</p>
                <p>Haz clic en el botón de abajo para crear una nueva contraseña:</p>
            </div>
            <div class="button-container">
                <a href="${resetLink}" class="reset-button">Restablecer Contraseña</a>
            </div>
            <div class="info-box">
                <p><strong>⏰ Este enlace expirará en 1 hora.</strong></p>
                <p>Si no solicitaste este cambio, puedes ignorar este correo de forma segura.</p>
            </div>
            <div class="message">
                <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
                <p class="link">${resetLink}</p>
            </div>
        </div>
        <div class="footer">
            <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
            <p>&copy; ${new Date().getFullYear()} Deyla. Todos los derechos reservados.</p>
        </div>
    </div>
</body>
</html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('No se pudo enviar el correo de recuperación');
    }
}

module.exports = {
    sendPasswordResetEmail
};
