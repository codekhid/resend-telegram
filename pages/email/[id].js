import { Resend } from "resend";
import { sanitizeEmailHtml } from "../../lib/sanitizeHtml";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function getServerSideProps({ params }) {
  try {
    const { data: email } = await resend.emails.receiving.get(params.id);
    if (!email) return { notFound: true };

    return {
      props: {
        subject: email.subject || "(no subject)",
        from: email.from || "",
        to: email.to || [],
        html: email.html ? sanitizeEmailHtml(email.html) : null,
        text: email.text || null,
        createdAt: email.created_at || null,
      },
    };
  } catch {
    return { notFound: true };
  }
}

export default function EmailView({ subject, from, to, html, text, createdAt }) {
  return (
    <>
      <div className="page">
        <div className="card">
          <p className="brand">📧 Forwarded email</p>
          <h1>{subject}</h1>
          <div className="meta">
            <div>
              <span className="label">From</span> <code>{from}</code>
            </div>
            <div>
              <span className="label">To</span> <code>{to.join(", ")}</code>
            </div>
            {createdAt && (
              <div>
                <span className="label">Received</span> {new Date(createdAt).toLocaleString()}
              </div>
            )}
          </div>

          <div className="body">
            {html ? (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <pre>{text || "(no readable content)"}</pre>
            )}
          </div>

          <div className="footer">
            <a href={`mailto:${from}`} className="reply-btn">
              ↩ Reply via email
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #0b0b0c;
          padding: 16px;
          display: flex;
          justify-content: center;
        }
        .card {
          width: 100%;
          max-width: 640px;
          background: #161618;
          border: 1px solid #2a2a2e;
          border-radius: 16px;
          padding: 20px;
          color: #fff;
          font-family: -apple-system, system-ui, sans-serif;
        }
        .brand {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #ff4d00;
          margin: 0 0 12px;
          font-weight: 600;
        }
        h1 {
          font-size: 20px;
          line-height: 1.3;
          margin: 0 0 16px;
          word-break: break-word;
        }
        .meta {
          font-size: 13px;
          color: #8a8a90;
          border-top: 1px solid #2a2a2e;
          border-bottom: 1px solid #2a2a2e;
          padding: 12px 0;
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .label {
          color: #fff;
          font-weight: 600;
          margin-right: 4px;
        }
        code {
          font-family: "SF Mono", Consolas, monospace;
          font-size: 12px;
          word-break: break-all;
        }
        .body {
          font-size: 15px;
          line-height: 1.6;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .body :global(img) {
          max-width: 100%;
          height: auto;
        }
        .body :global(a) {
          color: #ff4d00;
          word-break: break-all;
        }
        .body :global(table) {
          max-width: 100%;
          display: block;
          overflow-x: auto;
        }
        pre {
          white-space: pre-wrap;
          font-family: inherit;
          margin: 0;
        }
        .footer {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #2a2a2e;
        }
        .reply-btn {
          display: inline-block;
          background: #ff4d00;
          color: #fff;
          text-decoration: none;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
        }
      `}</style>
    </>
  );
}
