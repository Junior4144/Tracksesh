import { useAuth } from '@/components/AuthProvider';
import HomeContent from './HomeContent';

export default function HomePage() {
  const { isLoggedIn } = useAuth();
  return <HomeContent isLoggedIn={isLoggedIn} />;
}
