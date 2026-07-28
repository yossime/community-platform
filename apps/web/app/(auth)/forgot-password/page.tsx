'use client';

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Spinner } from '@platform/ui/src/components/spinner';

import { resetPassword } from '@/lib/auth';

const emailSchema = z.string().email('כתובת אימייל לא תקינה');

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? 'שגיאה בנתונים');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch {
      setError('אירעה שגיאה בשליחת הבקשה. נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="font-rubik text-2xl">בדוק את האימייל</CardTitle>
          <CardDescription>
            שלחנו לך קישור לאיפוס סיסמה לכתובת {email}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            לא קיבלת? בדוק בתיקיית הספאם או{' '}
            <button
              onClick={() => setSent(false)}
              className="text-primary hover:underline"
            >
              נסה שוב
            </button>
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            חזרה להתחברות
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="font-rubik text-2xl">שכחת סיסמה?</CardTitle>
        <CardDescription>הזן את כתובת האימייל שלך ונשלח לך קישור לאיפוס</CardDescription>
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

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Spinner size="sm" className="text-primary-foreground" /> : 'שלח קישור לאיפוס'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/login" className="text-sm text-primary hover:underline">
          חזרה להתחברות
        </Link>
      </CardFooter>
    </Card>
  );
}
