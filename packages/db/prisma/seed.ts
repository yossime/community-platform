import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Forum categories & forums
  const forumCategories = await seedForumCategories();

  // 2. Classified categories
  await seedClassifiedCategories();

  // 3. Article categories
  const articleCategories = await seedArticleCategories();

  // 4. Tags
  await seedTags();

  // 5. Demo users
  const users = await seedUsers();

  // 6. Forums under categories
  const forums = await seedForums(forumCategories);

  // 7. Threads & posts
  await seedThreadsAndPosts(forums, users);

  // 8. Notifications for first user
  await seedNotifications(users[0]!.id);

  // 9. Conversations & messages between users
  await seedConversations(users);

  // 10. Freelancer profiles
  await seedFreelancerProfiles(users);

  // 11. Marketplace projects & proposals
  await seedProjects(users);

  // 12. Classifieds
  await seedClassifiedListings(users);

  // 13. Portfolios
  await seedPortfolios(users);

  // 14. Courses
  await seedCourses(users);

  // 15. Articles
  await seedArticles(users, articleCategories);

  console.log('Seeding complete.');
}

// ─── Forum Categories ──────────────────────────────────────

async function seedForumCategories() {
  const categories = [
    { name: 'טכנולוגיה', slug: 'technology', description: 'דיונים על טכנולוגיה ופיתוח תוכנה', displayOrder: 1 },
    { name: 'עסקים', slug: 'business', description: 'עסקים, יזמות והשקעות', displayOrder: 2 },
    { name: 'קריירה', slug: 'career', description: 'קריירה ופיתוח מקצועי', displayOrder: 3 },
    { name: 'כללי', slug: 'general', description: 'דיונים כלליים בנושאים שונים', displayOrder: 4 },
  ];

  const results = [];
  for (const category of categories) {
    const result = await prisma.forumCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
    results.push(result);
  }
  console.log(`  Created ${results.length} forum categories`);
  return results;
}

// ─── Classified Categories ─────────────────────────────────

async function seedClassifiedCategories() {
  const categories = [
    { name: 'שירותים מקצועיים', slug: 'professional-services', description: 'שירותי פיתוח, עיצוב ושיווק', displayOrder: 1 },
    { name: 'משרות', slug: 'jobs', description: 'הצעות עבודה וחיפוש עובדים', displayOrder: 2 },
    { name: 'נדל"ן', slug: 'real-estate', description: 'נדל"ן מסחרי ומשרדים', displayOrder: 3 },
    { name: 'ציוד', slug: 'equipment', description: 'ציוד משרדי וטכנולוגי', displayOrder: 4 },
    { name: 'הדרכות ואירועים', slug: 'training-events', description: 'סדנאות, כנסים והדרכות', displayOrder: 5 },
  ];

  for (const category of categories) {
    await prisma.classifiedCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
  console.log(`  Created ${categories.length} classified categories`);
}

// ─── Article Categories ────────────────────────────────────

async function seedArticleCategories() {
  const categories = [
    { name: 'טכנולוגיה', slug: 'tech-articles', description: 'מאמרים על טכנולוגיה וחדשנות', displayOrder: 1 },
    { name: 'עסקים', slug: 'business-articles', description: 'מאמרים על עסקים ויזמות', displayOrder: 2 },
    { name: 'קריירה', slug: 'career-articles', description: 'מאמרים על קריירה ופיתוח מקצועי', displayOrder: 3 },
    { name: 'דעות', slug: 'opinions', description: 'טורי דעה וניתוחים', displayOrder: 4 },
  ];

  const results = [];
  for (const category of categories) {
    const result = await prisma.articleCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
    results.push(result);
  }
  console.log(`  Created ${results.length} article categories`);
  return results;
}

// ─── Tags ──────────────────────────────────────────────────

async function seedTags() {
  const tags = [
    { name: 'JavaScript', slug: 'javascript', category: 'skill' },
    { name: 'TypeScript', slug: 'typescript', category: 'skill' },
    { name: 'React', slug: 'react', category: 'skill' },
    { name: 'Next.js', slug: 'nextjs', category: 'skill' },
    { name: 'Node.js', slug: 'nodejs', category: 'skill' },
    { name: 'Python', slug: 'python', category: 'skill' },
    { name: 'Graphic Design', slug: 'graphic-design', category: 'skill' },
    { name: 'UI/UX Design', slug: 'ui-ux-design', category: 'skill' },
    { name: 'Marketing', slug: 'marketing', category: 'skill' },
    { name: 'Copywriting', slug: 'copywriting', category: 'skill' },
    { name: 'Video Editing', slug: 'video-editing', category: 'skill' },
    { name: 'Photography', slug: 'photography', category: 'skill' },
    { name: 'DevOps', slug: 'devops', category: 'skill' },
    { name: 'Cloud', slug: 'cloud', category: 'skill' },
    { name: 'SQL', slug: 'sql', category: 'skill' },
    { name: 'Web Development', slug: 'web-development', category: 'topic' },
    { name: 'Mobile Development', slug: 'mobile-development', category: 'topic' },
    { name: 'Data Science', slug: 'data-science', category: 'topic' },
    { name: 'Cybersecurity', slug: 'cybersecurity', category: 'topic' },
    { name: 'AI/ML', slug: 'ai-ml', category: 'topic' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
  }
  console.log(`  Created ${tags.length} tags`);
}

// ─── Demo Users ────────────────────────────────────────────

async function seedUsers() {
  const usersData = [
    {
      supabaseAuthId: 'seed-auth-001',
      email: 'moshe@example.com',
      username: 'moshe_dev',
      displayName: 'משה כהן',
      slug: 'moshe-cohen',
      role: 'ADMIN' as const,
      gender: 'MALE' as const,
      bio: 'מפתח Full Stack עם 10 שנות ניסיון. מתמחה ב-React ו-Node.js',
      location: 'ירושלים',
    },
    {
      supabaseAuthId: 'seed-auth-002',
      email: 'yosef@example.com',
      username: 'yosef_design',
      displayName: 'יוסף לוי',
      slug: 'yosef-levi',
      role: 'USER' as const,
      gender: 'MALE' as const,
      bio: 'מעצב גרפי ומעצב UI/UX. אוהב עיצוב נקי ומינימליסטי',
      location: 'בני ברק',
    },
    {
      supabaseAuthId: 'seed-auth-003',
      email: 'david@example.com',
      username: 'david_pm',
      displayName: 'דוד ישראלי',
      slug: 'david-israeli',
      role: 'MODERATOR' as const,
      gender: 'MALE' as const,
      bio: 'מנהל פרויקטים בכיר. מלווה צוותי פיתוח בארגונים גדולים',
      location: 'מודיעין עילית',
    },
    {
      supabaseAuthId: 'seed-auth-004',
      email: 'aharon@example.com',
      username: 'aharon_data',
      displayName: 'אהרן שפירא',
      slug: 'aharon-shapira',
      role: 'USER' as const,
      gender: 'MALE' as const,
      bio: 'מהנדס נתונים ומומחה BI. עובד עם Python, SQL ו-Tableau',
      location: 'ביתר עילית',
    },
    {
      supabaseAuthId: 'seed-auth-005',
      email: 'shmuel@example.com',
      username: 'shmuel_market',
      displayName: 'שמואל גולדברג',
      slug: 'shmuel-goldberg',
      role: 'USER' as const,
      gender: 'MALE' as const,
      bio: 'יועץ שיווק דיגיטלי. מתמחה בקמפיינים ממוקדי תוצאות',
      location: 'אלעד',
    },
  ];

  const users = [];
  for (const data of usersData) {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {},
      create: data,
    });

    // Create settings for each user
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    // Create membership for each user
    await prisma.membership.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        tier: data.role === 'ADMIN' ? 'BUSINESS' : 'FREE',
      },
    });

    // Create reputation
    await prisma.reputation.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    users.push(user);
  }
  console.log(`  Created ${users.length} demo users`);
  return users;
}

