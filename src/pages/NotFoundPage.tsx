import { Link } from 'react-router';
import { Page, PageHeader } from '@/components/ui/Page';

export default function NotFoundPage() {
  return (
    <Page>
      <PageHeader title="Page not found" description="This address does not match a Tracksesh page." />
      <Link to="/" className="btn btn-accent">Back to home</Link>
    </Page>
  );
}
