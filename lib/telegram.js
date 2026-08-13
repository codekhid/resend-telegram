const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const MAX_MESSAGE_LENGTH = 4000; // Telegram's real limit is 4096; leave headroom for the header line

// Telegram markdown needs a handful of characters escaped or the whole
// message silently fails to send instead of just rendering oddly.
function escapeMarkdown(text = "") {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export async function sendTelegramMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
    chunks.push(text.slice(i, i + MAX_MESSAGE_LENGTH));
  }

  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
    }
  }
}

export async function sendTelegramDocument(filename, buffer, caption) {
  const form = new FormData();
  form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  if (caption) form.append("caption", caption.slice(0, 1024));
  form.append("document", new Blob([buffer]), filename);

  const res = await fetch(`${TELEGRAM_API}/sendDocument`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendDocument failed: ${res.status} ${body}`);
  }
}

export function formatEmailMessage({ from, to, subject, text, html }) {
  const body = text || (html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "(no body)");
  const header = `*New email*\n*From:* ${escapeMarkdown(from)}\n*To:* ${escapeMarkdown((to || []).join(", "))}\n*Subject:* ${escapeMarkdown(subject || "(no subject)")}\n\n`;
  return header + escapeMarkdown(body);
}