// ─── Forums ────────────────────────────────────────────────

async function seedForums(categories: Array<{ id: string }>) {
  const forumsData = [
    // Technology category
    { categoryId: categories[0]!.id, name: 'פיתוח ווב', slug: 'web-development', description: 'דיונים על פיתוח אתרי אינטרנט ואפליקציות ווב', displayOrder: 1 },
    { categoryId: categories[0]!.id, name: 'פיתוח מובייל', slug: 'mobile-development', description: 'פיתוח אפליקציות לאנדרואיד ואייפון', displayOrder: 2 },
    { categoryId: categories[0]!.id, name: 'DevOps וענן', slug: 'devops-cloud', description: 'תשתיות, CI/CD, Docker, Kubernetes', displayOrder: 3 },
    // Business category
    { categoryId: categories[1]!.id, name: 'יזמות וסטארטאפ', slug: 'entrepreneurship', description: 'דיונים על יזמות, גיוס הון וניהול עסק', displayOrder: 1 },
    { categoryId: categories[1]!.id, name: 'פרילנס', slug: 'freelancing', description: 'טיפים וניסיון בעבודת פרילנס', displayOrder: 2 },
    // Career category
    { categoryId: categories[2]!.id, name: 'ראיונות עבודה', slug: 'job-interviews', description: 'הכנה לראיונות, שאלות נפוצות וחוויות', displayOrder: 1 },
    { categoryId: categories[2]!.id, name: 'הסבת קריירה', slug: 'career-change', description: 'מעבר לתחום ההייטק — שאלות וייעוץ', displayOrder: 2 },
    // General category
    { categoryId: categories[3]!.id, name: 'שיחה חופשית', slug: 'free-talk', description: 'שיחות על כל נושא', displayOrder: 1 },
  ];

  const forums = [];
  for (const data of forumsData) {
    const forum = await prisma.forum.upsert({
      where: { slug: data.slug },
      update: {},
      create: data,
    });
    forums.push(forum);
  }
  console.log(`  Created ${forums.length} forums`);
  return forums;
}

// ─── Threads & Posts ───────────────────────────────────────

