import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { fetchAdminAccess } from '@/lib/blocks';

export function AdminLink() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let current = true;
    fetchAdminAccess().then(data => { if (current) setAllowed(data.is_admin === true); }).catch(() => {});
    return () => { current = false; };
  }, []);
  return allowed ? <Link className="btn btn-accent mb-4" to="/admin">Admin dashboard</Link> : null;
}
