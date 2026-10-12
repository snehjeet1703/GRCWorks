import nodemailer from "nodemailer";

// Without SMTP in development, print mail to the server log so flows can be tested locally.
// Never in production: codes and links in logs would be a credential leak.
const devLogMail = !process.env.SMTP_HOST && process.env.NODE_ENV !== "production";

const smtp = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth:
    process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
});

const transporter = {
  async sendMail(msg: { from: string; to: string; subject: string; text: string; html: string }) {
    if (devLogMail) {
      console.log(`\n[email:dev] To: ${msg.to}\n[email:dev] Subject: ${msg.subject}\n${msg.text}\n`);
      return;
    }
    return smtp.sendMail(msg);
  },
};

const FROM = process.env.SMTP_FROM || "noreply@grc-platform.local";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendVendorInviteEmail(
  to: string,
  d: { orgName: string; vendorName: string; title: string; link: string; expiresAt: Date }
) {
  const expires = d.expiresAt.toUTCString().slice(0, 16);
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `${d.orgName}: security questionnaire for ${d.vendorName}`,
    text:
      `${d.orgName} has asked ${d.vendorName} to complete "${d.title}".\n\n` +
      `Open the questionnaire: ${d.link}\n\n` +
      `You'll be asked for a verification code sent to this address. The link expires on ${expires}.`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
        <p><strong>${escapeHtml(d.orgName)}</strong> has asked <strong>${escapeHtml(d.vendorName)}</strong> to complete a security questionnaire:</p>
        <p style="font-size:18px;font-weight:600">${escapeHtml(d.title)}</p>
        <p><a href="${escapeHtml(d.link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open questionnaire</a></p>
        <p style="color:#666;font-size:13px">You'll be asked for a verification code sent to this address. The link expires on ${escapeHtml(expires)}. If you weren't expecting this, you can ignore it.</p>
      </div>
    `,
  });
}

export async function sendVendorOtpEmail(to: string, code: string, orgName: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Your verification code for ${orgName}'s questionnaire`,
    text: `Your verification code is: ${code}\n\nIt expires in 10 minutes.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
        <p>Your verification code for <strong>${escapeHtml(orgName)}</strong>'s questionnaire:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111;margin:16px 0">${code}</p>
        <p style="color:#666;font-size:14px">It expires in 10 minutes.</p>
      </div>
    `,
  });
}

export async function sendTrustOtpEmail(to: string, code: string, orgName: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Your sign-in code for ${orgName}'s Trust Center`,
    text: `Your sign-in code is: ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
        <p>Your sign-in code for <strong>${escapeHtml(orgName)}</strong>'s Trust Center:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111;margin:16px 0">${code}</p>
        <p style="color:#666;font-size:14px">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendOtpEmail(to: string, code: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Your GRC Platform verification code",
    text: `Your verification code is: ${code}\n\nThis code expires in 5 minutes.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
        <h2 style="color:#4f46e5">GRC Platform</h2>
        <p>Your verification code is:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111;margin:16px 0">${code}</p>
        <p style="color:#666;font-size:14px">This code expires in 5 minutes.</p>
      </div>
    `,
  });
}
