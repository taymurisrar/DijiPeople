import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { apiRequest } from "@/lib/server-api";

const MAX_LOGO_SIZE_BYTES = 3 * 1024 * 1024;
const ALLOWED_SETTING_KEYS = new Set([
  "logoUrl",
  "squareLogoUrl",
  "faviconUrl",
  "emailHeaderLogoUrl",
  "loginBannerImageUrl",
]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

const DOCUMENT_ID_KEYS: Record<string, string> = {
  logoUrl: "logoDocumentId",
  squareLogoUrl: "squareLogoDocumentId",
  faviconUrl: "faviconDocumentId",
  emailHeaderLogoUrl: "emailHeaderLogoDocumentId",
  loginBannerImageUrl: "loginBannerImageDocumentId",
};

export async function POST(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json(
      { message: "Session expired. Please sign in again." },
      { status: 401 },
    );
  }

  const incoming = await request.formData();
  const settingKey = String(incoming.get("settingKey") ?? "").trim();
  const file = incoming.get("file");

  if (!ALLOWED_SETTING_KEYS.has(settingKey)) {
    return NextResponse.json(
      { message: "Invalid branding setting key for file upload." },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "A branding asset file is required." },
      { status: 400 },
    );
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return NextResponse.json(
      { message: "Only PNG, JPG, WEBP, or SVG branding files are allowed." },
      { status: 400 },
    );
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return NextResponse.json(
      { message: "Branding asset exceeds the 3 MB upload limit." },
      { status: 400 },
    );
  }

  const uploadFormData = new FormData();
  uploadFormData.set("file", file);
  uploadFormData.set("entityType", "TENANT");
  uploadFormData.set("entityId", user.tenantId);
  uploadFormData.set("title", `Branding asset: ${settingKey}`);
  uploadFormData.set(
    "description",
    `Tenant branding asset uploaded for ${settingKey}.`,
  );

  const uploadResponse = await apiRequest("/documents/upload", {
    method: "POST",
    body: uploadFormData,
  });

  const uploadPayload = (await uploadResponse.json().catch(() => null)) as
    | {
        id: string;
        viewPath?: string;
        downloadPath?: string;
      }
    | null;

  if (!uploadResponse.ok || !uploadPayload?.id) {
    return NextResponse.json(
      {
        message:
          (uploadPayload as { message?: string } | null)?.message ??
          "Branding asset upload could not be registered. Please retry.",
      },
      { status: uploadResponse.status || 500 },
    );
  }

  const viewPath = uploadPayload.viewPath || `/api/documents/${uploadPayload.id}/view`;
  const relatedDocumentIdKey = DOCUMENT_ID_KEYS[settingKey];
  const updates: Array<{ category: string; key: string; value: string }> = [
    {
      category: "branding",
      key: settingKey,
      value: viewPath,
    },
  ];

  if (relatedDocumentIdKey) {
    updates.push({
      category: "branding",
      key: relatedDocumentIdKey,
      value: uploadPayload.id,
    });
  }

  const saveResponse = await apiRequest("/tenant-settings", {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });

  if (!saveResponse.ok) {
    const savePayload = (await saveResponse.json().catch(() => null)) as
      | { message?: string }
      | null;
    return NextResponse.json(
      {
        message:
          savePayload?.message ??
          "Branding asset uploaded, but settings could not be saved.",
      },
      { status: saveResponse.status || 500 },
    );
  }

  return NextResponse.json({
    documentId: uploadPayload.id,
    settingKey,
    value: viewPath,
    viewPath,
    downloadPath:
      uploadPayload.downloadPath || `/api/documents/${uploadPayload.id}/download`,
  });
}
