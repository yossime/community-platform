'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Separator } from '@platform/ui/src/components/separator';
import { Spinner } from '@platform/ui/src/components/spinner';

import { signInWithEmail } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
});

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/forums';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? 'שגיאה בנתונים');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(email, password);
      router.push(redirect);
      router.refresh();
    } catch (err) {
      if (err instanceof Error) {
        // Map Supabase errors to Hebrew
        if (err.message.includes('Invalid login credentials')) {
          setError('אימייל או סיסמה שגויים');
        } else if (err.message.includes('Email not confirmed')) {
          setError('האימייל לא אומת. בדוק את תיבת הדואר שלך');
        } else {
          setError('אירעה שגיאה בהתחברות. נסה שוב');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="font-rubik text-2xl">התחברות</CardTitle>
        <CardDescription>התחבר לחשבון שלך בקהילת אנשי מקצוע</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="text-start"
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">סיסמה</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                שכחת סיסמה?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="text-start"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Spinner size="sm" className="text-primary-foreground" /> : 'התחבר'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-4">
        <Separator />
        <p className="text-center text-sm text-muted-foreground">
          אין לך חשבון?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            הירשם עכשיו
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
