const EXPIRY_WARNING_DAYS = 30;

// Effective evidence status: REJECTED, EXPIRED, EXPIRING (within 30 days), PENDING (not yet valid) or VALID.
export function computeEvidenceStatus(
  e: { status: string; validFrom: Date | null; validUntil: Date | null },
  now: Date = new Date()
): string {
  if (e.status === "REJECTED") return "REJECTED";
  if (e.validUntil) {
    const until = new Date(e.validUntil);
    if (until < now) return "EXPIRED";
    const diffMs = until.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays <= EXPIRY_WARNING_DAYS) return "EXPIRING";
  }
  if (e.validFrom) {
    const from = new Date(e.validFrom);
    if (from > now) return "PENDING";
  }
  return "VALID";
}
