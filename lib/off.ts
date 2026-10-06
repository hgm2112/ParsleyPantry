import { cacheLife } from "next/cache";

export type OffProduct = {
  barcode: string;
  name: string | null;
  brands: string | null;
  categories: string[];
  quantity: string | null;
  stores: string | null;
  expirationDate: string | null;
};

const FIELDS = [
  "product_name",
  "brands",
  "categories",
  "categories_tags",
  "quantity",
  "stores",
  "expiration_date",
].join(",");

/**
 * Looks a barcode up in Open Food Facts (ODbL). Cached for a day so repeat
 * scans of the same product don't hit the API. Returns null when unknown.
 */
export async function lookupOffProduct(
  barcode: string,
): Promise<OffProduct | null> {
  "use cache";
  cacheLife("days");

  if (!/^\d{6,14}$/.test(barcode)) return null;

  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "ParsleyPantry/1.0 (personal pantry app)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const body = (await response.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      categories?: string;
      categories_tags?: string[];
      quantity?: string;
      stores?: string;
      expiration_date?: string;
    };
  };

  if (body.status !== 1 || !body.product) return null;

  const product = body.product;
  const categories = (product.categories ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    barcode,
    name: product.product_name?.trim() || null,
    brands: product.brands?.trim() || null,
    categories: [
      ...new Set([...categories, ...(product.categories_tags ?? [])]),
    ],
    quantity: product.quantity?.trim() || null,
    stores: product.stores?.trim() || null,
    expirationDate: product.expiration_date?.trim() || null,
  };
}
