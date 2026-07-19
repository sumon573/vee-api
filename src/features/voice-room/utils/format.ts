export function fmt(ts: number) {
  const d = new Date(ts);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

export function fmtDiamonds(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'} · ${d.getDate()}/${d.getMonth() + 1}`;
}

export function getWeekStart(): number {
  const now = new Date();
  const d   = new Date(now);
  d.setDate(now.getDate() - now.getDay()); // Sunday = start
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
