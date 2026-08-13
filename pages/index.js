export default function Home() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>Resend → Telegram forwarder</h1>
      <p>This app has no UI — it's a single webhook endpoint.</p>
      <p>
        Point Resend's Inbound webhook at <code>/api/webhook/resend</code>.
      </p>
    </div>
  );
}
