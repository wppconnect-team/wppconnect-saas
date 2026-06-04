interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Limpa entradas expiradas a cada minuto
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

/**
 * Verifica se a chave ainda está dentro do limite.
 * @returns true se a requisição é permitida, false se deve ser bloqueada
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now  = Date.now();
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