async function seedThreadsAndPosts(
  forums: Array<{ id: string; slug: string }>,
  users: Array<{ id: string }>,
) {
  const threadsData = [
    {
      forumIndex: 0, // web-development
      authorIndex: 0,
      title: 'מה עדיף ללמוד ב-2026 — React או Vue?',
      slug: 'react-vs-vue-2026',
      content: 'שלום לכולם,\n\nאני מתחיל ללמוד פיתוח ווב ומתלבט בין React ל-Vue. מהצד אחד, React נפוץ יותר בשוק העבודה הישראלי, אבל Vue נראה פשוט יותר ללמידה.\n\nמה דעתכם? מה עדיף להתמקד בו?',
      replies: [
        { authorIndex: 1, content: 'לדעתי React בלי ספק. הביקוש בשוק הרבה יותר גבוה, במיוחד עם Next.js שהפך לסטנדרט.' },
        { authorIndex: 2, content: 'אני דווקא חושב שזה תלוי במטרה. אם אתה רוצה עבודה מהירה — React. אם אתה בונה פרויקטים עצמאיים — Vue יכול להיות מעולה.' },
        { authorIndex: 3, content: 'הייתי ממליץ להתחיל עם JavaScript טוב ואז React. ככה יש לך בסיס חזק.' },
      ],
    },
    {
      forumIndex: 0, // web-development
      authorIndex: 2,
      title: 'Prisma vs Drizzle — מה אתם מעדיפים?',
      slug: 'prisma-vs-drizzle-orm',
      content: 'יש לי פרויקט חדש עם PostgreSQL ואני מתלבט בין Prisma ל-Drizzle כ-ORM.\n\nPrisma נראה יציב ומוכח, אבל Drizzle מהיר יותר ויש לו typesafety ברמה גבוהה יותר.\n\nמה הניסיון שלכם?',
      replies: [
        { authorIndex: 0, content: 'אני עובד עם Prisma כבר 3 שנים ומרוצה מאוד. ה-migrations וה-studio מצוינים. Drizzle מעניין אבל עדיין צעיר.' },
        { authorIndex: 4, content: 'Drizzle ORM הוא פשוט מדהים! הביצועים טובים משמעותית. שווה לנסות.' },
      ],
    },
    {
      forumIndex: 3, // entrepreneurship
      authorIndex: 4,
      title: 'איך להתחיל עסק פרילנס בתחום הווב?',
      slug: 'starting-web-freelance-business',
      content: 'שלום,\n\nאני מפתח עם שנתיים ניסיון ורוצה להתחיל לעבוד כפרילנסר. יש לי כמה שאלות:\n\n1. איך מוצאים את הלקוחות הראשונים?\n2. כמה לגבות בהתחלה?\n3. איך מנהלים חשבונות ומע"מ?\n\nאשמח לטיפים מניסיון.',
      replies: [
        { authorIndex: 2, content: 'תתחיל מהרשת האישית שלך. תספר לכולם שאתה מציע שירותי פיתוח. הלקוחות הראשונים תמיד מגיעים מהמכרים.' },
        { authorIndex: 0, content: 'לגבי מחירים — תחקור את השוק. מפתח ווב מתחיל בפרילנס לוקח בדרך כלל 150-250 ש"ח לשעה. עם הזמן אפשר להעלות.' },
        { authorIndex: 3, content: 'ממליץ בחום לפתוח עוסק מורשה ולא פטור. זה משדר רצינות ומאפשר לעבוד עם חברות.' },
        { authorIndex: 1, content: 'הדבר הכי חשוב — בנה תיק עבודות טוב. גם אם זה פרויקטים אישיים, זה מה שמשכנע לקוחות.' },
      ],
    },
    {
      forumIndex: 5, // job-interviews
      authorIndex: 1,
      title: 'חוויה מראיון עבודה ב-Wix — מה שלמדתי',
      slug: 'wix-interview-experience',
      content: 'עברתי לאחרונה תהליך ראיונות ב-Wix ורציתי לשתף את החוויה:\n\n1. **סינון טלפוני** — שאלות כלליות על הניסיון ומוטיבציה\n2. **מבחן קידוד** — תרגיל ב-JavaScript, שעה וחצי\n3. **ראיון טכני** — שאלות על React, ביצועים, ארכיטקטורה\n4. **ראיון אישי** — התאמה צוותית\n\nהדבר הכי חשוב — להכיר טוב את ה-fundamentals של JavaScript. שאלו הרבה על closures, event loop ו-promises.',
      replies: [
        { authorIndex: 0, content: 'תודה על השיתוף! מאוד מועיל. כמה זמן לקח כל התהליך מתחילה ועד סוף?' },
        { authorIndex: 3, content: 'חוויה דומה גם אצלי. הם באמת שמים דגש על fundamentals ולא רק על frameworks.' },
      ],
    },
    {
      forumIndex: 7, // free-talk
      authorIndex: 3,
      title: 'המלצות על עמדת עבודה ארגונומית לעבודה מהבית',
      slug: 'ergonomic-home-office-setup',
      content: 'מחפש המלצות על ציוד לעמדת עבודה ביתית נוחה. עובד מהבית כבר שנה וחש כאבי גב.\n\nמה יש לכם? כסא, שולחן, מסך?',
      replies: [
        { authorIndex: 0, content: 'השקעתי בכסא ארגונומי של Herman Miller — שינוי דרמטי. יקר, אבל שווה כל שקל.' },
        { authorIndex: 4, content: 'שולחן עמידה-ישיבה זה חובה לדעתי. אני מחליף תנוחות כל שעה וזה עוזר מאוד.' },
      ],
    },
  ];

  let threadCount = 0;
  let postCount = 0;

  for (const data of threadsData) {
    const forum = forums[data.forumIndex]!;
    const author = users[data.authorIndex]!;

    const thread = await prisma.thread.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        forumId: forum.id,
        authorId: author.id,
        title: data.title,
        slug: data.slug,
        content: data.content,
        moderationStatus: 'APPROVED',
        postCount: data.replies.length,
      },
    });
    threadCount++;

    for (const reply of data.replies) {
      const replyAuthor = users[reply.authorIndex]!;
      await prisma.post.create({
        data: {
          threadId: thread.id,
          authorId: replyAuthor.id,
          content: reply.content,
          moderationStatus: 'APPROVED',
        },
      });
      postCount++;
    }
  }

  // Update forum thread/post counts
  for (const forum of forums) {
    const count = await prisma.thread.count({ where: { forumId: forum.id } });
    const posts = await prisma.post.count({
      where: { thread: { forumId: forum.id } },
    });
    await prisma.forum.update({
      where: { id: forum.id },
      data: { threadCount: count, postCount: posts },
    });
  }

  console.log(`  Created ${threadCount} threads and ${postCount} posts`);
}

