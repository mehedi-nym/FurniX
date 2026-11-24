import { createClient } from "@/lib/supabase/server";

export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  base_price: number;
  discount_price: number | null;
  currency: string;
  is_featured: boolean;
  dimensions: Record<string, unknown>;
  materials: string[];
};

export type ProductMedia = {
  id: string;
  product_id: string;
  storage_path: string;
  media_type: "image" | "video";
  alt_text: string | null;
  sort_order: number;
  public_url: string;
};

export type ProductOptionGroup = {
  id: string;
  product_id: string;
  name: string;
  selection_mode: "single" | "multiple";
  is_required: boolean;
  sort_order: number;
  options: Array<{
    id: string;
    label: string;
    value: string;
    price_delta: number;
    sort_order: number;
  }>;
};

export type ProductVariant = {
  id: string;
  sku: string;
  price_override: number | null;
  price_delta: number;
  stock_quantity: number | null;
  option_ids: string[];
};

export type CustomizationRule = {
  id: string;
  name: string;
  target_type: "dimension" | "option" | "feature";
  target_key: string;
  charge_type: "fixed" | "per_unit" | "percentage" | null;
  amount: number | null;
  per_unit_basis: "dimension_delta" | "quantity" | "selection" | null;
  percentage_base: "base_price" | "base_plus_options" | null;
  minimum_value: number | null;
  maximum_value: number | null;
  manual_quote_only: boolean;
  priority: number;
  valid_from: string | null;
  valid_until: string | null;
};

export async function getCategories(): Promise<CatalogCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id,slug,name,parent_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as CatalogCategory[];
}

export async function getCatalogProducts(options: {
  query?: string;
  categorySlug?: string;
  limit?: number;
} = {}): Promise<Array<CatalogProduct & { media: ProductMedia[] }>> {
  const supabase = await createClient();
  const limit = options.limit ?? 48;
  let productIds: string[] | null = null;

  if (options.categorySlug) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", options.categorySlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!category) return [];

    const { data: assignments } = await supabase
      .from("product_categories")
      .select("product_id")
      .eq("category_id", category.id);
    productIds = [...new Set((assignments ?? []).map((row) => row.product_id as string))];
    if (!productIds.length) return [];
  }

  let productsQuery = supabase
    .from("products")
    .select("id,slug,sku,name,description,base_price,discount_price,currency,is_featured,dimensions,materials")
    .eq("is_published", true)
    .order("is_featured", { ascending: false })
    .order("name", { ascending: true })
    .limit(limit);

  if (productIds) productsQuery = productsQuery.in("id", productIds);
  const trimmedQuery = options.query?.trim();
  if (trimmedQuery) productsQuery = productsQuery.ilike("name", `%${trimmedQuery.replace(/[%_,]/g, " ")}%`);

  const { data } = await productsQuery;
  const products = (data ?? []) as CatalogProduct[];
  if (!products.length) return [];

  const { data: mediaRows } = await supabase
    .from("product_media")
    .select("id,product_id,storage_path,media_type,alt_text,sort_order")
    .in("product_id", products.map((product) => product.id))
    .eq("media_type", "image")
    .order("sort_order", { ascending: true });

  const media = (mediaRows ?? []).map((row) => ({
    ...row,
    public_url: supabase.storage.from("product-media").getPublicUrl(row.storage_path).data.publicUrl,
  })) as ProductMedia[];
  const mediaByProduct = new Map<string, ProductMedia[]>();
  for (const item of media) mediaByProduct.set(item.product_id, [...(mediaByProduct.get(item.product_id) ?? []), item]);

  return products.map((product) => ({ ...product, media: mediaByProduct.get(product.id) ?? [] }));
}

export async function getProductBySlug(slug: string) {
  const supabase = await createClient();
  const { data: productData } = await supabase
    .from("products")
    .select("id,slug,sku,name,description,base_price,discount_price,currency,is_featured,dimensions,materials,specifications")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!productData) return null;

  const [mediaResponse, groupResponse, variantResponse, ruleResponse, categoryResponse] = await Promise.all([
    supabase.from("product_media")
      .select("id,product_id,storage_path,media_type,alt_text,sort_order")
      .eq("product_id", productData.id)
      .eq("media_type", "image")
      .order("sort_order", { ascending: true }),
    supabase.from("product_option_groups")
      .select("id,product_id,name,selection_mode,is_required,sort_order")
      .eq("product_id", productData.id)
      .order("sort_order", { ascending: true }),
    supabase.from("product_variants")
      .select("id,sku,price_override,price_delta,stock_quantity")
      .eq("product_id", productData.id)
      .eq("is_active", true),
    supabase.from("product_customization_rules")
      .select("id,name,target_type,target_key,charge_type,amount,per_unit_basis,percentage_base,minimum_value,maximum_value,manual_quote_only,priority,valid_from,valid_until")
      .eq("product_id", productData.id)
      .eq("is_active", true)
      .order("priority", { ascending: true }),
    supabase.from("product_categories")
      .select("category:categories(id,slug,name,parent_id)")
      .eq("product_id", productData.id),
  ]);

  const groups = (groupResponse.data ?? []) as Array<Omit<ProductOptionGroup, "options">>;
  const groupIds = groups.map((group) => group.id);
  const [optionResponse, mappingResponse] = await Promise.all([
    groupIds.length
      ? supabase.from("product_options")
          .select("id,group_id,label,value,price_delta,sort_order")
          .in("group_id", groupIds)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    variantResponse.data?.length
      ? supabase.from("variant_option_values").select("variant_id,option_id").in("variant_id", variantResponse.data.map((variant) => variant.id))
      : Promise.resolve({ data: [] }),
  ]);

  const options = (optionResponse.data ?? []) as Array<{ id: string; group_id: string; label: string; value: string; price_delta: number; sort_order: number }>;
  const productOptions = groups.map((group) => ({
    ...group,
    options: options.filter((option) => option.group_id === group.id).map(({ id, label, value, price_delta, sort_order }) => ({ id, label, value, price_delta, sort_order })),
  })) as ProductOptionGroup[];
  const mappings = mappingResponse.data ?? [];
  const variants = ((variantResponse.data ?? []) as Array<Omit<ProductVariant, "option_ids">>).map((variant) => ({
    ...variant,
    option_ids: mappings.filter((mapping) => mapping.variant_id === variant.id).map((mapping) => mapping.option_id),
  })) as ProductVariant[];
  const media = (mediaResponse.data ?? []).map((row) => ({
    ...row,
    public_url: supabase.storage.from("product-media").getPublicUrl(row.storage_path).data.publicUrl,
  })) as ProductMedia[];

  return {
    ...(productData as CatalogProduct & { specifications: Record<string, unknown> }),
    media,
    optionGroups: productOptions,
    variants,
    customizationRules: (ruleResponse.data ?? []) as CustomizationRule[],
    categories: (categoryResponse.data ?? []).flatMap((row) => row.category ?? []) as CatalogCategory[],
  };
}
