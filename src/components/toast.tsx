"use client";

import { ReactNode } from "react";
import { Toaster, toast } from "sonner";

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const api: ToastApi = {
  success: (m) => toast.success(m),
  error: (m) => toast.error(m),
};

export function useToast(): ToastApi {
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
          },
        }}
      />
    </>
  );
}
