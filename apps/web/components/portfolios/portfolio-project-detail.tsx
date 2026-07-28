'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Heart,
  Eye,
  MessageCircle,
  ArrowRight,
  LayoutGrid,
  Calendar,
  Pencil,
  Trash2,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Separator } from '@platform/ui/src/components/separator';
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
import { toast } from '@platform/ui/src/hooks/use-toast';
import { PortfolioComments } from './portfolio-comments';
import { PortfolioProjectForm } from './portfolio-project-form';

interface PortfolioProjectDetailProps {
  userSlug: string;
  projectSlug: string;
}

export function PortfolioProjectDetail({ userSlug, projectSlug }: PortfolioProjectDetailProps) {
  const { user } = useAuth();
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const utils = trpc.useUtils();

  const { data: project, isLoading, error } = trpc.portfolio.getProject.useQuery({
    slug: projectSlug,
  });

  const { data: likeStatus } = trpc.portfolio.isLiked.useQuery(
    { projectId: project?.id ?? '' },
    { enabled: !!project?.id && !!user },
  );

  const toggleLike = trpc.portfolio.toggleLike.useMutation({
    onSuccess: (result) => {
      utils.portfolio.getProject.invalidate({ slug: projectSlug });
      utils.portfolio.isLiked.invalidate({ projectId: project?.id ?? '' });
      toast({
        title: result.liked ? 'נוסף לאהובים' : 'הוסר מהאהובים',
        variant: 'success',
      });
    },
    onError: () => {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לעדכן. נסה שוב.',
        variant: 'destructive',
      });
    },
  });

  const deleteProject = trpc.portfolio.deleteProject.useMutation({
    onSuccess: () => {
      toast({ title: 'הפרויקט נמחק', variant: 'success' });
      window.location.href = `/portfolios/${userSlug}`;
    },
    onError: () => {
      toast({ title: 'שגיאה', description: 'לא ניתן למחוק את הפרויקט', variant: 'destructive' });
    },
  });

  const isOwner = user?.id === project?.portfolio?.user?.id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link
          href={`/portfolios/${userSlug}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לתיק העבודות
        </Link>
        <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
          הפרויקט לא נמצא
        </div>
      </div>
    );
  }

  const allMedia = [
    ...(project.coverImageUrl
      ? [{ id: 'cover', url: project.coverImageUrl, type: 'IMAGE', caption: null }]
      : []),
    ...project.media,
  ];

  const selectedMedia = allMedia[selectedMediaIndex] ?? allMedia[0];

  const handleDelete = () => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק פרויקט זה? פעולה זו אינה הפיכה.')) {
      deleteProject.mutate({ id: project.id });
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portfolios" className="hover:text-foreground">
          תיקי עבודות
        </Link>
        <span>/</span>
        <Link href={`/portfolios/${userSlug}`} className="hover:text-foreground">
          {project.portfolio.user.displayName}
        </Link>
      </div>

      {/* Main Content - Grid layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left Column - Main Content */}
        <div className="space-y-6">
          {/* Hero Image */}
          <Card className="overflow-hidden">
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              {selectedMedia ? (
                <Image
                  src={selectedMedia.url}
                  alt={selectedMedia.caption ?? project.title}
                  fill
                  className="object-contain"
                  sizes="(max-width: 1024px) 100vw, 70vw"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <LayoutGrid className="h-16 w-16 text-muted-foreground/50" />
                </div>
              )}
            </div>

            {/* Media Caption */}
            {selectedMedia?.caption && (
              <div className="border-t px-4 py-2 text-sm text-muted-foreground">
                {selectedMedia.caption}
              </div>
            )}
          </Card>

          {/* Media Thumbnails */}
          {allMedia.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {allMedia.map((media, index) => (
                <button
                  key={media.id}
                  onClick={() => setSelectedMediaIndex(index)}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                    selectedMediaIndex === index
                      ? 'border-primary'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                >
                  <Image
                    src={media.url}
                    alt={media.caption ?? `תמונה ${index + 1}`}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Title & Actions */}
          <div className="flex items-start justify-between">
            <h1 className="font-rubik text-2xl font-bold">{project.title}</h1>
            <div className="flex items-center gap-2">
              {/* Like Button */}
              {user && !isOwner && (
                <Button
                  variant={likeStatus?.liked ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleLike.mutate({ projectId: project.id })}
                  disabled={toggleLike.isPending}
                >
                  <Heart
                    className={`me-1 h-4 w-4 ${likeStatus?.liked ? 'fill-current' : ''}`}
                  />
                  {project.likeCount ?? project._count.likes}
                </Button>
              )}

              {/* Owner Actions */}
              {isOwner && (
                <>
                  <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Pencil className="me-1 h-4 w-4" />
                        עריכה
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle className="font-rubik">עריכת פרויקט</DialogTitle>
                      </DialogHeader>
                      <PortfolioProjectForm
                        project={project}
                        onSuccess={() => setShowEditDialog(false)}
                      />
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteProject.isPending}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    {deleteProject.isPending ? (
                      <Spinner size="sm" />
                    ) : (
                      <>
                        <Trash2 className="me-1 h-4 w-4" />
                        מחיקה
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              <span>{project.viewCount} צפיות</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart className="h-4 w-4" />
              <span>{project.likeCount ?? project._count.likes} לייקים</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              <span>{project._count.comments} תגובות</span>
            </div>
            {project.completedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{new Date(project.completedAt).toLocaleDateString('he-IL')}</span>
              </div>
            )}
          </div>

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="font-rubik text-lg">תיאור הפרויקט</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {project.description}
              </div>
            </CardContent>
          </Card>

          {/* Process Notes */}
          {project.processNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="font-rubik text-lg">תהליך העבודה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {project.processNotes}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tags & Tools */}
          {(project.tags.length > 0 || project.tools.length > 0) && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                {project.tags.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">תגיות</h4>
                    <div className="flex flex-wrap gap-2">
                      {project.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {project.tools.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">כלים</h4>
                    <div className="flex flex-wrap gap-2">
                      {project.tools.map((tool) => (
                        <Badge key={tool} variant="outline">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Comments Section */}
          <PortfolioComments projectId={project.id} comments={project.comments} />
        </div>

        {/* Right Column - Author Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="text-xl">
                    {project.portfolio.user.displayName?.slice(0, 2) ?? '??'}
                  </AvatarFallback>
                </Avatar>
                <h3 className="mt-3 font-rubik font-semibold">
                  {project.portfolio.user.displayName}
                </h3>
                <Link
                  href={`/portfolios/${userSlug}`}
                  className="mt-3 w-full"
                >
                  <Button variant="outline" className="w-full">
                    צפה בתיק העבודות
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Category */}
          {project.category && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">קטגוריה</h4>
                <Badge variant="secondary">{project.category}</Badge>
              </CardContent>
            </Card>
          )}

          {/* Date Info */}
          <Card>
            <CardContent className="space-y-2 pt-6 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">פורסם</span>
                <span>{new Date(project.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              {project.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">הושלם</span>
                  <span>{new Date(project.completedAt).toLocaleDateString('he-IL')}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">עודכן</span>
                <span>{new Date(project.updatedAt).toLocaleDateString('he-IL')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
