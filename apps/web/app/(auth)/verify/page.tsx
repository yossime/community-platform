'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Button } from '@platform/ui/src/components/button';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    const handleVerification = async () => {
      const supabase = createSupabaseBrowserClient();

      // Check if the user already has a valid session (magic link auto-login)
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setStatus('success');
        setTimeout(() => {
          router.push('/forums');
          router.refresh();
        }, 2000);
      } else {
        // Check for error in URL params
        const error = searchParams.get('error');
        if (error) {
          setStatus('error');
        } else {
          setStatus('success');
          setTimeout(() => {
            router.push('/login');
          }, 3000);
        }
      }
    };

    handleVerification();
  }, [router, searchParams]);

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="font-rubik text-2xl">
          {status === 'verifying' && 'מאמת...'}
          {status === 'success' && 'האימייל אומת בהצלחה!'}
          {status === 'error' && 'שגיאה באימות'}
        </CardTitle>
        <CardDescription>
          {status === 'verifying' && 'אנחנו מאמתים את כתובת האימייל שלך'}
          {status === 'success' && 'מעביר אותך לאתר...'}
          {status === 'error' && 'הקישור אינו תקין או שפג תוקפו'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        {status === 'verifying' && <Spinner size="lg" />}
        {status === 'success' && (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {status === 'error' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <Button asChild>
              <Link href="/login">חזרה להתחברות</Link>
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        {status === 'verifying' && (
          <p className="text-xs text-muted-foreground">אנא המתן...</p>
        )}
      </CardFooter>
    </Card>
  );
}
