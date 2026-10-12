// SSO auto-provisions users, so it must be pinned to the organisation's own tenant.
// Multi-tenant authorities would let any Microsoft account in.
const azureTenant = process.env.AZURE_AD_TENANT_ID?.trim().toLowerCase() ?? "";

export const azureSsoEnabled =
  !!process.env.AZURE_AD_CLIENT_ID && !!azureTenant && !["common", "organizations", "consumers"].includes(azureTenant);

if (process.env.AZURE_AD_CLIENT_ID && !azureSsoEnabled) {
  console.error(
    "[auth] Microsoft SSO disabled: AZURE_AD_TENANT_ID must be your organisation's tenant ID, not common/organizations/consumers."
  );
}