// ─── Notifications ─────────────────────────────────────────

async function seedNotifications(userId: string) {
  const notifications = [
    {
      userId,
      type: 'THREAD_REPLY' as const,
      title: 'תגובה חדשה לדיון שלך',
      body: 'יוסף לוי הגיב לדיון "מה עדיף ללמוד ב-2026 — React או Vue?"',
      channels: ['IN_APP' as const],
      actionUrl: '/forums/web-development/react-vs-vue-2026',
    },
    {
      userId,
      type: 'POST_REACTION' as const,
      title: 'אהבו את התגובה שלך',
      body: 'דוד ישראלי סימן את התגובה שלך כמועילה',
      channels: ['IN_APP' as const],
      actionUrl: '/forums/web-development/prisma-vs-drizzle-orm',
    },
    {
      userId,
      type: 'NEW_MESSAGE' as const,
      title: 'הודעה חדשה',
      body: 'שמואל גולדברג שלח לך הודעה',
      channels: ['IN_APP' as const],
      actionUrl: '/messages',
    },
    {
      userId,
      type: 'SYSTEM_ANNOUNCEMENT' as const,
      title: 'ברוכים הבאים לפלטפורמה!',
      body: 'שמחים שהצטרפת לקהילת אנשי המקצוע. התחל בהתאמת הפרופיל שלך.',
      channels: ['IN_APP' as const],
      actionUrl: '/settings',
    },
    {
      userId,
      type: 'MENTION' as const,
      title: 'מישהו הזכיר אותך',
      body: 'אהרן שפירא הזכיר אותך בדיון על ארכיטקטורת מיקרוסרביסים',
      channels: ['IN_APP' as const],
      actionUrl: '/forums/web-development/react-vs-vue-2026',
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.create({ data: notification });
  }
  console.log(`  Created ${notifications.length} notifications`);
}

// ─── Conversations & Messages ──────────────────────────────

async function seedConversations(users: Array<{ id: string }>) {
  // Conversation 1: moshe <-> yosef
  const conv1 = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: {
        create: [
          { userId: users[0]!.id, isAdmin: false },
          { userId: users[1]!.id, isAdmin: false },
        ],
      },
    },
  });

  const messages1 = [
    { conversationId: conv1.id, senderId: users[1]!.id, content: 'שלום משה, ראיתי את הפרויקט שלך בתיק העבודות. עבודה מדהימה!' },
    { conversationId: conv1.id, senderId: users[0]!.id, content: 'תודה רבה יוסף! מעריך את המילים הטובות.' },
    { conversationId: conv1.id, senderId: users[1]!.id, content: 'אשמח לשתף פעולה בפרויקט הבא. אני יכול לעשות את החלק של ה-UI/UX.' },
    { conversationId: conv1.id, senderId: users[0]!.id, content: 'זה נשמע מצוין! בוא נדבר על זה בהרחבה. יש לי פרויקט שמתחיל בשבוע הבא.' },
  ];

  for (const msg of messages1) {
    await prisma.message.create({ data: msg });
  }

  // Conversation 2: moshe <-> shmuel
  const conv2 = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: {
        create: [
          { userId: users[0]!.id, isAdmin: false },
          { userId: users[4]!.id, isAdmin: false },
        ],
      },
    },
  });

  const messages2 = [
    { conversationId: conv2.id, senderId: users[4]!.id, content: 'היי, אני צריך עזרה בבניית אתר לעסק שלי. מתאים לך?' },
    { conversationId: conv2.id, senderId: users[0]!.id, content: 'בטח! ספר לי עוד על העסק ומה אתה מחפש.' },
    { conversationId: conv2.id, senderId: users[4]!.id, content: 'אני מנהל סוכנות שיווק דיגיטלי. צריך אתר תדמית עם בלוג ודף נחיתה.' },
  ];

  for (const msg of messages2) {
    await prisma.message.create({ data: msg });
  }

  // Update unread counts
  await prisma.conversationParticipant.updateMany({
    where: { conversationId: conv1.id, userId: users[0]!.id },
    data: { unreadCount: 1 },
  });
  await prisma.conversationParticipant.updateMany({
    where: { conversationId: conv2.id, userId: users[0]!.id },
    data: { unreadCount: 1 },
  });

  console.log('  Created 2 conversations with messages');
}

