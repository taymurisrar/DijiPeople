import type { Metadata } from "next";
import {RuntimeRecordRoute}from"@/app/_components/runtime/runtime-record-route";export default async function Page({params}:{params:Promise<{onboardingId:string}>}){const{onboardingId}=await params;return <RuntimeRecordRoute moduleKey="customer-onboarding" recordId={onboardingId}/>}

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Onboarding",
};

