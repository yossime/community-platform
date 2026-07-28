'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  MessageSquare,
  Briefcase,
  Newspaper,
  BookOpen,
  GraduationCap,
  Users,
  LayoutGrid,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Badge } from '@platform/ui/src/components/badge';
import { Button } from '@platform/ui/src/components/button';
import { Separator } from '@platform/ui/src/components/separator';
import { Tabs, TabsList, TabsTrigger } from '@platform/ui/src/components/tabs';

import { trpc } from '@/lib/trpc';

const SEARCH_TYPES = [
  { value: undefined, label: 'הכל', icon: Search },
  { value: 'threads' as const, label: 'דיונים', icon: MessageSquare },
  { value: 'projects' as const, label: 'פרויקטים', icon: Briefcase },
  { value: 'classifieds' as const, label: 'מודעות', icon: Newspaper },
  { value: 'articles' as const, label: 'מאמרים', icon: BookOpen },
  { value: 'courses' as const, label: 'קורסים', icon: GraduationCap },
  { value: 'users' as const, label: 'משתמשים', icon: Users },
  { value: 'portfolios' as const, label: 'תיקי עבודות', icon: LayoutGrid },
];

const TYPE_LABELS: Record<string, { label: string; icon: typeof Search; href: string }> = {
  threads: { label: 'דיון', icon: MessageSquare, href: '/forums' },
  projects: { label: 'פרויקט', icon: Briefcase, href: '/marketplace' },
  classifieds: { label: 'מודעה', icon: Newspaper, href: '/classifieds' },
  articles: { label: 'מאמר', icon: BookOpen, href: '/articles' },
  courses: { label: 'קורס', icon: GraduationCap, href: '/courses' },
  users: { label: 'משתמש', icon: Users, href: '/directory' },
  portfolios: { label: 'תיק עבודות', icon: LayoutGrid, href: '/portfolios' },
};

