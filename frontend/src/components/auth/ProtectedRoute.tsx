'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../providers/AuthProvider';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If auth loading is done and there is no user, redirect to home page
    if (!loading && !user) {
      router.push('/home');
    }
  }, [user, loading, router]);

  // Optionally show a loading spinner while identifying user token
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Prevent flashing unauthenticated content
  if (!user) {
    return null; 
  }

  // Render the protected page content
  return <>{children}</>;
}
