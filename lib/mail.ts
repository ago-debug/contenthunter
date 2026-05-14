import nodemailer from "nodemailer";

export function isMailConfigured(): boolean {
    return !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

export async function sendTransactionalMail(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
}): Promise<boolean> {
    if (!isMailConfigured()) {
        console.info("[mail] SMTP non configurato — skip invio a", params.to, "—", params.subject);
        return false;
    }
    const host = process.env.SMTP_HOST!.trim();
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE === "1" || process.env.SMTP_SECURE === "true";
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass: pass || "" } : undefined,
    });

    await transport.sendMail({
        from: process.env.SMTP_FROM!.trim(),
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html ?? `<pre style="font-family:system-ui">${escapeHtml(params.text)}</pre>`,
    });
    return true;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
