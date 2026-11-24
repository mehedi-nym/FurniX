import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";
import { InteriorQuoteForm } from "@/components/storefront/interior-quote-form";
import { getInteriorReferences } from "@/lib/interiors/queries";

export const metadata = { title: "Interior design quotation" };
export const instant = false;

type PageProps = { searchParams: Promise<{ referenceId?: string }> };

export default async function InteriorQuotePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const references = await getInteriorReferences();
  const initialReferenceId = references.some((reference) => reference.id === params.referenceId) ? params.referenceId ?? "" : "";
  return (
    <div className="storefront">
      <SiteHeader />
      <main className="interior-quote-page section-wrap">
        <div className="interior-quote-intro">
          <p className="eyebrow"><span className="eyebrow-line" />A room, thoughtfully put together</p>
          <h1>Tell us about<br /><em>your space.</em></h1>
          <p>Share property details, rooms, design preferences, and references. Our team will review the scope and contact you about next steps.</p>
        </div>
        <InteriorQuoteForm references={references.map(({ id, project_name, media }) => ({ id, project_name, imageUrl: media.find((item) => item.media_type === "image")?.public_url ?? null }))} initialReferenceId={initialReferenceId} />
      </main>
      <SiteFooter />
    </div>
  );
}
