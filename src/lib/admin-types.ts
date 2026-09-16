export interface ProviderReport<T> {
  status: 'setup' | 'connected' | 'error';
  message: string;
  data: T | null;
}
export interface AdminOverview {
  database: ProviderReport<{ name: string; rls_enabled: boolean; rls_forced: boolean; estimated_rows: number; policies: number }[]>;
  security: { name: string; detail: string }[];
}
export type TrafficCell = string | number | boolean | null;
export interface OriginReport {
  summary: number[][];
  daily: [string, number][];
  countries: [string, number][];
  paths: [string, number][];
  recent: TrafficCell[][];
}
export interface TrafficReport {
  site: MonitoredSite;
  target: ProviderReport<{
    dns_status: string;
    addresses: { target_ip: string; dns_record_type: string; source: string }[];
    proxycheck_status: string;
    lookups: { lookup_ip: string; lookup_purpose: string; result: { network: string; country: string | null; provider: string | null; enriched: boolean } }[];
  }>;
  generated_at: string;
  posthog: ProviderReport<OriginReport>;
  cloudflare: ProviderReport<{
    totals: { count: number; sum: { edgeResponseBytes: number; visits: number } }[];
    daily: { count: number; dimensions: { date: string } }[];
  }>;
  quotas: ProviderReport<{ events: number; event_cap: number; lookups: number; lookup_cap: number }>;
  capture: { enabled: boolean; ready: boolean; ip_trust_configured: boolean; enrichment_configured: boolean; dropped_this_process: number; failed_this_process: number };
}
export interface MonitoredSite { site_id: string; name: string; domain: string | null }
export interface TrafficFilters { site_id: string; days: number; network: string; bot: string }
