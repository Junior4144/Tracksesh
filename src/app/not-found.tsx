import { redirect } from 'next/navigation';

// Mirrors the Angular `{ path: '**', redirectTo: 'dashboard' }` catch-all.
export default function NotFound() {
  redirect('/dashboard');
}
