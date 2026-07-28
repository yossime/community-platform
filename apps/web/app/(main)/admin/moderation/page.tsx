'use client';

import { useState } from 'react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Textarea } from '@platform/ui/src/components/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/ui/src/components/select';
import { toast } from '@platform/ui/src/hooks/use-toast';

import { trpc } from '@/lib/trpc';

const ENTITY_TYPES = [
  { value: 'Thread', label: 'נושאים' },
  { value: 'Post', label: 'תגובות' },
  { value: 'Project', label: 'פרויקטים' },
  { value: 'ClassifiedListing', label: 'מודעות' },
  { value: 'Article', label: 'מאמרים' },
  { value: 'Course', label: 'קורסים' },
] as const;

type EntityType = typeof ENTITY_TYPES[number]['value'];

export default function ModerationPage() {
  const [entityType, setEntityType] = useState<EntityType>('Thread');

  const { data, isLoading, refetch } = trpc.admin.getModerationQueue.useQuery({
    entityType,
    limit: 20,
  });

  const moderateContent = trpc.admin.moderateContent.useMutation({
    onSuccess: () => {
      refetch();
      toast({ title: 'התוכן עודכן', variant: 'success' });
    },
    onError: () => {
      toast({ title: 'שגיאה', description: 'לא ניתן לעדכן את התוכן', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-rubik text-xl font-semibold">תור ניהול תוכן</h2>
        <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : !data?.items || data.items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">אין תכנים ממתינים לאישור</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((item: Record<string, unknown>) => (
            <ModerationItem
              key={item.id as string}
              item={item}
              entityType={entityType}
              onModerate={(action, reason) => {
                moderateContent.mutate({
                  entityType,
                  entityId: item.id as string,
                  action,
                  reason,
                });
              }}
              isPending={moderateContent.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModerationItem({
  item,
  entityType,
  onModerate,
  isPending,
}: {
  item: Record<string, unknown>;
  entityType: string;
  onModerate: (action: 'APPROVE' | 'REJECT' | 'FLAG', reason?: string) => void;
  isPending: boolean;
}) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');

  const author = item.author as Record<string, string> | undefined;
  const title = String(item.title ?? item.content ?? '');
  const content = String(item.content ?? '');

  return (
    <Card>
      <CardContent className="py-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Avatar className="mt-0.5 h-8 w-8">
                <AvatarFallback className="text-xs">
                  {author?.displayName?.slice(0, 2) ?? '??'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{author?.displayName ?? 'לא ידוע'}</span>
                  <Badge variant="outline" className="text-xs">{entityType}</Badge>
                </div>
                {title && (
                  <h4 className="mt-1 font-medium">{title}</h4>
                )}
                <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.createdAt as string).toLocaleDateString('he-IL', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>

          {showReason && (
            <Textarea
              placeholder="סיבת דחייה/סימון..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onModerate('APPROVE')}
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              אשר
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!showReason) {
                  setShowReason(true);
                } else {
                  onModerate('FLAG', reason || undefined);
                  setShowReason(false);
                  setReason('');
                }
              }}
              disabled={isPending}
            >
              סמן לבדיקה
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (!showReason) {
                  setShowReason(true);
                } else {
                  onModerate('REJECT', reason || undefined);
                  setShowReason(false);
                  setReason('');
                }
              }}
              disabled={isPending}
            >
              דחה
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
