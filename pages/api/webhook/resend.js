import { Resend } from "resend";
import { sendTelegramMessage, sendTelegramDocument, formatEmailMessage } from "../../../lib/telegram";

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend needs the raw, unparsed body to verify the webhook signature —
// letting Next.js's default JSON body parser touch it first breaks
// verification, since even reformatting whitespace changes the signed bytes.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = await readRawBody(req);
  const id = req.headers["svix-id"];
  const timestamp = req.headers["svix-timestamp"];
  const signature = req.headers["svix-signature"];

  if (!id || !timestamp || !signature) {
    return res.status(400).json({ error: "Missing webhook signature headers" });
  }

  let event;
  try {
    // Throws if the signature doesn't match — this is what stops anyone
    // else from POSTing fake "emails" to your Telegram channel.
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(401).json({ error: "Invalid signature" });
  }

  if (event.type !== "email.received") {
    return res.status(200).json({ ignored: event.type }); // e.g. delivery/bounce events, not inbound mail
  }

  try {
    // Webhook payload is metadata only — subject/from/to and an attachment
    // list, but no body. Full HTML/text content needs this extra fetch.
    const { data: email } = await resend.emails.receiving.get(event.data.email_id);

    await sendTelegramMessage(
      formatEmailMessage({
        from: email.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      })
    );

    // Forward attachments too, if any. Each one needs its own download —
    // Resend only gives you metadata + a download_url per attachment.
    const attachments = event.data.attachments || [];
    for (const att of attachments) {
      try {
        const fileRes = await fetch(att.download_url);
        if (!fileRes.ok) continue;
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        await sendTelegramDocument(att.filename || "attachment", buffer, `Attachment from: ${email.subject || ""}`);
      } catch (attErr) {
        console.error("Failed to forward attachment:", att.filename, attErr.message);
        // Don't fail the whole request over one bad attachment — the
        // message itself already went through.
      }
    }

    return res.status(200).json({ forwarded: true });
  } catch (err) {
    console.error("Failed to process/forward email:", err.message);
    // Return 500 so Resend retries the webhook rather than silently
    // dropping this email if Telegram or the fetch hiccups.
    return res.status(500).json({ error: "Processing failed" });
  }
}
