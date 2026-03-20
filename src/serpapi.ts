/**
 * Thin SerpApi wrapper for Amazon search.
 *
 * NOTE: this is a stand-in for the real Amazon Product Advertising API (PA-API 5.0).
 * The response shape is normalized to { AmazonProduct[] } so swapping the backend
 * later is a one-file change — the MCP tool surface and widget stay identical.
 */

export interface AmazonProduct {
  asin: string;
  title: string;
  url: string;
  thumbnail?: string;
  price?: string; // formatted, e.g. "$19.99"
  price_raw?: number; // numeric, if available
  rating?: number; // 0-5
  reviews?: number;
  prime?: boolean;
  sponsored?: boolean;
}

export interface AmazonSearchResult {
  query: string;
  total_results?: number;
  products: AmazonProduct[];
}

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

export async function searchAmazon(
  query: string,
  opts: { page?: number; limit?: number } = {},
): Promise<AmazonSearchResult> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPAPI_KEY environment variable is not set. Get one at https://serpapi.com/manage-api-key",
    );
  }

  const params = new URLSearchParams({
    engine: "amazon",
    amazon_domain: "amazon.com",
    k: query,
    api_key: apiKey,
    page: String(opts.page ?? 1),
  });

  const res = await fetch(`${SERPAPI_ENDPOINT}?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SerpApi request failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as SerpApiAmazonResponse;

  const products: AmazonProduct[] = (json.organic_results ?? [])
    .slice(0, opts.limit ?? 20)
    .map((r) => ({
      asin: r.asin,
      title: r.title,
      url: r.link_clean ?? r.link,
      thumbnail: r.thumbnail,
      price: r.extracted_price
        ? `$${r.extracted_price.toFixed(2)}`
        : r.price,
      price_raw: r.extracted_price,
      rating: r.rating,
      reviews: r.reviews,
      prime: r.prime,
      sponsored: r.sponsored,
    }))
    .filter((p) => p.asin); // drop anything without an ASIN

  return {
    query,
    total_results: json.search_information?.total_results,
    products,
  };
}

// Subset of SerpApi's Amazon engine response — only the fields we consume.
interface SerpApiAmazonResponse {
  search_information?: { total_results?: number };
  organic_results?: Array<{
    asin: string;
    title: string;
    link: string;
    link_clean?: string;
    thumbnail?: string;
    price?: string;
    extracted_price?: number;
    rating?: number;
    reviews?: number;
    prime?: boolean;
    sponsored?: boolean;
  }>;
}
