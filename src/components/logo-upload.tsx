"use client";

import { useState } from "react";
import { ImageUp } from "lucide-react";
import { useToast } from "@/components/toast";

/** Upload / replace / remove a logo (PNG, JPEG or WebP, up to 1 MB) at `endpoint`. */
export function LogoUpload({
  endpoint, title = "Logo", description, hasLogo, canManage, onChange, emptyHint,
}: {
  endpoint: string;
  title?: string;
  description: string;
  hasLogo: boolean;
  canManage: boolean;
  onChange?: (hasLogo: boolean) => void;
  emptyHint?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(() => Date.now());
  const [present, setPresent] = useState(hasLogo);

  const upload = async (file: File) => {
    if (file.size > 1024 * 1024) return toast.error("Logo too large (max 1 MB)");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setVersion(Date.now());
      setPresent(true);
      toast.success("Logo updated");
      onChange?.(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPresent(false);
      toast.success("Logo removed");
      onChange?.(false);
    } catch {
      toast.error("Failed to remove logo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-800">
      <h3 className="font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mb-4 text-sm text-gray-500">{description}</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900">
          {present ? (
            <img src={`${endpoint}?v=${version}`} alt="Current logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-1 text-center text-xs text-gray-400">{emptyHint ?? "No logo"}</span>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <label className={`btn-secondary btn-sm cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
              <ImageUp className="h-4 w-4" /> {busy ? "Uploading…" : present ? "Replace" : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) upload(f);
                }}
              />
            </label>
            {present && (
              <button type="button" onClick={remove} disabled={busy} className="btn-ghost btn-sm text-red-600">
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
