-- PostgreSQL Schema for MLIC CHALLENGE Platform
-- Production Schema: Confidential Feasibility Studies & Lajna Approvals

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'participant', -- 'participant', 'lajna', 'admin'
    organization VARCHAR(255) DEFAULT '',
    bio TEXT DEFAULT '',
    is_approved INT DEFAULT 1,                       -- Only Admin can approve Lajna (1=approved, 0=pending)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS challenges (
    id VARCHAR(64) PRIMARY KEY,
    competition_type VARCHAR(32) NOT NULL DEFAULT 'marketing_strategy', -- 'marketing_strategy' | 'theme_idea'
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    summary TEXT NOT NULL,
    problem_statement TEXT NOT NULL,
    expected_outcomes TEXT NOT NULL,
    target_sectors TEXT NOT NULL,
    reward_or_grant VARCHAR(255) DEFAULT '',
    author_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    is_active INT DEFAULT 1,
    is_open INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
    id VARCHAR(64) PRIMARY KEY,
    challenge_id VARCHAR(64) REFERENCES challenges(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    author_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    pitch TEXT NOT NULL,
    team_name VARCHAR(255) NOT NULL,
    team_members TEXT NOT NULL,
    target_audience JSONB NOT NULL,
    swot JSONB NOT NULL,
    feasibility JSONB NOT NULL,
    document_path TEXT DEFAULT '',      -- Attached document path (/uploads/...)
    document_name TEXT DEFAULT '',      -- Original filename (.pdf, .docx, etc.)
    document_size INT DEFAULT 0,        -- File size in bytes
    status VARCHAR(32) NOT NULL DEFAULT 'submitted', -- 'draft', 'submitted', 'shortlisted', 'winner'
    likes_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluations (
    id VARCHAR(64) PRIMARY KEY,
    submission_id VARCHAR(64) REFERENCES submissions(id) ON DELETE CASCADE,
    judge_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    judge_name VARCHAR(255) NOT NULL,
    score_problem_audience INT NOT NULL CHECK (score_problem_audience BETWEEN 0 AND 20),
    score_swot INT NOT NULL CHECK (score_swot BETWEEN 0 AND 20),
    score_feasibility_tech INT NOT NULL CHECK (score_feasibility_tech BETWEEN 0 AND 25),
    score_feasibility_financial INT NOT NULL CHECK (score_feasibility_financial BETWEEN 0 AND 25),
    score_innovation INT NOT NULL CHECK (score_innovation BETWEEN 0 AND 10),
    total_score INT NOT NULL CHECK (total_score BETWEEN 0 AND 100),
    feedback TEXT DEFAULT '',
    strengths_observed TEXT DEFAULT '',
    recommendations TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (submission_id, judge_id)
);

CREATE TABLE IF NOT EXISTS votes (
    id VARCHAR(64) PRIMARY KEY,
    submission_id VARCHAR(64) REFERENCES submissions(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (submission_id, user_id)
);

CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_submissions_challenge ON submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_submission ON evaluations(submission_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_judge ON evaluations(judge_id);

-- Initial Platform Settings
INSERT INTO platform_settings (key, value) 
VALUES ('competition_title', 'MLIC CHALLENGE 2026'), ('winners_announced', 'false')
ON CONFLICT (key) DO NOTHING;

-- Challenge #1 Seed: Omni AI Automation OS (Competition 1: Marketing Strategy)
INSERT INTO challenges (id, competition_type, title, category, summary, problem_statement, expected_outcomes, target_sectors, reward_or_grant, is_active, is_open)
VALUES (
    'challenge_omni_ai_automation',
    'marketing_strategy',
    'منظومة الأتمتة الشاملة بالذكاء الاصطناعي (Omni AI Automation OS)',
    'الذكاء الاصطناعي والأتمتة الذكية (AI & Automation)',
    'ابتكار نظام متكامل لأتمتة المهام الرقمية والمكتبية (Word, Excel, PowerPoint)، أتمتة المواقع وتصفح الويب، جدولة المواعيد الذكية (Rendez-vous)، وتكامل واجهات الذكاء الاصطناعي (AI APIs) مع نظام اشتراكات ومدفوعات إلكترونية.',
    'تهدر المؤسسات والشركات والأفراد آلاف الساعات سنوياً في تنفيذ الأعمال الرقمية المتكررة: إنشاء وتنسيق مستندات Word، معالجة الجداول وتحليل بيانات Excel المعقدة، تصميم عروض PowerPoint التقديمية، تعبئة النماذج والتنقل في المواقع الإلكترونية، وجدولة المواعيد وتنسيق اللقاءات (Rendez-vous).

🎯 التحدي المطلوب من المشاركين:
تقديم أفضل استراتيجية تسويق ودراسة جدوى متكاملة لمنظومة أتمتة ذاتية (Autonomous AI Automation OS) تعمل كـ "وكيل عمل ذكي شامل" يقوم بتنفيذ كافة هذه المهام، مع تمكين كل عميل من ربط مفاتيح الذكاء الاصطناعي الخاصة به (Bring-Your-Own-API Key / Multi-Tenant AI Integration) لضمان الخصوصية والتحكم في التكاليف، مع توفير نموذج ربحي ونظام مدفوعات متكامل (Payment System).

📋 المتطلبات الإلزامية في استمارة المشاركة:
1. دراسة الجمهور المستهدف (Target Audience): تحديد القطاعات والشرائح المستفيدة وتحليل احتياجاتهم (Pain Points) والقيمة المقدمة.
2. تحليل SWOT الرباعي: تحليل نقاط القوة، نقاط الضعف، الفرص السوقية، والتهديدات التقنية والتنافسية.
3. دراسة الجدوى الفنية (Technical Feasibility): المعمارية التقنية، محركات الأتمتة لمستندات Office ومواقع الويب، ومستوى الجاهزية (TRL).
4. استراتيجية التسويق والوصول للأسواق (Marketing Strategy): قنوات التسويق، خطة الاستحواذ، والميزة التنافسية.
5. دراسة الجدوى المالية ونظام المدفوعات (Financial Feasibility & Payment System):
   - هيكل التكاليف (CAPEX & OPEX) والعائد على الاستثمار المتوقع (ROI).
   - نموذج التسعير والفوترة وبوابات الدفع الإلكترونية المقترحة (Stripe / Local Payment Gateways / نظام الاشتراكات ونظام الأرصدة Pay-Per-Task).
6. إرفاق ملف التوثيق والدراسة الكاملة (PDF / Word / PowerPoint / Excel) عبر خانة رفع الملفات.',
    '• خطة واستراتيجية تسويق متكاملة للوصول إلى العملاء المستهدفين وتحقيق النمو.
• إبراز القيمة التنافسية لأتمتة مستندات Office (Word, Excel, PowerPoint) ووكيل الويب وجدولة المواعيد.
• نموذج تسعير ونظام مدفوعات وفواتير إلكترونية متكامل (اشتراكات شهرية/سنوية، ونظام الرصيد).
• دراسة جدوى اقتصادية واستراتيجية شاملة مرفقة بملف توثيقي على المنصة.',
    'الشركات والمؤسسات، مكاتب المحاسبة والاستشارات، العيادات والمراكز الخدمية، رواد الأعمال، المستقلون (Freelancers).',
    'جائزة المركز الأول: احتضان تقني للمشروع + دعم تمويلي لتطوير النموذج الأولي + اعتماد رسمي من لجنة التحكيم.',
    1,
    1
)
ON CONFLICT (id) DO NOTHING;

-- Competition 2 Placeholder Seed (Theme to be announced by Admin)
INSERT INTO challenges (id, competition_type, title, category, summary, problem_statement, expected_outcomes, target_sectors, reward_or_grant, is_active, is_open)
VALUES (
    'theme_comp2_tba',
    'theme_idea',
    'محور المسابقة الثانية: سيتم الإعلان عن المحور الرسمي قريباً',
    'أمثلة مقترحة: الطبيعة والاستدامة (Nature) • سيتم تحديد المحور لاحقاً',
    'في هذه المسابقة تقوم الإدارة بطرح محور عام ومفتوح (مثل: الطبيعة والبيئة...)، ويتنافس المشاركون على ابتكار أفضل فكرة مشروع إبداعية تخدم هذا المحور مع دراسة الجدوى الأولية.',
    '⏳ لم يتم نشر المحور الرسمي بعد — ستقوم إدارة المسابقة (Admin) بتحديد المحور وإتاحة التقديم قريباً.

🌿 كيف ستعمل المسابقة الثانية عند فتح المحور:
1. تحدد الإدارة المحور الرئيسي للمسابقة (على سبيل المثال: الطبيعة والاستدامة، أو محور آخر تعلنه الإدارة).
2. يبتكر كل مشارك أو فريق أفضل فكرة مشروع أصلية تخدم هذا المحور.
3. يقدّم المشارك شرح الفكرة، الجمهور المستهدف، تحليل SWOT، والجدوى الأولية مع إرفاق ملف العرض التوضيحي (PDF / PPTX / DOCX).',
    '• فكرة مشروع أصلية ومبتكرة مرتبطة مباشرة بمحور المسابقة المعلن.
• توضيح المشكلة التي تعالجها الفكرة والقيمة المضافة للمجتمع أو السوق.
• تحليل SWOT والجدوى المبدئية مع إرفاق مستند أو عرض تقديمي (PDF / PPTX / DOC).',
    'مفتوح لجميع المبدعين، الفرق الطلابية، ورواد الأعمال.',
    'جائزة أفضل فكرة في المحور: احتضان وتطوير الفكرة + شهادة تميز واعتماد من لجنة التحكيم.',
    1,
    0
)
ON CONFLICT (id) DO NOTHING;

-- Initial Admin Seed (default: admin@mlic.com / admin123456)
INSERT INTO users (id, name, email, password_hash, role, organization, bio, is_approved)
VALUES (
    'user_admin_default',
    'Admin MLIC',
    'admin@mlic.com',
    '6a58dc133737adb1a0508a5846da4059:790058edca1c4339e8906587225a70e5b27101b3910b9c0c6c75d996ba88d378dfab18bfa27eb6aca987cff2544bf252f0bc59af1d2d2cd348772421960b44dd',
    'admin',
    'MLIC Organizing Committee',
    'المشرف العام على مسابقة MLIC CHALLENGE',
    1
)
ON CONFLICT (email) DO NOTHING;
