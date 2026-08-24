import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next 16 renamed the `middleware` convention to `proxy`.
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets. Supabase needs to run on real page
     * requests so it can refresh the access token before render.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
