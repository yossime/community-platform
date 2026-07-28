'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';

import { trpc } from '@/lib/trpc';

export function ForumCategoryList() {
  const { data: categories, isLoading, error } = trpc.forum.listCategories.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
        שגיאה בטעינת הפורומים. נסה לרענן את הדף.
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-rubik text-lg font-semibold">עדיין אין פורומים</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            הפורומים יתווספו בקרוב. הישאר מעודכן!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <Card key={category.id}>
          <CardHeader>
            <CardTitle className="font-rubik text-lg">{category.name}</CardTitle>
            {category.description && (
              <p className="text-sm text-muted-foreground">{category.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {category.forums.map((forum) => (
                <Link
                  key={forum.id}
                  href={`/forums/${forum.slug}`}
                  className="flex items-center justify-between py-3 transition-colors hover:bg-accent/50 -mx-3 px-3 rounded-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">{forum.name}</h4>
                      {forum.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {forum.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="text-center">
                      <div className="font-medium text-foreground">{forum.threadCount}</div>
                      <div className="text-xs">נושאים</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-foreground">{forum.postCount}</div>
                      <div className="text-xs">תגובות</div>
                    </div>
                  </div>
                </Link>
              ))}
              {category.forums.length === 0 && (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  אין פורומים בקטגוריה זו
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
