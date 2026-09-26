/** Only allow same-site relative redirects (prevents open redirects via `?next=`). */
export function safeNextPath(value: string | null | undefined, fallback = '/lobby'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
