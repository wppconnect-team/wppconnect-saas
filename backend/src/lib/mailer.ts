import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST ?? '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587');
const SMTP_USER = process.env.SMTP_USER ?? '';
const SMTP_PASS = process.env.SMTP_PASS ?? '';
const SMTP_FROM = process.env.SMTP_FROM ?? 'noreply@wppconnect.io';
const IS_DEV    = process.env.NODE_ENV !== 'production';

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ sent: boolean; devLink?: string }> {
  if (!SMTP_HOST) {
    const sep = '─'.repeat(60);
    process.stdout.write(`\n${sep}\n  REDEFINIÇÃO DE SENHA (SMTP não configurado)\n${sep}\n  Para: ${to}\n  Link: ${resetUrl}\n${sep}\n\n`);
    return { sent: false, devLink: IS_DEV ? resetUrl : undefined };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: 'Redefinição de senha — Wppconnect',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family:sans-serif;color:#111;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px">Redefinição de senha</h2>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;
                    border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">
            Redefinir senha
          </a>
        </p>
        <p style="color:#555;font-size:13px">Este link expira em <strong>30 minutos</strong>.</p>
        <p style="color:#999;font-size:12px">Se você não solicitou isso, ignore este e-mail — sua senha permanece a mesma.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#aaa;font-size:11px">Wppconnect · mensagem automática</p>
      </body>
      </html>
    `,
    text: `Redefinição de senha\n\nClique no link abaixo para criar uma nova senha:\n${resetUrl}\n\nEste link expira em 30 minutos.\n\nSe você não solicitou isso, ignore este e-mail.`,
  });

  return { sent: true };
}
