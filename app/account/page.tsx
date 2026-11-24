import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { AccountDashboard } from "@/components/storefront/account-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "My account" };
export const instant = false;

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();
  let customerId: string | null = null;

  if (user) {
    const { data: link } = await supabase.from("customer_auth_links").select("customer_id").eq("user_id", user.id).maybeSingle();
    customerId = link?.customer_id ? String(link.customer_id) : null;
  }

  let customer: { full_name: string; email: string; phone: string } | null = null;
  let orders: Record<string, unknown>[] = [];
  let addresses: Record<string, unknown>[] = [];
  let furnitureRequests: Record<string, unknown>[] = [];
  let interiorRequests: Record<string, unknown>[] = [];
  let quotations: Record<string, unknown>[] = [];
  let revisions: Record<string, unknown>[] = [];
  let quotationItems: Record<string, unknown>[] = [];

  if (customerId) {
    const [customerResult, orderResult, addressResult, furnitureResult, interiorResult, quotationResult, revisionResult, itemResult] = await Promise.all([
      supabase.from("customers").select("full_name,email,phone").eq("id", customerId).maybeSingle(),
      supabase.from("orders").select("id,public_reference,status,payment_status,currency,total,created_at,order_items(product_name_snapshot,quantity,line_total)").eq("customer_id", customerId).order("created_at", { ascending: false }),
      supabase.from("customer_addresses").select("id,label,recipient_name,phone,address_line1,address_line2,locality,district,postal_code,delivery_notes,is_default").eq("customer_id", customerId).order("created_at", { ascending: false }),
      supabase.from("quote_requests").select("id,public_reference,status,description,created_at").eq("customer_id", customerId).order("created_at", { ascending: false }),
      supabase.from("interior_quote_requests").select("id,public_reference,status,description,property_type,total_square_feet,created_at").eq("customer_id", customerId).order("created_at", { ascending: false }),
      supabase.from("quotations").select("id,quote_request_id,interior_quote_request_id,public_reference,status,current_revision,expires_at,created_at").order("created_at", { ascending: false }),
      supabase.from("quotation_revisions").select("id,quotation_id,revision_number,total,currency,terms,valid_until,status,customer_response_at,created_at").order("revision_number", { ascending: false }),
      supabase.from("quotation_items").select("revision_id,description,quantity,unit_price,line_total").order("created_at", { ascending: true }),
    ]);
    customer = customerResult.data;
    orders = (orderResult.data ?? []) as unknown as Record<string, unknown>[];
    addresses = (addressResult.data ?? []) as unknown as Record<string, unknown>[];
    furnitureRequests = (furnitureResult.data ?? []) as unknown as Record<string, unknown>[];
    interiorRequests = (interiorResult.data ?? []) as unknown as Record<string, unknown>[];
    quotations = (quotationResult.data ?? []) as unknown as Record<string, unknown>[];
    revisions = (revisionResult.data ?? []) as unknown as Record<string, unknown>[];
    quotationItems = (itemResult.data ?? []) as unknown as Record<string, unknown>[];
  }

  return <><SiteHeader /><main className="account-page"><div className="account-shell">
    <p className="eyebrow">Your Furni X account</p>
    {!user ? <><h1>Your orders,<br /><em>all in one place.</em></h1><p className="account-intro">Sign in with the email you used at checkout to securely access your orders and design requests.</p><Link className="button button-dark" href="/account/claim">Continue with email</Link></>
      : !customerId ? <><h1>Verify your email<br /><em>to continue.</em></h1><p className="account-intro">Your account is signed in, but it is not linked to customer records yet. Verify the email used for your order or quote to claim matching records.</p><Link className="button button-dark" href="/account/claim">Verify and find my records</Link></>
      : customer ? <><div className="account-heading-row"><div><h1>Hello, <em>{customer.full_name.split(" ")[0]}.</em></h1><p className="account-intro">Your orders, design requests and saved delivery details.</p></div><span className="account-email">{customer.email}</span></div>{params.claimed === "1" && <p className="account-notice is-success" role="status">Your verified records are now linked to this account.</p>}<AccountDashboard customer={customer} orders={orders} addresses={addresses} furnitureRequests={furnitureRequests} interiorRequests={interiorRequests} quotations={quotations} revisions={revisions} quotationItems={quotationItems} /></>
      : <><h1>Account details<br /><em>unavailable.</em></h1><p className="account-intro">We couldn’t load your customer profile. Refresh the page or contact us for help.</p></>}
  </div></main><SiteFooter /></>;
}