// ─── Freelancer Profiles ──────────────────────────────────

async function seedFreelancerProfiles(users: Array<{ id: string }>) {
  const profiles = [
    {
      userId: users[0]!.id,
      headline: 'מפתח Full Stack מנוסה — React, Node.js, TypeScript',
      description: 'מפתח עם 10 שנות ניסיון בבניית אפליקציות ווב מורכבות. מתמחה ב-React, Next.js, Node.js ו-PostgreSQL. עבדתי עם חברות הייטק מובילות ופרויקטים בקנה מידה גדול.',
      hourlyRateAgorot: 25000,
      skills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'PostgreSQL'],
      availability: 'AVAILABLE',
      completedProjects: 24,
      averageRating: 4.8,
    },
    {
      userId: users[1]!.id,
      headline: 'מעצב UI/UX ומעצב גרפי — עיצוב נקי ומקצועי',
      description: 'מעצב עם 7 שנות ניסיון. מתמחה בעיצוב ממשקים, חוויית משתמש ומיתוג. עובד עם Figma, Photoshop ו-Illustrator. מאמין בעיצוב מינימליסטי שמדבר לבד.',
      hourlyRateAgorot: 20000,
      skills: ['UI/UX', 'Figma', 'Photoshop', 'Illustrator', 'Branding'],
      availability: 'AVAILABLE',
      completedProjects: 37,
      averageRating: 4.9,
    },
    {
      userId: users[3]!.id,
      headline: 'מהנדס נתונים ומומחה BI — Python, SQL, Tableau',
      description: 'מומחה נתונים עם ניסיון של 5 שנים. בונה צינורות נתונים, דוחות BI ומודלים אנליטיים. עובד עם Python, SQL, BigQuery ו-Tableau.',
      hourlyRateAgorot: 22000,
      skills: ['Python', 'SQL', 'Tableau', 'BigQuery', 'Data Analysis'],
      availability: 'BUSY',
      completedProjects: 15,
      averageRating: 4.6,
    },
  ];

  for (const profile of profiles) {
    await prisma.freelancerProfile.upsert({
      where: { userId: profile.userId },
      update: {},
      create: profile,
    });
  }
  console.log(`  Created ${profiles.length} freelancer profiles`);
}

// ─── Marketplace Projects ─────────────────────────────────

async function seedProjects(users: Array<{ id: string }>) {
  const projectsData = [
    {
      clientId: users[4]!.id,
      title: 'בניית אתר תדמית לסוכנות שיווק',
      slug: 'marketing-agency-website',
      description: 'אנחנו מחפשים מפתח ווב מנוסה לבנות אתר תדמית מודרני לסוכנות השיווק שלנו. האתר צריך לכלול עמוד ראשי, עמוד שירותים, בלוג, טופס יצירת קשר ועמוד אודות. עיצוב נקי ומקצועי, מותאם למובייל, עם SEO בסיסי.',
      budgetMinAgorot: 500000,
      budgetMaxAgorot: 1200000,
      skills: ['React', 'Next.js', 'Tailwind CSS', 'SEO'],
      status: 'OPEN' as const,
      moderationStatus: 'APPROVED' as const,
      isUrgent: false,
    },
    {
      clientId: users[2]!.id,
      title: 'פיתוח אפליקציית ניהול משימות לצוות',
      slug: 'team-task-management-app',
      description: 'צריך אפליקציית ווב לניהול משימות לצוות של 20 אנשים. פיצ\'רים: יצירת משימות, הקצאה לחברי צוות, מעקב סטטוס, תאריכי יעד, התראות, וממשק ניהול. כולל API ל-אינטגרציות עתידיות.',
      budgetMinAgorot: 800000,
      budgetMaxAgorot: 2000000,
      skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'WebSocket'],
      status: 'OPEN' as const,
      moderationStatus: 'APPROVED' as const,
      isUrgent: true,
    },
    {
      clientId: users[4]!.id,
      title: 'עיצוב לוגו וזהות מותגית לסטארטאפ',
      slug: 'startup-brand-identity',
      description: 'סטארטאפ חדש בתחום ה-EdTech מחפש מעצב לבניית זהות מותגית מלאה: לוגו, פלטת צבעים, טיפוגרפיה, כרטיסי ביקור, ומדריך מותג. נא לצרף דוגמאות עבודה רלוונטיות.',
      budgetMinAgorot: 300000,
      budgetMaxAgorot: 700000,
      skills: ['Branding', 'Logo Design', 'Illustrator', 'Figma'],
      status: 'OPEN' as const,
      moderationStatus: 'APPROVED' as const,
      isUrgent: false,
    },
  ];

  for (const project of projectsData) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: {},
      create: project,
    });
  }
  console.log(`  Created ${projectsData.length} marketplace projects`);
}

// ─── Classified Listings ──────────────────────────────────

