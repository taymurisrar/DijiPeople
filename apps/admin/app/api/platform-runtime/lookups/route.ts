import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
const ALLOWED_LOOKUPS = new Set([
  "/platform-users/owner-candidates",
  "/partners",
  "/super-admin/customers",
  "/super-admin/tenants",
  "/super-admin/leads?pageSize=100",
  "/super-admin/customer-onboarding?pageSize=100",
  "/contracts",
  "/contracts?pageSize=100",
  "/contract-templates",
]);
export async function GET(request: Request) { const path=new URL(request.url).searchParams.get("path")??""; if(!ALLOWED_LOOKUPS.has(path))return NextResponse.json({message:"Lookup is not available."},{status:400}); try { const response=await apiRequest(path); return proxyApiJsonResponse(response); } catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Unable to load lookup."},{status:502})} }
