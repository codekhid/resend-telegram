# Resend → Telegram email forwarder

Every email that lands on a domain you control gets pushed to a Telegram
channel in real time — no polling, no cron. Resend calls your Vercel
endpoint the instant an email arrives.

## How it works

1. Someone emails `anything@your-inbound-subdomain.yourdomain.com`
2. Resend receives it, parses it, and `POST`s a webhook to
   `/api/webhook/resend` with metadata (from/to/subject/attachment list —
   not the body)
3. The webhook handler verifies the request really came from Resend
   (signature check), fetches the full body via Resend's API, and posts it
   to your Telegram channel
4. Any attachments get downloaded and forwarded as separate Telegram
   documents

## Setup

### 1. Create a Telegram bot and channel

1. Message **@BotFather** on Telegram → `/newbot` → follow the prompts →
   you'll get a token like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`. This
   is `TELEGRAM_BOT_TOKEN`.
2. Create a Telegram channel (or use an existing one).
3. Add your bot to the channel **as an admin** (Channel → Administrators →
   Add Admin → search your bot by username) — it can't post without this.
4. Get `TELEGRAM_CHAT_ID`:
   - **Public channel**: just use `@yourchannelname` directly, no lookup
     needed.
   - **Private channel**: post any message in the channel, then visit
     `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser —
     look for `"chat":{"id":-100xxxxxxxxxx` in the response. That whole
     negative number (including the minus sign) is your chat ID.

### 2. Set up a receiving subdomain in Resend

**Use a subdomain, not your root domain** — e.g. `inbound.yourdomain.com`,
not `yourdomain.com`. If you point MX records for receiving at your root
domain, it can interfere with any other mail already flowing through that
domain (like the verification emails your other project sends via Resend).

1. Resend dashboard → Domains → add `inbound.yourdomain.com` (or whatever
   subdomain you pick) as a new domain.
2. Add the MX record Resend gives you to your DNS provider.
3. Once verified, any email sent to `anything@inbound.yourdomain.com` will
   be received by Resend.

### 3. Create the webhook in Resend

1. Resend dashboard → Webhooks → Add Webhook.
2. Endpoint URL: `https://<your-vercel-domain>/api/webhook/resend`
3. Subscribe to the **`email.received`** event.
4. Copy the **Signing Secret** shown — this is `RESEND_WEBHOOK_SECRET`.

### 4. Deploy to Vercel

1. Push this project to GitHub, import it in Vercel (same flow as any
   other Next.js project).
2. Add all four env vars from `.env.example` in Vercel's Environment
   Variables settings.
3. Deploy.
4. Go back to Resend's webhook settings and send a **test event** — check
   Vercel's Logs tab to confirm it returns `200` and your Telegram channel
   gets a message.

### 5. Try it for real

Send an email to `anything@inbound.yourdomain.com` from any regular email
account. Within a couple seconds it should show up in your Telegram
channel.

## Notes

- **Message length**: Telegram caps messages at 4096 characters — long
  emails get split into multiple messages automatically
  (`lib/telegram.js`).
- **Markdown**: email subjects/bodies are escaped for Telegram's
  MarkdownV2 format, so stray `*`, `_`, `[`, etc. in an email won't break
  formatting.
- **Attachments**: forwarded as separate Telegram documents after the main
  message. If one attachment fails to forward, the others and the main
  message still go through — it doesn't fail the whole webhook.
- **Retries**: if Telegram or Resend's API hiccups, the handler returns a
  `500`, which makes Resend retry the webhook automatically — so a
  transient failure doesn't silently drop an email.
- **No filtering** — every email received, forwarded as-is, per your
  request. If you later want to filter (e.g. skip anything from a specific
  sender, or only forward emails with attachments), that logic goes right
  after the `event.type !== "email.received"` check in
  `pages/api/webhook/resend.js`.