async function seedClassifiedListings(users: Array<{ id: string }>) {
  const categories = await prisma.classifiedCategory.findMany();
  const servicesCategory = categories.find((c) => c.slug === 'professional-services');
  const jobsCategory = categories.find((c) => c.slug === 'jobs');
  const equipmentCategory = categories.find((c) => c.slug === 'equipment');

  if (!servicesCategory || !jobsCategory || !equipmentCategory) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const listings = [
    {
      categoryId: servicesCategory.id,
      authorId: users[1]!.id,
      title: 'שירותי עיצוב גרפי ו-UI/UX',
      slug: 'graphic-design-services',
      description: 'מציע שירותי עיצוב גרפי מקצועיים: לוגו, מיתוג, עיצוב ממשקים, חומרי שיווק. 7 שנות ניסיון, עבודה מהירה ומקצועית. מחירים תחרותיים. דוגמאות עבודה בתיק העבודות שלי.',
      type: 'SERVICE' as const,
      priceAgorot: 15000,
      priceLabel: 'החל מ-',
      location: 'בני ברק',
      contactPhone: '050-1234567',
      contactEmail: 'yosef@example.com',
      images: [],
      status: 'ACTIVE' as const,
      moderationStatus: 'APPROVED' as const,
      expiresAt,
    },
    {
      categoryId: jobsCategory.id,
      authorId: users[2]!.id,
      title: 'דרוש מפתח React בכיר — עבודה מהבית',
      slug: 'senior-react-developer-needed',
      description: 'מחפשים מפתח React בכיר לפרויקט של 6 חודשים. עבודה מלאה מהבית. דרישות: 4+ שנות ניסיון ב-React, ניסיון עם TypeScript ו-Next.js. תנאים מעולים.',
      type: 'JOB_OFFER' as const,
      priceAgorot: 4500000,
      priceLabel: 'שכר חודשי',
      location: 'עבודה מרחוק',
      contactEmail: 'david@example.com',
      images: [],
      status: 'ACTIVE' as const,
      moderationStatus: 'APPROVED' as const,
      expiresAt,
    },
    {
      categoryId: equipmentCategory.id,
      authorId: users[3]!.id,
      title: 'מסך Apple Studio Display למכירה — כמו חדש',
      slug: 'apple-studio-display-for-sale',
      description: 'מוכר מסך Apple Studio Display 27 אינץ\' 5K. קניתי לפני 6 חודשים, במצב מעולה, כולל אריזה מקורית. סיבת מכירה: שדרגתי ל-Pro Display XDR.',
      type: 'SELLING' as const,
      priceAgorot: 450000,
      location: 'ביתר עילית',
      contactPhone: '052-9876543',
      images: [],
      status: 'ACTIVE' as const,
      moderationStatus: 'APPROVED' as const,
      expiresAt,
    },
  ];

  for (const listing of listings) {
    await prisma.classifiedListing.upsert({
      where: { slug: listing.slug },
      update: {},
      create: listing,
    });
  }
  console.log(`  Created ${listings.length} classified listings`);
}

// ─── Portfolios ───────────────────────────────────────────

async function seedPortfolios(users: Array<{ id: string }>) {
  // Create portfolio for designer (yosef)
  const portfolio = await prisma.portfolio.upsert({
    where: { userId: users[1]!.id },
    update: {},
    create: {
      userId: users[1]!.id,
      title: 'תיק עבודות — יוסף לוי',
      description: 'אוסף של עבודות עיצוב וממשקים שעיצבתי בשנים האחרונות',
      visibility: 'PUBLIC',
    },
  });

  const projects = [
    {
      portfolioId: portfolio.id,
      title: 'עיצוב אפליקציית בנקאות מובייל',
      slug: 'mobile-banking-app-design',
      description: 'עיצוב מלא של אפליקציית בנקאות מובייל. כולל: מסך כניסה, דשבורד, העברת כספים, היסטוריית פעולות ועוד. עיצוב נקי ומודרני עם דגש על חוויית משתמש.',
      coverImageUrl: '/images/portfolio/banking-app-cover.webp',
      category: 'ui-ux',
      tags: ['Mobile', 'Banking', 'Fintech'],
      tools: ['Figma', 'Photoshop'],
      displayOrder: 1,
    },
    {
      portfolioId: portfolio.id,
      title: 'מיתוג מלא לחברת טכנולוגיה',
      slug: 'tech-company-branding',
      description: 'פרויקט מיתוג מלא לסטארטאפ טכנולוגי. כולל: לוגו, פלטת צבעים, טיפוגרפיה, כרטיסי ביקור, תבניות מצגת ומדריך מותג.',
      coverImageUrl: '/images/portfolio/branding-cover.webp',
      category: 'graphic-design',
      tags: ['Branding', 'Logo', 'Identity'],
      tools: ['Illustrator', 'InDesign'],
      displayOrder: 2,
    },
    {
      portfolioId: portfolio.id,
      title: 'עיצוב דשבורד BI לניהול מכירות',
      slug: 'sales-dashboard-design',
      description: 'עיצוב דשבורד אנליטי לצוות מכירות. גרפים, טבלאות, KPIs ודוחות אינטראקטיביים. עיצוב מותאם לנתונים מרובים עם ממשק נקי וקל לשימוש.',
      coverImageUrl: '/images/portfolio/dashboard-cover.webp',
      category: 'ui-ux',
      tags: ['Dashboard', 'Analytics', 'Data Visualization'],
      tools: ['Figma', 'D3.js'],
      displayOrder: 3,
    },
  ];

  for (const project of projects) {
    await prisma.portfolioProject.upsert({
      where: { slug: project.slug },
      update: {},
      create: project,
    });
  }

  // Create portfolio for developer (moshe)
  const portfolio2 = await prisma.portfolio.upsert({
    where: { userId: users[0]!.id },
    update: {},
    create: {
      userId: users[0]!.id,
      title: 'תיק עבודות — משה כהן',
      description: 'פרויקטי פיתוח ווב ואפליקציות',
      visibility: 'PUBLIC',
    },
  });

  await prisma.portfolioProject.upsert({
    where: { slug: 'ecommerce-platform-build' },
    update: {},
    create: {
      portfolioId: portfolio2.id,
      title: 'פיתוח פלטפורמת e-commerce מלאה',
      slug: 'ecommerce-platform-build',
      description: 'פיתוח מאפס של פלטפורמת מסחר אלקטרוני. כולל: קטלוג מוצרים, עגלת קניות, תשלומים, ניהול הזמנות וממשק ניהול. בנוי עם Next.js, Prisma ו-Stripe.',
      coverImageUrl: '/images/portfolio/ecommerce-cover.webp',
      category: 'development',
      tags: ['E-commerce', 'Full Stack', 'Payments'],
      tools: ['Next.js', 'Prisma', 'Stripe', 'Tailwind CSS'],
      displayOrder: 1,
    },
  });

  console.log('  Created 2 portfolios with projects');
}

