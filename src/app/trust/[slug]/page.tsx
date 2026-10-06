import { TrustPage } from "./trust-page";

export default async function TrustVaultPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TrustPage slug={slug} />;
}
