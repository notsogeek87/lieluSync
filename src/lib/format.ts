const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const dtf = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export function relativeTime(date: Date | string | null | undefined, now = Date.now()): string {
  if (!date) return "jamais";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return dtf.format(d);
}

export function absoluteTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return dtf.format(typeof date === "string" ? new Date(date) : date);
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
}