// ─── Courses ──────────────────────────────────────────────

async function seedCourses(users: Array<{ id: string }>) {
  const courses = [
    {
      instructorId: users[0]!.id,
      title: 'מבוא לפיתוח ווב עם React ו-TypeScript',
      slug: 'intro-react-typescript',
      description: 'קורס מקיף לפיתוח ווב מודרני עם React ו-TypeScript. נלמד מאפס את כל היסודות: Components, Hooks, State Management, API calls ועוד. הקורס כולל פרויקט מעשי שתבנו לאורך הדרך.',
      shortDescription: 'למד לבנות אפליקציות ווב מודרניות עם React ו-TypeScript',
      level: 'BEGINNER',
      priceAgorot: 0,
      isFree: true,
      isPublished: true,
      moderationStatus: 'APPROVED' as const,
      enrollmentCount: 45,
      averageRating: 4.5,
    },
    {
      instructorId: users[1]!.id,
      title: 'עיצוב UI/UX למתקדמים — Figma Masterclass',
      slug: 'figma-masterclass-advanced',
      description: 'קורס מתקדם בעיצוב ממשקי משתמש ב-Figma. נלמד: Design Systems, Auto Layout, Prototyping, Handoff to developers, Components Library ועוד. מיועד למעצבים עם ניסיון בסיסי ב-Figma.',
      shortDescription: 'קורס מתקדם בעיצוב ממשקים ו-Design Systems ב-Figma',
      level: 'ADVANCED',
      priceAgorot: 14900,
      isFree: false,
      isPublished: true,
      moderationStatus: 'APPROVED' as const,
      enrollmentCount: 23,
      averageRating: 4.8,
    },
    {
      instructorId: users[2]!.id,
      title: 'ניהול פרויקטים דיגיטליים',
      slug: 'digital-project-management',
      description: 'קורס מקיף בניהול פרויקטים דיגיטליים. נלמד: Agile, Scrum, Kanban, ניהול לקוח, אומדן זמנים, ניהול סיכונים ועוד. כולל כלים מעשיים ותבניות.',
      shortDescription: 'למד לנהל פרויקטים דיגיטליים בצורה מקצועית',
      level: 'INTERMEDIATE',
      priceAgorot: 9900,
      isFree: false,
      isPublished: true,
      moderationStatus: 'APPROVED' as const,
      enrollmentCount: 67,
      averageRating: 4.3,
    },
  ];

  for (const courseData of courses) {
    const course = await prisma.course.upsert({
      where: { slug: courseData.slug },
      update: {},
      create: courseData,
    });

    // Add modules and lessons
    if (courseData.slug === 'intro-react-typescript') {
      const module1 = await prisma.courseModule.create({
        data: { courseId: course.id, title: 'מבוא ל-TypeScript', displayOrder: 0 },
      });
      await prisma.lesson.createMany({
        data: [
          { moduleId: module1.id, title: 'מה זה TypeScript?', type: 'TEXT', content: 'TypeScript היא שפת תכנות שמרחיבה את JavaScript עם מערכת טיפוסים סטטית...', displayOrder: 0 },
          { moduleId: module1.id, title: 'טיפוסים בסיסיים', type: 'TEXT', content: 'בשיעור זה נלמד על הטיפוסים הבסיסיים ב-TypeScript: string, number, boolean, array...', displayOrder: 1, isFree: true },
          { moduleId: module1.id, title: 'בוחן: טיפוסים', type: 'QUIZ', quizData: { questions: [{ id: 'q1', question: 'מהו הטיפוס של המשתנה: const x = 5?', options: ['string', 'number', 'boolean', 'any'], correctAnswer: 'number' }] }, displayOrder: 2 },
        ],
      });

      const module2 = await prisma.courseModule.create({
        data: { courseId: course.id, title: 'React Fundamentals', displayOrder: 1 },
      });
      await prisma.lesson.createMany({
        data: [
          { moduleId: module2.id, title: 'Components ו-Props', type: 'TEXT', content: 'Components הם אבני הבניין של React. בשיעור זה נלמד כיצד ליצור ולהשתמש בהם...', displayOrder: 0 },
          { moduleId: module2.id, title: 'Hooks: useState ו-useEffect', type: 'TEXT', content: 'React Hooks מאפשרים לנו לנהל state ו-side effects ב-functional components...', displayOrder: 1 },
        ],
      });
    }
  }

  console.log(`  Created ${courses.length} courses with modules and lessons`);
}

