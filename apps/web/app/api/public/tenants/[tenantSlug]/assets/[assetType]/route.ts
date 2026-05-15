import { apiRequest, proxyApiFileResponse, proxyApiJsonResponse } from "@/lib/server-api";

type PublicTenantAssetRouteProps = {
  params: Promise<{
    assetType: string;
    tenantSlug: string;
  }>;
};

const ALLOWED_ASSET_TYPES = new Set(["logo", "favicon", "login-image"]);

export async function GET(
  _request: Request,
  { params }: PublicTenantAssetRouteProps,
) {
  const { assetType, tenantSlug } = await params;

  if (!ALLOWED_ASSET_TYPES.has(assetType)) {
    return Response.json(
      {
        code: "BRANDING_ASSET_TYPE_INVALID",
        message: "Branding asset type is not supported.",
      },
      { status: 404 },
    );
  }

  const response = await apiRequest(
    `/public/tenants/${encodeURIComponent(tenantSlug)}/assets/${encodeURIComponent(assetType)}`,
    { includeAuth: false },
  );

  if (!response.ok) {
    return proxyApiJsonResponse(response);
  }

  return proxyApiFileResponse(response);
}
