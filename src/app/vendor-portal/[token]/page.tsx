import { VendorPortal } from "./vendor-portal";
import { VENDOR_UPLOAD_ACCEPT } from "@/lib/vendor-upload";

export default async function VendorPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VendorPortal token={token} accept={VENDOR_UPLOAD_ACCEPT} />;
}
