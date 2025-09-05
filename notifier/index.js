import fetch from 'node-fetch';
import fs from 'fs';

const token = fs.readFileSync('/run/secrets/telegram_bot_token', 'utf-8').trim();
const chatId = fs.readFileSync('/run/secrets/telegram_chat_id', 'utf-8').trim();

const message = "🚀 Sentinel P2P iniciado correctamente";

const url = `https://api.telegram.org/bot${token}/sendMessage`;

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text: message })
})
  .then(res => res.json())
  .then(data => {
    console.log("✅ Enviado:", data);
  })
  .catch(err => {
    console.error("❌ Error al enviar mensaje:", err.message);
  });