type SearchType = 'threads' | 'projects' | 'classifieds' | 'articles' | 'courses' | 'users' | 'portfolios';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [selectedType, setSelectedType] = useState<SearchType | undefined>(undefined);
  const [searchMode, setSearchMode] = useState<'keyword' | 'semantic'>('keyword');

  const { data, isLoading } = trpc.search.global.useQuery(
    { query, type: selectedType },
    { enabled: query.length >= 2 && searchMode === 'keyword' },
  );

  const { data: semanticData, isLoading: semanticLoading } = trpc.search.semantic.useQuery(
    { query, limit: 15 },
    { enabled: query.length >= 5 && searchMode === 'semantic' },
  );

  const { data: trending } = trpc.search.trending.useQuery(
    { limit: 5 },
    { enabled: !query },
  );

  const activeLoading = searchMode === 'keyword' ? isLoading : semanticLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-rubik text-3xl font-bold">חיפוש</h1>
        {query && (
          <p className="mt-2 text-muted-foreground">
            תוצאות עבור: &ldquo;{query}&rdquo;
          </p>
        )}
      </div>

      {/* Search Mode Tabs */}
      {query.length >= 2 && (
        <div className="flex items-center gap-4">
          <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as typeof searchMode)}>
            <TabsList>
              <TabsTrigger value="keyword">
                <Search className="me-1.5 h-3.5 w-3.5" />
                חיפוש רגיל
              </TabsTrigger>
              <TabsTrigger value="semantic">
                <Sparkles className="me-1.5 h-3.5 w-3.5" />
                חיפוש חכם (AI)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Filter tabs (keyword mode only) */}
      {query.length >= 2 && searchMode === 'keyword' && (
        <div className="flex flex-wrap gap-2">
          {SEARCH_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = selectedType === type.value;
            const facetCount = data?.facets?.[type.value ?? ''] ?? undefined;
            return (
              <Button
                key={type.value ?? 'all'}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedType(type.value)}
              >
                <Icon className="me-1.5 h-3.5 w-3.5" />
                {type.label}
                {facetCount !== undefined && (
                  <span className="ms-1 text-xs opacity-60">({facetCount})</span>
                )}
              </Button>
            );
          })}
        </div>
      )}

      {activeLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : !query ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-rubik text-lg font-semibold">חפש בפלטפורמה</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                חפש דיונים, מאמרים, קורסים, פרויקטים ועוד
              </p>
            </CardContent>
          </Card>

          {/* Trending Content */}
          {trending && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 font-rubik text-xl font-bold">
                <TrendingUp className="h-5 w-5" />
                פופולרי עכשיו
              </h2>

              <div className="grid gap-4 sm:grid-cols-3">
                {/* Trending Threads */}
                {trending.threads.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <MessageSquare className="h-4 w-4" />
                        דיונים חמים
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {trending.threads.map((t) => (
                        <Link key={t.id} href={`/forums/thread/${t.slug}`} className="block text-sm hover:text-primary">
                          <span className="line-clamp-1">{t.title}</span>
                          <span className="text-xs text-muted-foreground">{t.viewCount} צפיות</span>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Trending Articles */}
                {trending.articles.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <BookOpen className="h-4 w-4" />
                        מאמרים פופולריים
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {trending.articles.map((a) => (
                        <Link key={a.id} href={`/articles/${a.slug}`} className="block text-sm hover:text-primary">
                          <span className="line-clamp-1">{a.title}</span>
                          <span className="text-xs text-muted-foreground">{a.viewCount} צפיות</span>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Trending Projects */}
                {trending.projects.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <Briefcase className="h-4 w-4" />
                        פרויקטים חמים
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {trending.projects.map((p) => (
                        <Link key={p.id} href={`/marketplace/${p.slug}`} className="block text-sm hover:text-primary">
                          <span className="line-clamp-1">{p.title}</span>
                          <span className="text-xs text-muted-foreground">{p.proposalCount} הצעות</span>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      ) : query.length < 2 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">הקלד לפחות 2 תווים</h3>
          </CardContent>
        </Card>
      ) : searchMode === 'semantic' ? (
        /* Semantic Search Results */
        semanticData && semanticData.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Sparkles className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-rubik text-lg font-semibold">לא נמצאו תוצאות</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                נסה לנסח את השאילתה אחרת
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              {semanticData?.length ?? 0} תוצאות חכמות
            </p>

            {semanticData?.map((result, idx) => {
              const typeInfo = TYPE_LABELS[result.entityType];
              const Icon = typeInfo?.icon ?? Search;

              let href = '#';
              if (result.entityType === 'thread') href = `/forums/thread/${result.entityId}`;
              else if (result.entityType === 'article') href = `/articles/${result.entityId}`;
              else if (result.entityType === 'course') href = `/courses/${result.entityId}`;
              else if (result.entityType === 'project') href = `/marketplace/${result.entityId}`;
              else if (result.entityType === 'freelancer') href = `/marketplace/freelancer/${result.entityId}`;

              return (
                <Card key={idx} className="transition-colors hover:bg-accent/50">
                  <Link href={href}>
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {typeInfo?.label ?? result.entityType}
                          </Badge>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {Math.round(result.similarity * 100)}% התאמה
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {result.content}
                        </p>
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              );
            })}
          </div>
        )
      ) : data && data.results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">לא נמצאו תוצאות</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              נסה לחפש עם מילים אחרות או לשנות את הפילטר
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            נמצאו {data?.total ?? 0} תוצאות
          </p>

          {data?.results.map((result: Record<string, unknown>) => {
            const type = (result._type as string) ?? 'threads';
            const typeInfo = TYPE_LABELS[type];
            const Icon = typeInfo?.icon ?? Search;
            const title = (result.title as string) ?? (result.displayName as string) ?? '';
            const description =
              (result.content as string) ??
              (result.description as string) ??
              (result.excerpt as string) ??
              (result.bio as string) ??
              '';
            const id = result.id as string;

            let href = '#';
            if (type === 'threads') href = `/forums/${result.forumSlug ?? 'forum'}/${result.slug ?? id}`;
            else if (type === 'users') href = `/directory/${result.slug ?? id}`;
            else if (type === 'articles') href = `/articles/${result.slug ?? id}`;
            else if (type === 'courses') href = `/courses/${result.slug ?? id}`;
            else if (type === 'projects') href = `/marketplace/${result.slug ?? id}`;
            else if (type === 'classifieds') href = `/classifieds/${result.slug ?? id}`;
            else if (type === 'portfolios') href = `/portfolios/${result.slug ?? id}`;

            return (
              <Card key={`${type}-${id}`} className="transition-colors hover:bg-accent/50">
                <Link href={href}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-medium">{title}</h3>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {typeInfo?.label ?? type}
                        </Badge>
                      </div>
                      {description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {description.slice(0, 200)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
