import { useEffect } from 'react';
import { useLocation } from 'react-router';

// Keep metadata correct when React navigates without requesting a new document.
export function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const home = pathname === '/';
    document.title = home
      ? 'Study Time Tracker & Study Planner | Tracksesh'
      : 'Study workspace | Tracksesh';
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = home ? 'index, follow' : 'noindex, follow';
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (home) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
      }
      canonical.href = 'https://tracksesh.com/';
    } else {
      canonical?.remove();
    }
    let socialUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (home) {
      if (!socialUrl) {
        socialUrl = document.createElement('meta');
        socialUrl.setAttribute('property', 'og:url');
        document.head.append(socialUrl);
      }
      socialUrl.content = 'https://tracksesh.com/';
    } else {
      socialUrl?.remove();
    }
  }, [pathname]);
  return null;
}
