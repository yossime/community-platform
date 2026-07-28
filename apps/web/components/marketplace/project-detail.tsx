'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Star,
  Clock,
  Users,
  AlertTriangle,
  Briefcase,
  Calendar,
  Eye,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Send,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Button } from '@platform/ui/src/components/button';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Input } from '@platform/ui/src/components/input';
import { Label } from '@platform/ui/src/components/label';
import { Textarea } from '@platform/ui/src/components/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@platform/ui/src/components/dialog';
import { Separator } from '@platform/ui/src/components/separator';
import { toast } from '@platform/ui/src/hooks/use-toast';

import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';

function formatCurrency(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL')}`;
}

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const PROJECT_STATUS_DEFAULT: { label: string; variant: StatusVariant } = { label: 'פתוח להצעות', variant: 'default' };

const PROJECT_STATUS_LABELS: Record<string, { label: string; variant: StatusVariant }> = {
  OPEN: PROJECT_STATUS_DEFAULT,
  IN_PROGRESS: { label: 'בביצוע', variant: 'secondary' },
  COMPLETED: { label: 'הושלם', variant: 'outline' },
  CANCELED: { label: 'בוטל', variant: 'destructive' },
  DRAFT: { label: 'טיוטה', variant: 'outline' },
};

const PROPOSAL_STATUS_DEFAULT: { label: string; variant: StatusVariant } = { label: 'ממתין', variant: 'secondary' };

const PROPOSAL_STATUS_LABELS: Record<string, { label: string; variant: StatusVariant }> = {
  PENDING: PROPOSAL_STATUS_DEFAULT,
  SHORTLISTED: { label: 'ברשימה מקוצרת', variant: 'default' },
  ACCEPTED: { label: 'התקבל', variant: 'default' },
  REJECTED: { label: 'נדחה', variant: 'destructive' },
  WITHDRAWN: { label: 'נמשך בחזרה', variant: 'outline' },
};

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין',
  IN_PROGRESS: 'בביצוע',
  COMPLETED: 'הושלם',
  APPROVED: 'אושר',
};

interface ProjectDetailProps {
  slug: string;
}

