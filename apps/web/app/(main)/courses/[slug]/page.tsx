import type { Metadata } from 'next';

import { CourseDetail } from '@/components/course-detail';

export const metadata: Metadata = {
  title: 'קורס',
};

export default function CourseDetailPage({ params }: { params: { slug: string } }) {
  return <CourseDetail slug={params.slug} />;
}
