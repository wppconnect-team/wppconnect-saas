import { sql } from '../db';
import { randomBytes } from 'crypto';

function generateTempPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$';
  const all     = upper + lower + digits + special;

  const bytes = randomBytes(20);
  const chars: string[] = [];

  chars.push(upper[bytes[0]   % upper.length]);
  chars.push(lower[bytes[1]   % lower.length]);
  chars.push(digits[bytes[2]  % digits.length]);
  chars.push(special[bytes[3] % special.length]);

  for (let i = 4; i < 20; i++) {
    chars.push(all[bytes[i] % all.length]);
  }

  // Fisher-Yates com bytes criptográficos
  const shuffle = randomBytes(20);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffle[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join('');
}

export async function runSetup(): Promise<void> {
  try {
    const [existing] = await sql`SELECT id FROM users LIMIT 1`;
    if (existing) return;

    const email    = process.env.ADMIN_EMAIL ?? 'admin@localhost';
    const password = generateTempPassword();

    await sql`
      INSERT INTO users (name, email, password_hash, must_change_password)
      VALUES ('Admin', ${email}, crypt(${password}, gen_salt('bf', 10)), TRUE)
    `;

    const sep = '═'.repeat(56);
    process.stdout.write(`\n${sep}\n`);
    process.stdout.write(`  PRIMEIRO ACESSO — CREDENCIAIS TEMPORÁRIAS\n`);
    process.stdout.write(`${sep}\n`);
    process.stdout.write(`  Email : ${email}\n`);
    process.stdout.write(`  Senha : ${password}\n`);
    process.stdout.write(`${sep}\n`);
    process.stdout.write(`  Troque a senha imediatamente após o primeiro login.\n`);
    process.stdout.write(`  Para personalizar o email: defina ADMIN_EMAIL no .env\n`);
    process.stdout.write(`${sep}\n\n`);
  } catch (err) {
    process.stderr.write(`[setup] Falha ao verificar usuário inicial: ${err}\n`);
  }
}
