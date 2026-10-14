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

export async function sendTrustAccessGrantedEmail(
  to: string,
  d: {
    orgName: string;
    name: string;
    link: string;
    trustPageUrl: string;
    expiresAt: Date | null;
    documents: { name: string; permission: "VIEW_ONLY" | "DOWNLOADABLE" }[];
  }
) {
  const expiry = d.expiresAt ? `It expires on ${d.expiresAt.toUTCString().slice(0, 16)}.` : "It doesn't expire unless access is revoked.";
  const label = (p: string) => (p === "DOWNLOADABLE" ? "view & download" : "view only");
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Your access to ${d.orgName}'s Trust Center`,
    text:
      `Hi ${d.name},\n\n${d.orgName} has approved your request for access to its Trust Center.\n\n` +
      `Open it here: ${d.link}\n\n` +
      (d.documents.length ? `Documents shared with you:\n${d.documents.map((x) => `- ${x.name} (${label(x.permission)})`).join("\n")}\n\n` : "") +
      `${expiry} Keep this link private; it's tied to your email.\n\n` +
      `Lost this email? Go to ${d.trustPageUrl}, click "Get access" and sign in with a code sent to this address.`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
        <p>Hi ${escapeHtml(d.name)},</p>
        <p><strong>${escapeHtml(d.orgName)}</strong> has approved your request for access to its Trust Center.</p>
        <p><a href="${escapeHtml(d.link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open Trust Center</a></p>
        ${d.documents.length ? `<p style="margin-bottom:4px">Documents shared with you:</p><ul style="margin-top:0">${d.documents.map((x) => `<li>${escapeHtml(x.name)} <span style="color:#666">(${label(x.permission)})</span></li>`).join("")}</ul>` : ""}
        <p style="color:#666;font-size:13px">${escapeHtml(expiry)} Keep this link private; it's tied to your email.</p>
        <p style="color:#666;font-size:13px">Lost this email? Go to <a href="${escapeHtml(d.trustPageUrl)}">${escapeHtml(d.trustPageUrl)}</a>, click <em>Get access</em> and sign in with a code sent to this address.</p>
      </div>
    `,
  });
}

export async function sendTrustAccessRequestedEmail(
  to: string[],
  d: { orgName: string; name: string; email: string; company: string; reason: string; reviewUrl: string }
) {
  if (to.length === 0) return;
  await transporter.sendMail({
    from: FROM,
    to: to.join(", "),
    subject: `New Trust Center access request from ${d.company}`,
    text:
      `${d.name} (${d.email}) at ${d.company} has requested access to ${d.orgName}'s Trust Center.\n\n` +
      (d.reason ? `Reason: ${d.reason}\n\n` : "") +
      `Review it: ${d.reviewUrl}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
        <p><strong>${escapeHtml(d.name)}</strong> (${escapeHtml(d.email)}) at <strong>${escapeHtml(d.company)}</strong> has requested access to ${escapeHtml(d.orgName)}'s Trust Center.</p>
        ${d.reason ? `<p style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap">${escapeHtml(d.reason)}</p>` : ""}
        <p><a href="${escapeHtml(d.reviewUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Review request</a></p>
      </div>
    `,
  });
}

export async function sendTaskAssignedEmail(
  to: string,
  d: { assigneeName: string; assignerName: string; title: string; description: string; priority: string; dueDate: Date | null; link: string }
) {
  const due = d.dueDate ? d.dueDate.toUTCString().slice(0, 16) : null;
  const priority = d.priority.charAt(0) + d.priority.slice(1).toLowerCase();
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `New task: ${d.title}`,
    text:
      `Hi ${d.assigneeName},\n\n${d.assignerName} assigned you a task: ${d.title}\n` +
      `Priority: ${priority}${due ? `\nDue: ${due}` : ""}\n` +
      (d.description ? `\n${d.description}\n` : "") +
      `\nOpen your tasks: ${d.link}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
        <p>Hi ${escapeHtml(d.assigneeName)},</p>
        <p><strong>${escapeHtml(d.assignerName)}</strong> assigned you a task:</p>
        <p style="font-size:18px;font-weight:600;margin:8px 0">${escapeHtml(d.title)}</p>
        <p style="color:#555;font-size:14px;margin:0">Priority: ${escapeHtml(priority)}${due ? ` &middot; Due ${escapeHtml(due)}` : ""}</p>
        ${d.description ? `<p style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap">${escapeHtml(d.description)}</p>` : ""}
        <p><a href="${escapeHtml(d.link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open my tasks</a></p>
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
