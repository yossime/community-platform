'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { Button } from '@platform/ui/src/components/button';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Separator } from '@platform/ui/src/components/separator';
import { Spinner } from '@platform/ui/src/components/spinner';

import { signUpWithEmail } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

// ─── Step Schemas ───────────────────────────────────────

const step1Schema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
  confirmPassword: z.string(),
  gender: z.enum(['MALE', 'FEMALE'], { required_error: 'יש לבחור מגדר' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'הסיסמאות אינן תואמות',
  path: ['confirmPassword'],
});

const step2Schema = z.object({
  displayName: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים').max(50),
  username: z.string()
    .min(3, 'שם משתמש חייב להכיל לפחות 3 תווים')
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'שם משתמש יכול להכיל רק אותיות באנגלית קטנות, מספרים ומקפים'),
  location: z.string().max(100).optional(),
});

// ─── Types ──────────────────────────────────────────────

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  gender: 'MALE' | 'FEMALE' | '';
  displayName: string;
  username: string;
  location: string;
  bio: string;
}

const STEPS = [
  { title: 'פרטי התחברות', description: 'אימייל וסיסמה' },
  { title: 'פרטים אישיים', description: 'שם ופרופיל' },
  { title: 'סיום', description: 'ברוך הבא!' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    gender: '',
    displayName: '',
    username: '',
    location: '',
    bio: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [supabaseAuthId, setSupabaseAuthId] = useState<string | null>(null);

  const completeRegistration = trpc.user.completeRegistration.useMutation();

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleStep1 = async () => {
    const result = step1Schema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const path = err.path[0] as string;
        fieldErrors[path] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const data = await signUpWithEmail(formData.email, formData.password);
      if (data.user) {
        setSupabaseAuthId(data.user.id);
        setStep(1);
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('already registered')) {
          setErrors({ email: 'כתובת אימייל זו כבר רשומה במערכת' });
        } else {
          setErrors({ email: 'אירעה שגיאה בהרשמה. נסה שוב' });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    const result = step2Schema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const path = err.path[0] as string;
        fieldErrors[path] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (!supabaseAuthId) {
      setErrors({ general: 'שגיאה. נסה להתחיל מחדש' });
      return;
    }

    setLoading(true);
    try {
      await completeRegistration.mutateAsync({
        supabaseAuthId,
        email: formData.email,
        displayName: formData.displayName,
        username: formData.username,
        gender: formData.gender as 'MALE' | 'FEMALE',
        location: formData.location || undefined,
        bio: formData.bio || undefined,
      });
      setStep(2);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('שם המשתמש כבר תפוס')) {
          setErrors({ username: 'שם המשתמש כבר תפוס' });
        } else {
          setErrors({ general: 'אירעה שגיאה ביצירת הפרופיל. נסה שוב' });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="font-rubik text-2xl">הרשמה</CardTitle>
        <CardDescription>{STEPS[step]?.description}</CardDescription>
        {/* Step indicator */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  i <= step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 ${
                    i < step ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {errors.general && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errors.general}
          </div>
        )}

        {/* Step 1: Email + Password + Gender */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                dir="ltr"
                className="text-start"
                disabled={loading}
                autoComplete="email"
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                placeholder="לפחות 8 תווים"
                value={formData.password}
                onChange={(e) => updateField('password', e.target.value)}
                dir="ltr"
                className="text-start"
                disabled={loading}
                autoComplete="new-password"
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">אימות סיסמה</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="הקלד שוב את הסיסמה"
                value={formData.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                dir="ltr"
                className="text-start"
                disabled={loading}
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>מגדר</Label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => updateField('gender', 'MALE')}
                  className={`flex-1 rounded-md border p-3 text-center text-sm transition-colors ${
                    formData.gender === 'MALE'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-accent'
                  }`}
                  disabled={loading}
                >
                  זכר
                </button>
                <button
                  type="button"
                  onClick={() => updateField('gender', 'FEMALE')}
                  className={`flex-1 rounded-md border p-3 text-center text-sm transition-colors ${
                    formData.gender === 'FEMALE'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-accent'
                  }`}
                  disabled={loading}
                >
                  נקבה
                </button>
              </div>
              {errors.gender && <p className="text-sm text-destructive">{errors.gender}</p>}
            </div>

            <Button onClick={handleStep1} className="w-full" disabled={loading}>
              {loading ? <Spinner size="sm" className="text-primary-foreground" /> : 'המשך'}
            </Button>
          </div>
        )}

        {/* Step 2: Profile Setup */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">שם תצוגה</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="ישראל כהן"
                value={formData.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                disabled={loading}
              />
              {errors.displayName && (
                <p className="text-sm text-destructive">{errors.displayName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">שם משתמש (באנגלית)</Label>
              <Input
                id="username"
                type="text"
                placeholder="israel-cohen"
                value={formData.username}
                onChange={(e) => updateField('username', e.target.value.toLowerCase())}
                dir="ltr"
                className="text-start"
                disabled={loading}
                autoComplete="username"
              />
              <p className="text-xs text-muted-foreground">
                אותיות קטנות באנגלית, מספרים ומקפים בלבד
              </p>
              {errors.username && <p className="text-sm text-destructive">{errors.username}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">מיקום (אופציונלי)</Label>
              <Input
                id="location"
                type="text"
                placeholder="ירושלים"
                value={formData.location}
                onChange={(e) => updateField('location', e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">אודות (אופציונלי)</Label>
              <Input
                id="bio"
                type="text"
                placeholder="ספר על עצמך..."
                value={formData.bio}
                onChange={(e) => updateField('bio', e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(0)}
                className="flex-1"
                disabled={loading}
              >
                חזרה
              </Button>
              <Button onClick={handleStep2} className="flex-1" disabled={loading}>
                {loading ? <Spinner size="sm" className="text-primary-foreground" /> : 'צור חשבון'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Welcome */}
        {step === 2 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
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
            <div>
              <h3 className="font-rubik text-xl font-bold">
                ברוך הבא, {formData.displayName}!
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                החשבון שלך נוצר בהצלחה. כעת תוכל לגלוש בפורומים, לפרסם תוכן ולהתחבר עם אנשי מקצוע.
              </p>
            </div>
            <Button
              onClick={() => {
                router.push('/forums');
                router.refresh();
              }}
              className="w-full"
            >
              התחל לגלוש
            </Button>
          </div>
        )}
      </CardContent>
      {step < 2 && (
        <CardFooter className="flex-col gap-4">
          <Separator />
          <p className="text-center text-sm text-muted-foreground">
            כבר יש לך חשבון?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              התחבר
            </Link>
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
