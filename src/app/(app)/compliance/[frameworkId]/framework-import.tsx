"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { ImportSheetModal } from "../../audits/import-sheet-modal";
import { useToast } from "@/components/toast";

/** "Import from sheet" for one framework; opens on its own after a custom framework is created (?import=1). */
export function FrameworkImport({ framework }: { framework: { id: string; name: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (params.get("import") === "1") setOpen(true);
  }, [params]);

  return (
    <>
      <button className="btn-secondary shrink-0" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" /> Import from sheet
      </button>
      <ImportSheetModal
        open={open}
        onClose={() => { setOpen(false); router.replace(`/compliance/${framework.id}`); }}
        frameworks={[framework]}
        fixedFrameworkId={framework.id}
        onImported={(periodId, created, updated) => {
          setOpen(false);
          toast.success(`Imported ${created} new and ${updated} updated controls into ${framework.name}.`);
          startTransition(() => router.push(periodId ? `/audits/${periodId}` : `/compliance/${framework.id}`));
          startTransition(() => router.refresh());
        }}
      />
    </>
  );
}
