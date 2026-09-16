import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader, StateMessage } from '@/components/ui/Page';
import { fetchMonitoredSites, fetchTrafficReport } from '@/lib/blocks';
import type { MonitoredSite, OriginReport, ProviderReport, TrafficFilters, TrafficReport } from '@/lib/admin-types';

const sample: OriginReport = {
  summary: [[124, 38, 19, 101]],
  daily: [['2026-09-14', 32], ['2026-09-15', 54], ['2026-09-16', 38]],
  countries: [['United States', 71], ['United Kingdom', 32], ['Unknown', 21]], paths: [['/', 124]],
  recent: [['2026-09-16T12:05:00Z', '/', '192.0.2.10', 'United States', 'Example city', 'Example network', 'hosting', 'suspected', 'Declared automation user-agent', false, false, false],
    ['2026-09-16T12:04:00Z', '/', '2001:db8::1', 'United Kingdom', null, 'Example broadband', 'residential', 'unknown', '', true, false, false]],
};

function Notice({ report }: { report: ProviderReport<unknown> }) {
  return <p className={report.status === 'error' ? 'text-danger' : 'text-muted'} role={report.status === 'error' ? 'alert' : undefined}>
    <span className={`admin-status ${report.status === 'connected' ? '' : 'is-warning'}`}>{report.status === 'setup' ? 'Setup needed' : report.status === 'error' ? 'Unavailable' : 'Connected'}</span> {report.message}
  </p>;
}

function Metrics({ labels, values }: { labels: string[]; values: (number | string)[] }) {
  return <div className="traffic-metrics">{labels.map((label, i) => <div className="admin-card" key={label}><p>{label}</p><strong>{typeof values[i] === 'number' ? values[i].toLocaleString() : values[i] ?? '—'}</strong></div>)}</div>;
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(row => row[1]));
  return <section className="admin-card"><h2>{title}</h2>{rows.length ? <ul className="traffic-breakdown">{rows.map(([label, count]) => <li key={label}><div><span>{label || 'Unknown'}</span><strong>{count.toLocaleString()}</strong></div><meter min={0} max={max} value={count} aria-label={`${label}: ${count} requests`} /></li>)}</ul> : <p className="text-muted">No recorded requests in this window.</p>}</section>;
}

