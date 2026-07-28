'use client';

import Link from 'next/link';
import {
  Star,
  Briefcase,
  Clock,
  MapPin,
  ExternalLink,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Avatar, AvatarFallback } from '@platform/ui/src/components/avatar';
import { Separator } from '@platform/ui/src/components/separator';

function formatCurrency(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL')}`;
}

const AVAILABILITY_DEFAULT = { label: 'זמין לעבודה', color: 'bg-green-500' } as const;

const AVAILABILITY_CONFIG: Record<string, { label: string; color: string }> = {
  AVAILABLE: AVAILABILITY_DEFAULT,
  BUSY: { label: 'עמוס חלקית', color: 'bg-yellow-500' },
  NOT_AVAILABLE: { label: 'לא זמין כרגע', color: 'bg-red-500' },
};

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const iconSize = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  const textSize = size === 'md' ? 'text-base' : 'text-sm';

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${iconSize} ${
            i < Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
      <span className={`ms-1 font-medium ${textSize}`}>
        {rating > 0 ? rating.toFixed(1) : '—'}
      </span>
    </div>
  );
}

interface FreelancerProfileCardProps {
  profile: {
    id: string;
    headline: string | null;
    description: string | null;
    hourlyRateAgorot: number | null;
    skills: string[];
    availability: string;
    completedProjects: number;
    averageRating: number;
    portfolioUrl: string | null;
    user: {
      id: string;
      displayName: string;
      slug: string;
      avatarUrl: string | null;
      bio: string | null;
      location: string | null;
    };
    proposals?: Array<{
      project: { id: string; title: string; slug: string };
    }>;
  };
}

export function FreelancerProfileCard({ profile }: FreelancerProfileCardProps) {
  const avail =
    AVAILABILITY_CONFIG[profile.availability] ?? AVAILABILITY_DEFAULT;

  return (
    <div className="space-y-6">
      {/* Main Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="text-xl">
                {profile.user.displayName?.slice(0, 2) ?? '??'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-start">
              <h1 className="font-rubik text-2xl font-bold">
                {profile.user.displayName}
              </h1>
              {profile.headline && (
                <p className="mt-1 text-lg text-muted-foreground">
                  {profile.headline}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                {/* Availability */}
                <div className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${avail.color}`} />
                  <span className="text-sm">{avail.label}</span>
                </div>
                {/* Location */}
                {profile.user.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{profile.user.location}</span>
                  </div>
                )}
              </div>

              {/* Rating */}
              <div className="mt-3">
                <StarRating rating={profile.averageRating} size="md" />
              </div>
            </div>
          </div>

          <Separator className="my-5" />

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {profile.completedProjects}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                פרויקטים שהושלמו
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {profile.averageRating > 0
                  ? profile.averageRating.toFixed(1)
                  : '—'}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                דירוג ממוצע
              </div>
            </div>
            {profile.hourlyRateAgorot && (
              <div className="col-span-2 text-center sm:col-span-1">
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(profile.hourlyRateAgorot)}
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  לשעה
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {profile.description && (
        <Card>
          <CardHeader>
            <CardTitle className="font-rubik text-base">אודות</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {profile.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="font-rubik text-base">מיומנויות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Projects */}
      {profile.proposals && profile.proposals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-rubik text-base">
              פרויקטים אחרונים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profile.proposals.map((proposal) => (
                <Link
                  key={proposal.project.id}
                  href={`/marketplace/${proposal.project.slug}`}
                  className="flex items-center gap-2 rounded-md p-2 transition-colors hover:bg-accent"
                >
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{proposal.project.title}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Link */}
      {profile.portfolioUrl && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <a
              href={profile.portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              צפה בתיק העבודות
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
