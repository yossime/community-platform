import { createCallerFactory, createTRPCRouter } from './trpc';
import { adminRouter } from './routers/admin';
import { articleRouter } from './routers/article';
import { classifiedRouter } from './routers/classified';
import { courseRouter } from './routers/course';
import { forumRouter } from './routers/forum';
import { marketplaceRouter } from './routers/marketplace';
import { messageRouter } from './routers/message';
import { notificationRouter } from './routers/notification';
import { portfolioRouter } from './routers/portfolio';
import { postRouter } from './routers/post';
import { searchRouter } from './routers/search';
import { threadRouter } from './routers/thread';
import { userRouter } from './routers/user';

export const appRouter = createTRPCRouter({
  user: userRouter,
  forum: forumRouter,
  thread: threadRouter,
  post: postRouter,
  marketplace: marketplaceRouter,
  classified: classifiedRouter,
  portfolio: portfolioRouter,
  course: courseRouter,
  article: articleRouter,
  message: messageRouter,
  notification: notificationRouter,
  search: searchRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