// ─── Articles ─────────────────────────────────────────────

async function seedArticles(
  users: Array<{ id: string }>,
  articleCategories: Array<{ id: string; slug: string }>,
) {
  const techCategory = articleCategories.find((c) => c.slug === 'tech-articles');
  const careerCategory = articleCategories.find((c) => c.slug === 'career-articles');
  const businessCategory = articleCategories.find((c) => c.slug === 'business-articles');

  if (!techCategory || !careerCategory || !businessCategory) return;

  const articles = [
    {
      authorId: users[0]!.id,
      categoryId: techCategory.id,
      title: '10 טיפים לכתיבת TypeScript נקי ויעיל',
      slug: '10-typescript-tips',
      content: `TypeScript הפכה לשפה הפופולרית ביותר בפיתוח ווב מודרני. הנה 10 טיפים שיעזרו לכם לכתוב קוד TypeScript טוב יותר:

1. השתמשו ב-strict mode תמיד
2. העדיפו interface על type לאובייקטים
3. השתמשו ב-unknown במקום any
4. נצלו את Type Guards
5. השתמשו ב-const assertions
6. כתבו Generics כשצריך
7. השתמשו ב-Zod לוולידציה
8. נצלו discriminated unions
9. השתמשו ב-satisfies operator
10. בנו סוגי עזר (utility types) משלכם

בואו נצלול לפרטים של כל טיפ...`,
      excerpt: '10 טיפים מעשיים לכתיבת TypeScript מקצועי שיעזרו לכם לכתוב קוד בטוח ונקי יותר',
      isPublished: true,
      isEditorsPick: true,
      moderationStatus: 'APPROVED' as const,
      viewCount: 234,
      likeCount: 45,
      commentCount: 12,
      publishedAt: new Date('2026-01-15'),
    },
    {
      authorId: users[2]!.id,
      categoryId: careerCategory.id,
      title: 'איך להתחיל קריירה בהייטק — מדריך מקיף',
      slug: 'starting-tech-career-guide',
      content: `הייטק הוא אחד הענפים המתגמלים ביותר בישראל. בין אם אתם מתחילים מאפס או מחליפים קריירה, הנה המדריך המלא:

שלב 1: בחרו תחום
שלב 2: למדו את היסודות
שלב 3: בנו פרויקטים
שלב 4: בנו תיק עבודות
שלב 5: התחילו לחפש עבודה

הדרך אינה קלה, אבל עם התמדה ועבודה קשה — ההצלחה מובטחת.`,
      excerpt: 'מדריך צעד אחר צעד למי שרוצה להתחיל קריירה בהייטק — גם בלי ניסיון קודם',
      isPublished: true,
      isEditorsPick: false,
      moderationStatus: 'APPROVED' as const,
      viewCount: 567,
      likeCount: 89,
      commentCount: 34,
      publishedAt: new Date('2026-02-01'),
    },
    {
      authorId: users[3]!.id,
      categoryId: businessCategory.id,
      title: 'המדריך המלא לפרילנסרים — איך לנהל עסק עצמאי',
      slug: 'freelancer-business-guide',
      content: `ניהול עסק כפרילנסר דורש יותר מכישורים מקצועיים. הנה מה שצריך לדעת:

1. תמחור נכון — איך לקבוע מחיר
2. חוזים ותנאים — הגנה משפטית
3. ניהול זמן — כלים ושיטות
4. שיווק עצמי — איך למצוא לקוחות
5. ניהול פיננסי — מיסים, חשבוניות, חיסכון

זכרו: אתם לא רק המקצוען — אתם גם מנהל העסק.`,
      excerpt: 'כל מה שצריך לדעת על ניהול עסק עצמאי כפרילנסר — מתמחור ועד שיווק',
      isPublished: true,
      isEditorsPick: true,
      moderationStatus: 'APPROVED' as const,
      viewCount: 345,
      likeCount: 67,
      commentCount: 23,
      publishedAt: new Date('2026-02-10'),
    },
  ];

  for (const article of articles) {
    await prisma.article.upsert({
      where: { slug: article.slug },
      update: {},
      create: article,
    });
  }

  console.log(`  Created ${articles.length} articles`);
}

// ─── Run ───────────────────────────────────────────────────

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
