import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent } from '@platform/ui/src/components/card';

export const metadata: Metadata = {
  title: 'קהילת אנשי מקצוע חרדים — הפלטפורמה המובילה',
  description:
    'הפלטפורמה המובילה לאנשי מקצוע בציבור החרדי. פורומים מקצועיים, שוק פרילנסרים, קורסים, פורטפוליו ועוד.',
};

const features = [
  {
    title: 'פורומים מקצועיים',
    description: 'דיונים מקצועיים, שאלות ותשובות ושיתוף ידע בקהילה',
    href: '/forums',
    icon: '💬',
  },
  {
    title: 'שוק פרילנסרים',
    description: 'מצא פרילנסרים מקצועיים או פרסם פרויקט ומצא את האיש המתאים',
    href: '/marketplace',
    icon: '🏪',
  },
  {
    title: 'קורסים',
    description: 'קורסים מקצועיים ללמידה עצמאית מהמומחים המובילים בתחום',
    href: '/courses',
    icon: '🎓',
  },
  {
    title: 'פורטפוליו',
    description: 'הציגו את העבודות שלכם וקבלו חשיפה מקצועית',
    href: '/portfolios',
    icon: '🎨',
  },
  {
    title: 'לוח מודעות',
    description: 'מודעות דרושים, שירותים, ציוד ועוד',
    href: '/classifieds',
    icon: '📋',
  },
  {
    title: 'מאמרים',
    description: 'מאמרים מקצועיים, מדריכים וטיפים מהשטח',
    href: '/articles',
    icon: '📝',
  },
];

export default async function HomePage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op for read-only server component
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authenticated users go straight to forums
  if (user) {
    redirect('/forums');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <span className="font-rubik text-xl font-bold text-primary">
            קהילת אנשי מקצוע
          </span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">כניסה</Link>
            </Button>
            <Button asChild>
              <Link href="/register">הרשמה</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-primary/5 to-background py-20">
        <div className="container text-center">
          <h1 className="font-rubik text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            הקהילה המקצועית
            <br />
            <span className="text-primary">של הציבור החרדי</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            המקום להתחבר עם אנשי מקצוע, למצוא פרויקטים, ללמוד ולהתפתח.
            הצטרפו לקהילה הגדולה והמובילה בישראל.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/register">הרשמה חינם</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/forums">עיון בפורומים</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container">
          <h2 className="text-center font-rubik text-3xl font-bold">
            הכל במקום אחד
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
            פלטפורמה מקצועית מלאה שנבנתה במיוחד עבור הקהילה שלנו
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Link key={feature.href} href={feature.href}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="text-3xl">{feature.icon}</div>
                    <h3 className="mt-4 font-rubik text-lg font-semibold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { label: 'אנשי מקצוע', value: '120,000+' },
              { label: 'פורומים פעילים', value: '50+' },
              { label: 'פרויקטים', value: '10,000+' },
              { label: 'קורסים', value: '200+' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-rubik text-3xl font-bold text-primary">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container text-center">
          <h2 className="font-rubik text-3xl font-bold">
            מוכנים להצטרף?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            הצטרפו עכשיו לקהילה המקצועית המובילה. חינם להרשמה.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link href="/register">הרשמה חינם</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="container">
          <p>© {new Date().getFullYear()} קהילת אנשי מקצוע חרדים. כל הזכויות שמורות.</p>
        </div>
      </footer>
    </div>
  );
}
