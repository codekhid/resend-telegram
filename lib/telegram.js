const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const MAX_MESSAGE_LENGTH = 4000; // Telegram's real limit is 4096; leave headroom for the header/footer

// HTML parse_mode is far more forgiving than MarkdownV2 — MarkdownV2 breaks
// the ENTIRE message if a single character anywhere is unescaped, which is
// very easy to trigger from arbitrary email content. HTML only requires
// escaping the three characters below.
function escapeHtml(text = "") {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Telegram's HTML parse_mode supports a small allow-list of tags:
// b, strong, i, em, u, ins, s, strike, del, code, pre, a, tg-spoiler,
// blockquote (and blockquote expandable="true"). Anything else must be
// stripped, and any text content must be entity-escaped.
//
// This is a lightweight converter, not a full HTML sanitizer — it handles
// the common cases (links, paragraphs, line breaks, bold/italic) well
// enough for email bodies, but won't perfectly handle deeply nested or
// malformed HTML. Good enough for "readable forwarded email," not meant to
// be a general-purpose HTML renderer.
function emailHtmlToTelegramHtml(html) {
  let out = html;

  // Normalize block-level breaks to newlines BEFORE stripping tags, so
  // paragraphs don't collapse into one unreadable run-on line.
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  out = out.replace(/<li[^>]*>/gi, "• ");

  // Pull out <a href="...">text</a> before the generic tag-strip below —
  // this is the fix for links getting mangled into unstructured text.
  const links = [];
  out = out.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const cleanInner = inner.replace(/<[^>]+>/g, "").trim();
    const token = `\u0000LINK${links.length}\u0000`;
    links.push({ href, text: cleanInner || href });
    return token;
  });

  // Keep bold/italic as their own tokens too, so they survive the escape step.
  const bolds = [];
  out = out.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const token = `\u0001B${bolds.length}\u0001`;
    bolds.push(inner.replace(/<[^>]+>/g, "").trim());
    return token;
  });

  // Strip everything else.
  out = out.replace(/<[^>]+>/g, "");

  // Collapse excess whitespace but keep intentional newlines.
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();

  // Escape entities now that structural tags are gone.
  out = escapeHtml(out);

  // Restore links and bold as real, allowed Telegram HTML tags.
  out = out.replace(/\u0000LINK(\d+)\u0000/g, (_, i) => {
    const { href, text } = links[i];
    return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
  });
  out = out.replace(/\u0001B(\d+)\u0001/g, (_, i) => `<b>${escapeHtml(bolds[i])}</b>`);

  return out || "(no readable content)";
}

// Clearbit's free logo API (the once-obvious choice here) was shut down in
// December 2025. Google's favicon service is a smaller image than a full
// logo, but it's still active, free, and needs no API key/signup — a
// better fit than adding yet another account to configure.
function senderAvatarUrl(fromAddress) {
  const match = String(fromAddress || "").match(/@([^\s>]+)/);
  const domain = match?.[1];
  if (!domain) return null;

  // Logo.dev gives noticeably sharper, higher-res brand logos than a plain
  // favicon, but needs a free publishable key (logo.dev/signup, no card
  // required). Falls back to Google's favicon service automatically if
  // LOGO_DEV_TOKEN isn't set, so the bot keeps working either way.
  if (process.env.LOGO_DEV_TOKEN) {
    return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${process.env.LOGO_DEV_TOKEN}&size=128&format=png`;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export async function sendTelegramNotification({ subject, from, to, url }) {
  const caption =
    `📧 <b>${escapeHtml(subject || "(no subject)")}</b>\n` +
    `<b>From:</b> <code>${escapeHtml(from)}</code>\n` +
    `<b>To:</b> <code>${escapeHtml((to || []).join(", "))}</code>`;

  const avatarUrl = senderAvatarUrl(from);
  const replyMarkup = { inline_keyboard: [[{ text: "📨 View email", url }]] };

  if (avatarUrl) {
    // sendPhoto is what actually lets an image show up alongside the
    // message — Telegram has no way to attach a custom image to a plain
    // text bubble. Caption max length is 1024 chars, well within what
    // this notification needs.
    const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        photo: avatarUrl,
        caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }),
    });
    if (res.ok) return;

    // Telegram sometimes rejects a photo URL (unreachable favicon, wrong
    // content-type, etc.) — fall back to a plain text message rather than
    // losing the notification entirely over a missing icon.
    console.error("sendPhoto failed, falling back to text:", await res.text());
  }

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage (notification) failed: ${res.status} ${body}`);
  }
}

export async function sendTelegramMessage(html) {
  const chunks = [];
  for (let i = 0; i < html.length; i += MAX_MESSAGE_LENGTH) {
    chunks.push(html.slice(i, i + MAX_MESSAGE_LENGTH));
  }

  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: "HTML",
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

const PREVIEW_THRESHOLD = 500; // bodies longer than this get wrapped in a collapsible quote

export function formatEmailMessage({ from, to, subject, text, html }) {
  const body = html
    ? emailHtmlToTelegramHtml(html)
    : escapeHtml(text || "(no body)");

  const header =
    `📧 <b>${escapeHtml(subject || "(no subject)")}</b>\n` +
    `<i>From:</i> <code>${escapeHtml(from)}</code>\n` +
    `<i>To:</i> <code>${escapeHtml((to || []).join(", "))}</code>\n\n`;

  // Long bodies collapse behind a tap-to-expand quote instead of dumping a
  // wall of text straight into the channel. <code> above also makes the
  // email addresses tap-to-copy on mobile.
  const wrappedBody =
    body.length > PREVIEW_THRESHOLD
      ? `<blockquote expandable="true">${body}</blockquote>`
      : body;

  return header + wrappedBody;
}
