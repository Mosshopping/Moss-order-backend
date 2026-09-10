// MOSS order backend
// Принимает обновления от Telegram (вебхук), достаёт данные заказа из Mini App
// и пересылает их владельцу бота отдельным сообщением.

import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ""; // необязательный, но рекомендуемый

if (!BOT_TOKEN) {
  console.error("Не задан BOT_TOKEN — сервис не сможет обращаться к Telegram API.");
}
if (!OWNER_CHAT_ID) {
  console.error("Не задан OWNER_CHAT_ID — некуда пересылать заказы.");
}

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Ошибка sendMessage:", res.status, body);
  }
}

function formatOrder(order) {
  const itemsList = (order.items || [])
    .map((it) => `• ${it.name} × ${it.qty} — ${it.price.toLocaleString("ru-RU")} сум`)
    .join("\n");

  return [
    `<b>Новая заявка MOSS</b>`,
    ``,
    `Имя: ${escapeHtml(order.name || "—")}`,
    `Телефон/TG: ${escapeHtml(order.phone || "—")}`,
    `Город: ${escapeHtml(order.city || "—")}`,
    order.comment ? `Комментарий: ${escapeHtml(order.comment)}` : null,
    ``,
    `<b>Состав заказа:</b>`,
    itemsList || "—",
    ``,
    `Комиссия: ${order.commissionPct}%`,
    `Доставка: ${Number(order.deliveryFee || 0).toLocaleString("ru-RU")} сум`,
    `<b>Итого: ${Number(order.total || 0).toLocaleString("ru-RU")} сум</b>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Основной вебхук — сюда Telegram шлёт все обновления бота
app.post("/webhook", async (req, res) => {
  // Проверка секрета, если он задан (Telegram присылает его в заголовке)
  if (WEBHOOK_SECRET) {
    const incoming = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (incoming !== WEBHOOK_SECRET) {
      return res.sendStatus(401);
    }
  }

  const update = req.body;
  const msg = update.message;

  try {
    if (msg && msg.web_app_data && msg.web_app_data.data) {
      // Это и есть заказ, отправленный из Mini App через tg.sendData(...)
      const order = JSON.parse(msg.web_app_data.data);
      const text = formatOrder(order);

      // Пересылаем владельцу
      await sendMessage(OWNER_CHAT_ID, text);

      // Подтверждение самому клиенту в чат с ботом
      await sendMessage(msg.chat.id, "Спасибо! Заявка получена, мы свяжемся с вами в течение пары часов 🌸");
    } else if (msg && msg.text === "/start") {
      await sendMessage(msg.chat.id, "Добро пожаловать в MOSS 🌸 Нажмите кнопку меню, чтобы открыть каталог.");
    }
  } catch (err) {
    console.error("Ошибка обработки обновления:", err);
  }

  // Telegram ждёт быстрый 200 OK независимо от результата обработки
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("MOSS order backend работает.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
