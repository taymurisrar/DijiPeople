export const PARTNER_ACCESS_COOKIE = "dp_partner_access";
export const PARTNER_REFRESH_COOKIE = "dp_partner_refresh";
export const partnerCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});
