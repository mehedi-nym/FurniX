import { createClient } from "@/lib/supabase/server";

export type InteriorReferenceCategory = { id: string; slug: string; name: string; sort_order: number };
export type InteriorReference = {
  id: string;
  slug: string;
  project_name: string;
  description: string | null;
  room_type: string | null;
  materials: string[];
  category: InteriorReferenceCategory | null;
  media: Array<{ id: string; media_type: "image" | "video"; alt_text: string | null; sort_order: number; public_url: string }>;
};

export async function getInteriorReferenceCategories(): Promise<InteriorReferenceCategory[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("interior_reference_categories")
      .select("id,slug,name,sort_order").eq("is_active", true).order("sort_order", { ascending: true });
    return (data ?? []) as InteriorReferenceCategory[];
  } catch { return []; }
}

export async function getInteriorReferences(categorySlug = ""): Promise<InteriorReference[]> {
  try {
    const supabase = await createClient();
    let categoryId: string | null = null;
    if (categorySlug) {
      const { data: category } = await supabase.from("interior_reference_categories")
        .select("id").eq("slug", categorySlug).eq("is_active", true).maybeSingle();
      if (!category) return [];
      categoryId = category.id;
    }

    let query = supabase.from("interior_references")
      .select("id,slug,project_name,description,room_type,materials,category_id,category:interior_reference_categories(id,slug,name,sort_order)")
      .eq("is_published", true).order("created_at", { ascending: false }).limit(48);
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data: rows } = await query;
    if (!rows?.length) return [];

    const { data: mediaRows } = await supabase.from("interior_reference_media")
      .select("id,reference_id,storage_path,media_type,alt_text,sort_order")
      .in("reference_id", rows.map((row) => row.id)).order("sort_order", { ascending: true });

    const mediaByReference = new Map<string, InteriorReference["media"]>();
    for (const media of mediaRows ?? []) {
      const item = {
        id: media.id,
        media_type: media.media_type as "image" | "video",
        alt_text: media.alt_text,
        sort_order: media.sort_order,
        public_url: supabase.storage.from("interior-reference-media").getPublicUrl(media.storage_path).data.publicUrl,
      };
      mediaByReference.set(media.reference_id, [...(mediaByReference.get(media.reference_id) ?? []), item]);
    }

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      project_name: row.project_name,
      description: row.description,
      room_type: row.room_type,
      materials: row.materials ?? [],
      category: (Array.isArray(row.category) ? row.category[0] : row.category) as InteriorReferenceCategory | null,
      media: mediaByReference.get(row.id) ?? [],
    }));
  } catch { return []; }
}
