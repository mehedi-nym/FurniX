import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { FurnitureQuoteForm } from "@/components/storefront/furniture-quote-form";

export const metadata = { title: "Custom furniture quotation" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function safeDimensions(raw: string | string[] | undefined): Record<string, number> {
  if (typeof raw !== "string" || raw.length > 1000) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value).filter(([key, amount]) =>
      /^[a-zA-Z0-9_ -]{1,40}$/.test(key) && typeof amount === "number" && Number.isFinite(amount) && amount > 0 && amount <= 10000,
    ).map(([key, amount]) => [key, amount as number] as [string, number]);
    return Object.fromEntries(entries);
  } catch { return {}; }
}

export default async function CustomFurniturePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const productId = typeof params.productId === "string" && /^[0-9a-f-]{36}$/i.test(params.productId) ? params.productId : "";
  const productName = typeof params.productName === "string" ? params.productName.slice(0, 120) : "";
  const requirements = typeof params.requirements === "string" ? params.requirements.slice(0, 3000) : "";
  const quantity = typeof params.quantity === "string" && /^\d+$/.test(params.quantity) ? Math.min(100, Math.max(1, Number(params.quantity))) : 1;
  const dimensions = safeDimensions(params.dimensions);
  const dimensionUnit = typeof params.unit === "string" && ["mm", "cm", "in", "ft"].includes(params.unit) ? params.unit : "ft";
  return (
    <div className="storefront">
      <SiteHeader />
      <main className="quote-page section-wrap">
        <div className="quote-page-intro">
          <p className="eyebrow"><span className="eyebrow-line" />Made for your space</p>
          <h1>Let’s shape your<br /><em>idea into a piece.</em></h1>
          <p>Tell us about the furniture you have in mind. Add dimensions, material preferences, and reference files so our team can understand your direction.</p>
        </div>
        <FurnitureQuoteForm productId={productId} productName={productName} initialDimensions={dimensions} initialUnit={dimensionUnit} initialQuantity={quantity} initialRequirements={requirements} />
      </main>
      <SiteFooter />
    </div>
  );
}
