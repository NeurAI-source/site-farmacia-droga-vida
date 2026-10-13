export interface NormalizedProduct {
  externalId?: string; reducedCode?: string; ean?: string; name: string; description?: string;
  priceCents?: number; stockQuantity: number; status: string | null;
  available: boolean; storeId: string; fetchedAt: string;
}
export interface OfficialContract {
  request(settings: {baseUrl: string; token: string; storeId: string}): {url: string; headers: Record<string,string>};
  decode(payload: unknown): unknown[];
}
export interface MappingPolicy {
  priceUnit: 'cents' | 'decimal';
  isSellable(status: unknown): boolean;
}
