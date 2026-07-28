'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, PlayCircle, FileText, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@platform/ui/src/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@platform/ui/src/components/card';
import { Badge } from '@platform/ui/src/components/badge';
import { Spinner } from '@platform/ui/src/components/spinner';
import { Separator } from '@platform/ui/src/components/separator';
import { RadioGroup, RadioGroupItem } from '@platform/ui/src/components/radio-group';
import { Label } from '@platform/ui/src/components/label';

import { trpc } from '@/lib/trpc';

export function LessonView({
  lessonId,
  courseId,
  courseSlug,
}: {
  lessonId: string;
  courseId: string;
  courseSlug: string;
}) {
  const utils = trpc.useUtils();
  const [startTime] = useState(Date.now());

  const { data, isLoading } = trpc.course.getLesson.useQuery({ lessonId, courseId });

  const completeMutation = trpc.course.completeLesson.useMutation({
    onSuccess: () => {
      utils.course.getLesson.invalidate({ lessonId, courseId });
      utils.course.getEnrollment.invalidate({ courseId });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">השיעור לא נמצא</p>
        </CardContent>
      </Card>
    );
  }

  const { lesson, progress } = data;
  const isCompleted = progress?.completed ?? false;

  const handleComplete = () => {
    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    completeMutation.mutate({ lessonId, courseId, timeSpentSeconds: timeSpent });
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/courses/${courseSlug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        חזרה לקורס
      </Link>

      {/* Lesson Header */}
      <div className="flex items-start justify-between">
        <div>
          <Badge variant="outline" className="mb-2">
            {lesson.type === 'VIDEO' ? 'שיעור וידאו' :
             lesson.type === 'TEXT' ? 'שיעור טקסט' :
             lesson.type === 'QUIZ' ? 'מבחן' : 'מטלה'}
          </Badge>
          <h1 className="font-rubik text-2xl font-bold">{lesson.title}</h1>
        </div>
        {isCompleted && (
          <Badge variant="default" className="shrink-0">
            <CheckCircle2 className="me-1 h-4 w-4" />
            הושלם
          </Badge>
        )}
      </div>

      <Separator />

      {/* Lesson Content */}
      {lesson.type === 'VIDEO' && lesson.videoUrl && (
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          <video
            src={lesson.videoUrl}
            controls
            className="h-full w-full"
            controlsList="nodownload"
          />
        </div>
      )}

      {(lesson.type === 'TEXT' || lesson.type === 'VIDEO') && lesson.content && (
        <Card>
          <CardContent className="prose prose-sm max-w-none p-6 whitespace-pre-wrap">
            {lesson.content}
          </CardContent>
        </Card>
      )}

      {lesson.type === 'QUIZ' && (
        <QuizView lessonId={lessonId} courseId={courseId} quizData={lesson.quizData} progress={progress} />
      )}

      {lesson.type === 'ASSIGNMENT' && lesson.assignmentData && (
        <Card>
          <CardHeader>
            <CardTitle className="font-rubik">מטלה</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none whitespace-pre-wrap">
            {typeof lesson.assignmentData === 'object' && lesson.assignmentData !== null
              ? (lesson.assignmentData as { instructions?: string }).instructions ?? ''
              : ''}
          </CardContent>
        </Card>
      )}

      {/* Complete Button */}
      {!isCompleted && lesson.type !== 'QUIZ' && (
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleComplete}
            disabled={completeMutation.isPending}
          >
            {completeMutation.isPending ? <Spinner className="me-2" /> : null}
            <CheckCircle2 className="me-2 h-5 w-5" />
            סמן כהושלם
          </Button>
        </div>
      )}
    </div>
  );
}

function QuizView({
  lessonId,
  courseId,
  quizData,
  progress,
}: {
  lessonId: string;
  courseId: string;
  quizData: unknown;
  progress: { score?: number | null; completed?: boolean } | null;
}) {
  const utils = trpc.useUtils();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);

  const submitQuiz = trpc.course.submitQuiz.useMutation({
    onSuccess: (data) => {
      setResult({ score: data.score, passed: data.passed });
      setSubmitted(true);
      utils.course.getLesson.invalidate({ lessonId, courseId });
      utils.course.getEnrollment.invalidate({ courseId });
    },
  });

  const quiz = quizData as {
    questions: Array<{
      id: string;
      question: string;
      options: string[];
      correctAnswer: string;
    }>;
  } | null;

  if (!quiz?.questions) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          נתוני המבחן חסרים
        </CardContent>
      </Card>
    );
  }

  if (progress?.completed && progress.score !== null && progress.score !== undefined) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h3 className="font-rubik text-xl font-bold">המבחן הושלם!</h3>
          <p className="text-lg">
            ציון: <span className="font-bold">{Math.round(progress.score)}%</span>
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = () => {
    submitQuiz.mutate({ lessonId, courseId, answers });
  };

  return (
    <div className="space-y-6">
      {quiz.questions.map((q, index) => (
        <Card key={q.id}>
          <CardContent className="p-4 space-y-3">
            <p className="font-medium">
              {index + 1}. {q.question}
            </p>
            <RadioGroup
              value={answers[q.id] ?? ''}
              onValueChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
              disabled={submitted}
            >
              {q.options.map((option, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <RadioGroupItem value={option} id={`${q.id}-${oi}`} />
                  <Label htmlFor={`${q.id}-${oi}`} className="cursor-pointer text-sm">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      ))}

      {result ? (
        <Card>
          <CardContent className="py-6 text-center space-y-2">
            {result.passed ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
                <p className="font-rubik text-lg font-bold">עברת! ציון: {Math.round(result.score)}%</p>
              </>
            ) : (
              <>
                <HelpCircle className="mx-auto h-10 w-10 text-yellow-500" />
                <p className="font-rubik text-lg font-bold">ציון: {Math.round(result.score)}%</p>
                <p className="text-sm text-muted-foreground">נדרש ציון 70% לפחות. נסה שוב!</p>
                <Button variant="outline" onClick={() => { setSubmitted(false); setResult(null); setAnswers({}); }}>
                  נסה שוב
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={Object.keys(answers).length < quiz.questions.length || submitQuiz.isPending}
          >
            {submitQuiz.isPending ? <Spinner className="me-2" /> : null}
            שלח מבחן
          </Button>
        </div>
      )}
    </div>
  );
}
