import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { ClaimAccountForm } from "@/components/storefront/claim-account-form";

export const metadata: Metadata = { title: "Access your account" };
export const instant = false;

export default async function ClaimAccountPage({ searchParams }: PageProps<"/account/claim">) {
  const params = await searchParams;
  const result = typeof params.result === "string" ? params.result : "";
  return <><SiteHeader /><main className="account-page"><div className="account-shell account-claim-shell"><p className="eyebrow">Your Furni X account</p><h1>Find your orders<br /><em>and design requests.</em></h1><p className="account-intro">Enter the email you used at checkout. We’ll send a secure verification link. Guest checkout details stay private until you verify ownership.</p><ClaimAccountForm result={result} /><p className="account-back"><Link href="/">Back to the store</Link></p></div></main><SiteFooter /></>;
}
