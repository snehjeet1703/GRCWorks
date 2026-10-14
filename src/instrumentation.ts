// Runs once when a Next.js server instance starts.
export async function register() {
  // Only in the Node.js server (not the edge runtime or the build), and never in tests that opt out.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.REMINDERS_DISABLED === "true") return;

  const { runReminders } = await import("./lib/reminders");
  const tick = () =>
    runReminders().then(
      (r) => r.sent > 0 && console.log(`[reminders] sent ${r.sent} evidence reminder(s)`),
      (err) => console.error("[reminders] run failed:", err)
    );

  // Check hourly; reminders are de-duplicated per person per day, so restarts and extra instances are safe.
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 60 * 60_000).unref?.();
}
