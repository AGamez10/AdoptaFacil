/** `ana.maria@example.com` → `an•••@example.com` (never echo or log a full address). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 2)}•••@${domain}`;
}
