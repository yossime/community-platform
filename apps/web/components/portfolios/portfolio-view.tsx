'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Eye, Plus, Pencil, LayoutGrid, ArrowRight } from 'lucide-react';

import { Card, CardContent } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@platform/ui/src/components/dialog';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import { PortfolioProjectForm } from './portfolio-project-form';

interface PortfolioViewProps {
  userSlug: string;
}

export function PortfolioView({ userSlug }: PortfolioViewProps) {
  const { user } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: portfolio, isLoading, error } = trpc.portfolio.getByUserSlug.useQuery({
    userSlug,
  });

  const isOwner = user?.id === portfolio?.user?.id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/portfolios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-4 w-4" />
          חזרה לתיקי עבודות
        </Link>
        <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
          {error.message === 'המשתמש לא נמצא' || error.message === 'תיק העבודות לא נמצא'
            ? error.message
            : 'שגיאה בטעינת תיק העבודות. נסה לרענן את הדף.'}
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Back Link */}
      <Link
        href="/portfolios"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        חזרה לתיקי עבודות
      </Link>

      {/* User Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">
              {portfolio.user.displayName?.slice(0, 2) ?? '??'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-rubik text-2xl font-bold">{portfolio.title}</h1>
            <Link
              href={`/directory/${portfolio.user.slug}`}
              className="text-muted-foreground hover:text-foreground"
            >
              {portfolio.user.displayName}
            </Link>
            {portfolio.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {portfolio.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                <span>{portfolio.viewCount} צפיות</span>
              </div>
              <div className="flex items-center gap-1">
                <LayoutGrid className="h-4 w-4" />
                <span>{portfolio.projects.length} פרויקטים</span>
              </div>
            </div>
          </div>
        </div>

        {/* Owner Actions */}
        {isOwner && (
          <div className="flex items-center gap-2">
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="me-2 h-4 w-4" />
                  הוסף פרויקט
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="font-rubik">פרויקט חדש</DialogTitle>
                </DialogHeader>
                <PortfolioProjectForm
                  onSuccess={() => setShowCreateDialog(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Projects Grid */}
      {portfolio.projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutGrid className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-rubik text-lg font-semibold">אין פרויקטים עדיין</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {isOwner
                ? 'הוסף את הפרויקט הראשון שלך כדי להציג את העבודה שלך'
                : 'למשתמש זה עדיין אין פרויקטים בתיק העבודות'}
            </p>
            {isOwner && (
              <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                <Plus className="me-2 h-4 w-4" />
                הוסף פרויקט
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {portfolio.projects.map((project) => (
            <Link
              key={project.id}
              href={`/portfolios/${userSlug}/${project.slug}`}
              className="group block"
            >
              <Card className="overflow-hidden transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-lg">
                {/* Cover Image */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {project.coverImageUrl ? (
                    <Image
                      src={project.coverImageUrl}
                      alt={project.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <LayoutGrid className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                  )}

                  {/* Owner Edit Icon */}
                  {isOwner && (
                    <div className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="rounded-full bg-background/80 p-1.5 backdrop-blur">
                        <Pencil className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Info */}
                <CardContent className="p-4">
                  <h3 className="font-rubik font-semibold line-clamp-1">{project.title}</h3>
                  {project.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        <span>{project.likeCount ?? project._count.likes}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        <span>{project.viewCount}</span>
                      </div>
                    </div>
                    {project.category && (
                      <Badge variant="secondary" className="text-xs">
                        {project.category}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
