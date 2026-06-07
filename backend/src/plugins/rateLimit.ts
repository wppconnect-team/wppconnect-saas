interface Entry {
  count: number;
  resetAt: number;
}

const store    = new Map<string, Entry>();
const MAX_KEYS = 20_000; // evita crescimento ilimitado em caso de flood de IPs únicos

// Limpa entradas expiradas a cada minuto
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }

  // Segurança extra: se ainda acima do limite, remove os mais antigos
  if (store.size > MAX_KEYS) {
    const oldest = [...store.entries()]
      .sort(([, a], [, b]) => a.resetAt - b.resetAt)
      .slice(0, store.size - MAX_KEYS);
    for (const [key] of oldest) store.delete(key);
  }
}, 60_000);

/**
 * Verifica se a chave ainda está dentro do limite.
 * @returns true se a requisição é permitida, false se deve ser bloqueada
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  // Recusa silenciosamente quando o store está saturado para não vazar memória
  if (store.size >= MAX_KEYS) return false;

  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export function remainingAttempts(key: string, max: number): number {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.resetAt) return max;
  return Math.max(0, max - entry.count);
}
