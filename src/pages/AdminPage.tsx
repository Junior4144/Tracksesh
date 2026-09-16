import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader, StateMessage } from '@/components/ui/Page';
import { fetchAdminOverview } from '@/lib/blocks';
import type { AdminOverview } from '@/lib/admin-types';

export default function AdminPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    fetchAdminOverview().then(result => { if (active) setData(result); })
      .catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [revision]);
  return <Page className="admin-page">
    <PageHeader title="Admin dashboard" description="A private overview of traffic and database safeguards.">
      <Link className="btn btn-quiet" to="/account">Account</Link>
    </PageHeader>
    {error ? <StateMessage title={error} error><button className="btn btn-quiet" onClick={() => { setError(''); setRevision(revision + 1); }}>Retry</button></StateMessage> : !data ? <StateMessage title="Verifying administrator access…" /> : <>
      <Link className="admin-traffic-link" to="/admin/traffic">
        <div><p className="eyebrow">Traffic intelligence</p><h2>See what reaches Tracksesh</h2><p>Public requests, network signals and Cloudflare edge analytics.</p></div>
        <span>Open traffic panel →</span>
      </Link>
      <h2 className="mt-4">Security controls</h2>
      <div className="admin-grid">{data.security.map(item => <section className="admin-card" key={item.name}><h3>{item.name}</h3><p>{item.detail}</p></section>)}</div>
      <section className="admin-card mt-4">
        <h2>Database safeguards</h2><p className="text-muted">{data.database.message}</p>
        {data.database.status === 'error' ? <StateMessage title="Database check unavailable" error /> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Database safeguards">
          <table className="table"><thead><tr><th>Table</th><th>Row level security</th><th>Policies</th><th>Estimated rows</th></tr></thead><tbody>
            {data.database.data?.map(table => <tr key={table.name}><th>{table.name}</th><td><span className={`admin-status ${table.rls_enabled ? '' : 'is-warning'}`}>{table.rls_enabled ? 'Enabled' : 'Review needed'}</span></td><td>{table.policies}</td><td>{table.estimated_rows.toLocaleString()}</td></tr>)}
          </tbody></table>
        </div>}
      </section>
    </>}
  </Page>;
}