function Origin({ data }: { data: OriginReport }) {
  return <>
    <Metrics labels={['Recorded requests', 'Unique known IPs', 'Suspected bot requests', 'Enriched requests']} values={data.summary[0] ?? [0, 0, 0, 0]} />
    <div className="traffic-charts">
      <Breakdown title="Daily requests · UTC" rows={data.daily} />
      <Breakdown title="Top countries" rows={data.countries} />
      <Breakdown title="Top public paths" rows={data.paths} />
    </div>
    <section className="admin-card mt-4"><h2>Recent requests</h2><p className="text-muted">Latest 100 requests. Location is approximate. VPN and network risk are not bot verdicts; unclassified requests remain unknown.</p>
      {data.recent.length === 0 ? <StateMessage title="No requests recorded in this window" /> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Recent requests">
        <table className="table traffic-table"><thead><tr>{['Time · UTC', 'Path', 'Public IP', 'Approx. location', 'Provider / network', 'Classification / evidence', 'Anonymity flags'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {data.recent.map((r, i) => <tr key={i}><td>{String(r[0]).replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '')}</td><td>{r[1]}</td><td><code>{r[2] || 'Unknown'}</code></td><td>{[r[4], r[3]].filter(Boolean).join(', ') || 'Unknown'}</td><td>{r[5] || 'Unknown'}<small>{r[6] || 'unknown'}</small></td><td><span className={`admin-status ${r[7] === 'suspected' ? 'is-warning' : ''}`}>{r[7] || 'unknown'}</span><small>{r[8] || 'No automation evidence'}</small></td><td>{[r[9] === true ? 'VPN' : '', r[10] === true ? 'Proxy' : '', r[11] === true ? 'Tor' : ''].filter(Boolean).join(', ') || 'None reported'}</td></tr>)}
        </tbody></table>
      </div>}
    </section>
  </>;
}

export default function TrafficPage() {
  const [filters, setFilters] = useState<TrafficFilters>({ site_id: '', days: 1, network: 'all', bot: 'all' });
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [data, setData] = useState<TrafficReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    fetchMonitoredSites().then(result => {
      if (!active) return;
      setSites(result);
      if (result.length) setFilters(current => ({ ...current, site_id: result[0].site_id }));
      else { setError('No monitored sites are assigned to your account. Configure a site and its ownership on the server.'); setLoading(false); }
    }).catch((e: Error) => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!filters.site_id) return;
    let active = true;
    fetchTrafficReport(filters).then(result => { if (active) { setData(result); setLoading(false); } })
      .catch((e: Error) => { if (active) { setError(e.message); setData(null); setLoading(false); } });
    return () => { active = false; };
  }, [filters, revision]);
  function refresh() { setData(null); setLoading(true); setError(''); setRevision(revision + 1); }
  function change(next: TrafficFilters) { setData(null); setLoading(true); setError(''); setFilters(next); }
  return <Page className="admin-page">
    <PageHeader title="Traffic" description="Understand public requests and the signals behind them."><Link className="btn btn-quiet" to="/admin">← Admin dashboard</Link></PageHeader>
    <div className="traffic-toolbar">
      <label>Monitored site<select className="form-select" value={filters.site_id} disabled={preview || sites.length === 0} onChange={e => change({ ...filters, site_id: e.target.value })}>{sites.map(site => <option key={site.site_id} value={site.site_id}>{site.domain || site.name}</option>)}</select></label>
      <label>Time range<select className="form-select" value={filters.days} disabled={preview} onChange={e => change({ ...filters, days: Number(e.target.value) })}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></label>
      <label>Network<select className="form-select" value={filters.network} disabled={preview} onChange={e => change({ ...filters, network: e.target.value })}>{['all', 'residential', 'business', 'wireless', 'hosting', 'unknown'].map(value => <option key={value} value={value}>{value === 'all' ? 'All networks' : value}</option>)}</select></label>
      <label>Automation<select className="form-select" value={filters.bot} disabled={preview} onChange={e => change({ ...filters, bot: e.target.value })}><option value="all">All classifications</option><option value="suspected">Suspected bot</option><option value="unknown">Unknown</option></select></label>
      <button className="btn btn-accent" disabled={loading || !filters.site_id} onClick={refresh}>{loading ? 'Loading…' : 'Refresh'}</button>
    </div>
    {error ? <StateMessage title={error} error /> : loading ? <StateMessage title="Verifying access and loading traffic…" /> : data && <>
      <div className="traffic-context"><p className="text-muted">Updated {new Date(data.generated_at).toLocaleString()} · Refresh manually</p><button className="btn btn-quiet" onClick={() => setPreview(!preview)}>{preview ? 'Return to live data' : 'View sample preview'}</button></div>
      {preview ? <><StateMessage title="Sample preview — not live traffic">Illustrative data and reserved example IPs. Filters are disabled for this fixed sample.</StateMessage><Origin data={sample} /></> : <>
        <p className="text-muted">Showing only {data.site.domain || data.site.name}. Historical events without this site's ID are excluded.</p>
        <section className="admin-card mb-4"><h2>Monitored target · DNS and IP</h2><Notice report={data.target} />{data.target.data && <>
          <p>DNS: {data.target.data.dns_status} · Target IP enrichment: {data.target.data.proxycheck_status}</p>
          <ul>{data.target.data.addresses.map(address => <li key={`${address.source}:${address.target_ip}`}><code>{address.target_ip}</code> · {address.dns_record_type} · {address.source}</li>)}</ul>
          {data.target.data.lookups.map(lookup => <p key={lookup.lookup_ip}><strong>Target lookup: {lookup.lookup_ip}</strong> — {lookup.result.enriched ? [lookup.result.provider, lookup.result.network, lookup.result.country].filter(Boolean).join(' · ') : 'Enrichment unavailable'}</p>)}
        </>}</section>
        <section aria-label="Origin traffic"><h2>Public origin requests</h2><Notice report={data.posthog} />{data.posthog.data && <Origin data={data.posthog.data} />}</section>
        <section className="admin-card mt-4"><h2>Cloudflare · domain traffic</h2><Notice report={data.cloudflare} />{data.cloudflare.data && <>
          <Metrics labels={['Edge requests (estimated)', 'Data transferred', 'Visits (Cloudflare definition)']} values={[data.cloudflare.data.totals[0]?.count ?? 0, `${((data.cloudflare.data.totals[0]?.sum.edgeResponseBytes ?? 0) / 1024 / 1024).toFixed(2)} MiB`, data.cloudflare.data.totals[0]?.sum.visits ?? 0]} />
          <Breakdown title="Daily edge requests · UTC" rows={data.cloudflare.data.daily.map(row => [row.dimensions.date, row.count])} />
        </>}</section>
      </>}
      <div className="admin-grid mt-4"><section className="admin-card"><h2>Capture health</h2>
        <dl className="traffic-settings"><dt>Capture</dt><dd>{data.capture.ready ? 'Configured' : data.capture.enabled ? 'Incomplete setup' : 'Disabled'}</dd><dt>Forwarded IP trust</dt><dd>{data.capture.ip_trust_configured ? 'Configured by operator' : 'Off — IPs unknown'}</dd><dt>IP enrichment</dt><dd>{data.capture.enrichment_configured ? 'Key configured' : 'Not configured'}</dd><dt>Queue drops / delivery failures</dt><dd>{data.capture.dropped_this_process} / {data.capture.failed_this_process} (this process)</dd></dl>
        <p className="text-muted">Only public GET/HEAD requests to / are recorded by the API. Vite navigation and cached edge responses do not reach this collector. Background delivery is best effort.</p>
      </section><section className="admin-card"><h2>Shared usage limits</h2><Notice report={data.quotas} />{data.quotas.data && <dl className="traffic-settings"><dt>Events this month</dt><dd>{data.quotas.data.events.toLocaleString()} / {data.quotas.data.event_cap.toLocaleString()}</dd><dt>IP lookups today</dt><dd>{data.quotas.data.lookups.toLocaleString()} / {data.quotas.data.lookup_cap.toLocaleString()}</dd></dl>}<p className="text-muted">Maximum report window: 30 days. Set data retention and billing caps at each provider.</p></section></div>
    </>}
  </Page>;
}
