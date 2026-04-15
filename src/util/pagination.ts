export function encodeCursor(value: string | number | Date): string {
  const raw = value instanceof Date ? value.toISOString() : String(value);
  return Buffer.from(raw).toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf-8');
}

export function applyPagination<T>(items: T[], params: { limit?: number; pageToken?: string; ascending?: boolean }, getKey: (item: T) => string): { items: T[]; nextPageToken?: string } {
  const limit = params.limit ?? 25;
  const ascending = params.ascending ?? false;

  let filtered = items;

  if (params.pageToken) {
    const cursor = decodeCursor(params.pageToken);
    const idx = filtered.findIndex((item) => getKey(item) === cursor);
    if (idx >= 0) {
      filtered = filtered.slice(idx + 1);
    }
  }

  if (!ascending) {
    filtered = [...filtered].reverse();
  }

  const page = filtered.slice(0, limit);
  const nextPageToken = page.length === limit && filtered.length > limit ? encodeCursor(getKey(page[page.length - 1])) : undefined;

  return { items: page, nextPageToken };
}
