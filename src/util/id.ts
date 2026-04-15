const prefixes = {
  inbox: 'inbox_',
  message: 'msg_',
  thread: 'thrd_',
  draft: 'drft_',
  webhook: 'whk_',
  domain: 'dom_',
  attachment: 'att_',
  event: 'evt_',
} as const;

export type IdPrefix = keyof typeof prefixes;

export function generateId(prefix: IdPrefix): string {
  return `${prefixes[prefix]}${crypto.randomUUID().replace(/-/g, '')}`;
}

export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
