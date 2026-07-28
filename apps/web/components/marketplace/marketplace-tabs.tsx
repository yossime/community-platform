'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@platform/ui/src/components/tabs';

import { useAuth } from '@/hooks/useAuth';
import { ProjectList } from '@/components/marketplace/project-list';
import { FreelancerList } from '@/components/marketplace/freelancer-list';

export function MarketplaceTabs() {
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      {/* Action Button */}
      {user && (
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/marketplace/new">
              <Plus className="me-2 h-4 w-4" />
              פרסם פרויקט
            </Link>
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="projects" dir="rtl">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="projects" className="flex-1 sm:flex-initial">
            פרויקטים
          </TabsTrigger>
          <TabsTrigger value="freelancers" className="flex-1 sm:flex-initial">
            פרילנסרים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-6">
          <ProjectList />
        </TabsContent>

        <TabsContent value="freelancers" className="mt-6">
          <FreelancerList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