export function ProjectDetail({ slug }: ProjectDetailProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: project, isLoading, error } = trpc.marketplace.getProject.useQuery({ slug });

  // Check if user is the project owner
  const isOwner = user?.id === project?.clientId;

  // Check if user is logged in and not the owner (for proposal submission)
  const canSubmitProposal = user && !isOwner && project?.status === 'OPEN';

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
        <div className="rounded-md bg-destructive/10 p-4 text-center text-sm text-destructive">
          {error?.message ?? 'הפרויקט לא נמצא'}
        </div>
        <div className="text-center">
          <Button variant="outline" asChild>
            <Link href="/marketplace">
              <ChevronLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              חזור לשוק
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const statusConfig = PROJECT_STATUS_LABELS[project.status] ?? PROJECT_STATUS_DEFAULT;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/marketplace" className="hover:text-foreground">
          שוק פרילנסרים
        </Link>
        <span>/</span>
        <span className="line-clamp-1">{project.title}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Project Header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusConfig.variant}>
                      {statusConfig.label}
                    </Badge>
                    {project.isUrgent && (
                      <Badge variant="destructive">
                        <AlertTriangle className="me-1 h-3 w-3" />
                        דחוף
                      </Badge>
                    )}
                    {project.isFeatured && (
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      >
                        מומלץ
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-3 font-rubik text-2xl font-bold">
                    {project.title}
                  </h1>
                </div>
              </div>

              {/* Meta Info */}
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    פורסם{' '}
                    {new Date(project.createdAt).toLocaleDateString('he-IL')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  <span>{project.viewCount} צפיות</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{project._count.proposals} הצעות</span>
                </div>
                {project.deadline && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>
                      דד-ליין:{' '}
                      {new Date(project.deadline).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              {/* Description */}
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                {project.description}
              </div>

              {/* Skills */}
              <div className="mt-6">
                <h3 className="mb-2 font-rubik text-sm font-semibold">
                  מיומנויות נדרשות
                </h3>
                <div className="flex flex-wrap gap-2">
                  {project.skills.map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Budget */}
              <div className="mt-6 rounded-md bg-primary/5 p-4">
                <h3 className="font-rubik text-sm font-semibold">
                  תקציב
                </h3>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {formatCurrency(project.budgetMinAgorot)} -{' '}
                  {formatCurrency(project.budgetMaxAgorot)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Milestones */}
          {project.milestones && project.milestones.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-rubik text-lg">
                  אבני דרך
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {project.milestones.map((milestone, index) => (
                    <div
                      key={milestone.id}
                      className="flex items-start gap-3 rounded-md border p-3"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{milestone.title}</h4>
                          <Badge variant="outline" className="text-xs">
                            {MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {milestone.description}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-sm">
                          <span className="font-medium text-primary">
                            {formatCurrency(milestone.amountAgorot)}
                          </span>
                          {milestone.dueDate && (
                            <span className="text-muted-foreground">
                              עד{' '}
                              {new Date(milestone.dueDate).toLocaleDateString('he-IL')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Owner: Proposals Section */}
          {isOwner && (
            <ProposalsList projectId={project.id} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Info */}
          <Card>
            <CardHeader>
              <CardTitle className="font-rubik text-base">
                מפרסם הפרויקט
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {project.client.displayName?.slice(0, 2) ?? '??'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {project.client.displayName}
                  </p>
                  {project.client.bio && (
                    <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                      {project.client.bio}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Proposal */}
          {canSubmitProposal && (
            <SubmitProposalDialog projectId={project.id} slug={slug} />
          )}

          {/* Not logged in */}
          {!user && project.status === 'OPEN' && (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  יש להתחבר כדי להגיש הצעה
                </p>
                <Button className="mt-3 w-full" asChild>
                  <Link href="/login">התחבר</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Submit Proposal Dialog ──────────────────────────────

function SubmitProposalDialog({
  projectId,
  slug,
}: {
  projectId: string;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [priceILS, setPriceILS] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();

  const submitProposal = trpc.marketplace.submitProposal.useMutation({
    onSuccess: () => {
      setOpen(false);
      setCoverLetter('');
      setPriceILS('');
      setEstimatedDays('');
      setErrors({});
      utils.marketplace.getProject.invalidate({ slug });
      toast({
        title: 'ההצעה נשלחה',
        description: 'ההצעה שלך ממתינה לבדיקת מפרסם הפרויקט',
        variant: 'success',
      });
    },
    onError: (err) => {
      toast({
        title: 'שגיאה',
        description: err.message ?? 'לא ניתן לשלוח את ההצעה. נסה שוב',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (coverLetter.trim().length < 50) {
      newErrors.coverLetter = 'מכתב ההצעה חייב להכיל לפחות 50 תווים';
    }
    const price = parseFloat(priceILS);
    if (isNaN(price) || price <= 0) {
      newErrors.price = 'יש להזין מחיר תקין';
    }
    const days = parseInt(estimatedDays, 10);
    if (isNaN(days) || days <= 0) {
      newErrors.estimatedDays = 'יש להזין מספר ימים תקין';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    submitProposal.mutate({
      projectId,
      coverLetter: coverLetter.trim(),
      priceAgorot: Math.round(price * 100),
      estimatedDays: days,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="cursor-pointer transition-colors hover:bg-accent/30">
          <CardContent className="p-4 text-center">
            <Send className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 font-rubik font-semibold">הגש הצעה</p>
            <p className="mt-1 text-sm text-muted-foreground">
              שלח הצעה למפרסם הפרויקט
            </p>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-rubik">הגשת הצעה</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coverLetter">מכתב הצעה</Label>
            <Textarea
              id="coverLetter"
              placeholder="תאר את הניסיון שלך, למה אתה מתאים לפרויקט, ואיך אתה מתכנן לבצע את העבודה..."
              value={coverLetter}
              onChange={(e) => {
                setCoverLetter(e.target.value);
                setErrors((prev) => ({ ...prev, coverLetter: '' }));
              }}
              rows={6}
              maxLength={3000}
              disabled={submitProposal.isPending}
            />
            <div className="flex items-center justify-between">
              {errors.coverLetter && (
                <p className="text-sm text-destructive">{errors.coverLetter}</p>
              )}
              <p className="text-xs text-muted-foreground ms-auto">
                {coverLetter.length}/3000
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">מחיר (₪)</Label>
              <Input
                id="price"
                type="number"
                placeholder="0"
                value={priceILS}
                onChange={(e) => {
                  setPriceILS(e.target.value);
                  setErrors((prev) => ({ ...prev, price: '' }));
                }}
                min={1}
                step={1}
                dir="ltr"
                className="text-start"
                disabled={submitProposal.isPending}
              />
              {errors.price && (
                <p className="text-sm text-destructive">{errors.price}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedDays">ימי ביצוע משוערים</Label>
              <Input
                id="estimatedDays"
                type="number"
                placeholder="0"
                value={estimatedDays}
                onChange={(e) => {
                  setEstimatedDays(e.target.value);
                  setErrors((prev) => ({ ...prev, estimatedDays: '' }));
                }}
                min={1}
                max={365}
                dir="ltr"
                className="text-start"
                disabled={submitProposal.isPending}
              />
              {errors.estimatedDays && (
                <p className="text-sm text-destructive">
                  {errors.estimatedDays}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              ההצעה תשלח למפרסם הפרויקט
            </p>
            <Button type="submit" disabled={submitProposal.isPending}>
              {submitProposal.isPending ? (
                <Spinner size="sm" className="text-primary-foreground" />
              ) : (
                'שלח הצעה'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Proposals List (Owner View) ─────────────────────────

function ProposalsList({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();

  const { data: proposals, isLoading } = trpc.marketplace.listProposals.useQuery(
    { projectId },
  );

  const updateStatus = trpc.marketplace.updateProposalStatus.useMutation({
    onSuccess: () => {
      utils.marketplace.listProposals.invalidate({ projectId });
      utils.marketplace.getProject.invalidate();
      toast({
        title: 'סטטוס ההצעה עודכן',
        variant: 'success',
      });
    },
    onError: (err) => {
      toast({
        title: 'שגיאה',
        description: err.message ?? 'לא ניתן לעדכן את ההצעה',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-rubik text-lg">
          הצעות שהתקבלו ({proposals?.length ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!proposals || proposals.length === 0 ? (
          <div className="py-6 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              עדיין לא התקבלו הצעות
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map((proposal) => {
              const statusConfig =
                PROPOSAL_STATUS_LABELS[proposal.status] ??
                PROPOSAL_STATUS_DEFAULT;

              return (
                <div
                  key={proposal.id}
                  className="rounded-md border p-4"
                >
                  {/* Freelancer Info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-xs">
                          {proposal.freelancer.user.displayName?.slice(0, 2) ??
                            '??'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <Link
                          href={`/marketplace/freelancer/${proposal.freelancer.user.slug}`}
                          className="font-medium hover:text-primary"
                        >
                          {proposal.freelancer.user.displayName}
                        </Link>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {new Date(proposal.createdAt).toLocaleDateString(
                            'he-IL',
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={statusConfig.variant}>
                      {statusConfig.label}
                    </Badge>
                  </div>

                  {/* Proposal Details */}
                  <div className="mt-3 text-sm whitespace-pre-wrap">
                    {proposal.coverLetter}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">מחיר: </span>
                      <span className="font-medium text-primary">
                        {formatCurrency(proposal.priceAgorot)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        זמן משוער:{' '}
                      </span>
                      <span className="font-medium">
                        {proposal.estimatedDays} ימים
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {proposal.status === 'PENDING' && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          updateStatus.mutate({
                            proposalId: proposal.id,
                            status: 'ACCEPTED',
                          })
                        }
                        disabled={updateStatus.isPending}
                      >
                        <CheckCircle2 className="me-1 h-3.5 w-3.5" />
                        קבל הצעה
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateStatus.mutate({
                            proposalId: proposal.id,
                            status: 'SHORTLISTED',
                          })
                        }
                        disabled={updateStatus.isPending}
                      >
                        <Star className="me-1 h-3.5 w-3.5" />
                        רשימה מקוצרת
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          updateStatus.mutate({
                            proposalId: proposal.id,
                            status: 'REJECTED',
                          })
                        }
                        disabled={updateStatus.isPending}
                      >
                        <XCircle className="me-1 h-3.5 w-3.5" />
                        דחה
                      </Button>
                    </div>
                  )}

                  {proposal.status === 'SHORTLISTED' && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          updateStatus.mutate({
                            proposalId: proposal.id,
                            status: 'ACCEPTED',
                          })
                        }
                        disabled={updateStatus.isPending}
                      >
                        <CheckCircle2 className="me-1 h-3.5 w-3.5" />
                        קבל הצעה
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          updateStatus.mutate({
                            proposalId: proposal.id,
                            status: 'REJECTED',
                          })
                        }
                        disabled={updateStatus.isPending}
                      >
                        <XCircle className="me-1 h-3.5 w-3.5" />
                        דחה
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
