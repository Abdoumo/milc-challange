// Unified Database layer for MLIC CHALLENGE
// Supports PostgreSQL via DATABASE_URL or embedded SQLite zero-config fallback

require('./env');
const path = require('node:path');
const fs = require('node:fs');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const isPostgres = DATABASE_URL.startsWith('postgres://') || DATABASE_URL.startsWith('postgresql://');

let pgPool = null;
let sqliteDb = null;

if (isPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
  console.log('[Database] Connecting to PostgreSQL at', DATABASE_URL.split('@')[1] || 'remote instance');
} else {
  const { DatabaseSync } = require('node:sqlite');
  const DB_PATH = path.join(__dirname, '..', 'database', 'mlic.db');
  sqliteDb = new DatabaseSync(DB_PATH);
  console.log('[Database] Using local SQLite storage at', DB_PATH);
}

// Helper to convert '?' placeholders to '$1, $2, ...' for PostgreSQL
function toPgSql(sql) {
  let idx = 1;
  return sql.replace(/\?/g, () => `$${idx++}`);
}

async function query(sql, params = []) {
  if (isPostgres) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res;
  } else {
    // SQLite
    const stmt = sqliteDb.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return { rows: stmt.all(...params) };
    } else {
      return stmt.run(...params);
    }
  }
}

async function all(sql, params = []) {
  if (isPostgres) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows;
  } else {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(...params);
  }
}

async function get(sql, params = []) {
  if (isPostgres) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows[0] || null;
  } else {
    const stmt = sqliteDb.prepare(sql);
    return stmt.get(...params) || null;
  }
}

async function run(sql, params = []) {
  if (isPostgres) {
    return await pgPool.query(toPgSql(sql), params);
  } else {
    const stmt = sqliteDb.prepare(sql);
    return stmt.run(...params);
  }
}

async function exec(sql) {
  if (isPostgres) {
    return await pgPool.query(sql);
  } else {
    return sqliteDb.exec(sql);
  }
}

// Initialize tables on startup
async function initDatabase() {
  if (isPostgres) {
    try {
      // Migrate existing tables first (ignoring 42P01 undefined_table on fresh DBs) before init_postgres.sql inserts run
      const preMigrations = [
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS group_name VARCHAR(255) DEFAULT '';`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS group_members TEXT DEFAULT '';`,
        `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS competition_type VARCHAR(32) NOT NULL DEFAULT 'marketing_strategy';`,
        `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_open INT NOT NULL DEFAULT 1;`
      ];
      for (const sql of preMigrations) {
        try {
          await pgPool.query(sql);
        } catch (migErr) {
          if (migErr.code !== '42P01') throw migErr;
        }
      }

      const schemaPath = path.join(__dirname, '..', 'database', 'init_postgres.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pgPool.query(schemaSql);
      console.log('[Database] PostgreSQL tables and indexes verified successfully.');
    } catch (err) {
      console.error('[Database] PostgreSQL initialization error:', err.message);
    }
  } else {
    // SQLite schema
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'participant',
        organization TEXT DEFAULT '',
        group_name TEXT DEFAULT '',
        group_members TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        is_approved INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY,
        competition_type TEXT NOT NULL DEFAULT 'marketing_strategy',
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        summary TEXT NOT NULL,
        problem_statement TEXT NOT NULL,
        expected_outcomes TEXT NOT NULL,
        target_sectors TEXT NOT NULL,
        reward_or_grant TEXT DEFAULT '',
        author_id TEXT,
        is_active INTEGER DEFAULT 1,
        is_open INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        challenge_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        title TEXT NOT NULL,
        pitch TEXT NOT NULL,
        team_name TEXT NOT NULL,
        team_members TEXT NOT NULL,
        target_audience TEXT NOT NULL,
        swot TEXT NOT NULL,
        feasibility TEXT NOT NULL,
        document_path TEXT DEFAULT '',
        document_name TEXT DEFAULT '',
        document_size INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'submitted',
        likes_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        judge_id TEXT NOT NULL,
        judge_name TEXT NOT NULL,
        score_problem_audience INTEGER NOT NULL,
        score_swot INTEGER NOT NULL,
        score_feasibility_tech INTEGER NOT NULL,
        score_feasibility_financial INTEGER NOT NULL,
        score_innovation INTEGER NOT NULL,
        total_score INTEGER NOT NULL,
        feedback TEXT DEFAULT '',
        strengths_observed TEXT DEFAULT '',
        recommendations TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (submission_id, judge_id)
      );

      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (submission_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS platform_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.log('[Database] SQLite tables verified.');

    // Safe SQLite column migrations for existing databases
    try {
      const userCols = sqliteDb.prepare('PRAGMA table_info(users)').all().map(c => c.name);
      if (!userCols.includes('group_name')) {
        sqliteDb.exec("ALTER TABLE users ADD COLUMN group_name TEXT DEFAULT ''");
        console.log('[Database] Migrated users.group_name');
      }
      if (!userCols.includes('group_members')) {
        sqliteDb.exec("ALTER TABLE users ADD COLUMN group_members TEXT DEFAULT ''");
        console.log('[Database] Migrated users.group_members');
      }
      const cols = sqliteDb.prepare('PRAGMA table_info(challenges)').all().map(c => c.name);
      if (!cols.includes('competition_type')) {
        sqliteDb.exec("ALTER TABLE challenges ADD COLUMN competition_type TEXT NOT NULL DEFAULT 'marketing_strategy'");
        console.log('[Database] Migrated challenges.competition_type');
      }
      if (!cols.includes('is_open')) {
        sqliteDb.exec('ALTER TABLE challenges ADD COLUMN is_open INTEGER NOT NULL DEFAULT 1');
        console.log('[Database] Migrated challenges.is_open');
      }
    } catch (migErr) {
      console.error('[Database Migration]', migErr.message);
    }
  }

  // Ensure default platform settings exist
  try {
    const existing = await get('SELECT value FROM platform_settings WHERE key = ?', ['competition_title']);
    if (!existing) {
      await run('INSERT INTO platform_settings (key, value) VALUES (?, ?)', ['competition_title', 'MLIC CHALLENGE 2026']);
      await run('INSERT INTO platform_settings (key, value) VALUES (?, ?)', ['winners_announced', 'false']);
    }
  } catch (err) {
    console.error('[Database Settings]', err.message);
  }

  // Ensure Challenge #1 (Competition 1: Marketing Strategy) exists if no marketing_strategy challenges
  try {
    const existingComp1 = await all("SELECT id FROM challenges WHERE competition_type = 'marketing_strategy' LIMIT 1");
    if (!existingComp1 || existingComp1.length === 0) {
      const challengeId = 'challenge_omni_ai_automation';
      const now = new Date().toISOString();
      await run(`
        INSERT INTO challenges (
          id, competition_type, title, category, summary, problem_statement, expected_outcomes, target_sectors, reward_or_grant, is_active, is_open, created_at
        ) VALUES (?, 'marketing_strategy', ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
      `, [
        challengeId,
        'منظومة الأتمتة الشاملة بالذكاء الاصطناعي (Omni AI Automation OS)',
        'الذكاء الاصطناعي والأتمتة الذكية (AI & Automation)',
        'ابتكار نظام متكامل لأتمتة المهام الرقمية والمكتبية (Word, Excel, PowerPoint)، أتمتة المواقع وتصفح الويب، جدولة المواعيد الذكية (Rendez-vous)، وتكامل واجهات الذكاء الاصطناعي (AI APIs) مع نظام اشتراكات ومدفوعات إلكترونية.',
        `تهدر المؤسسات والشركات والأفراد آلاف الساعات سنوياً في تنفيذ الأعمال الرقمية المتكررة: إنشاء وتنسيق مستندات Word، معالجة الجداول وتحليل بيانات Excel المعقدة، تصميم عروض PowerPoint التقديمية، تعبئة النماذج والتنقل في المواقع الإلكترونية، وجدولة المواعيد وتنسيق اللقاءات (Rendez-vous).

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
6. إرفاق ملف التوثيق والدراسة الكاملة (PDF / Word / PowerPoint / Excel) عبر خانة رفع الملفات.`,
        `• خطة واستراتيجية تسويق متكاملة للوصول إلى العملاء المستهدفين وتحقيق النمو.
• إبراز القيمة التنافسية لأتمتة مستندات Office (Word, Excel, PowerPoint) ووكيل الويب وجدولة المواعيد.
• معمارية آمنة تتيح لكل عميل استخدام مفاتيح الـ AI الخاصة به مع عزل كامل للبيانات.
• نظام مدفوعات وفواتير إلكترونية متكامل (بوابات الدفع، الاشتراكات الشهرية/السنوية، ونظام الرصيد).
• دراسة جدوى اقتصادية واستراتيجية شاملة مرفقة بملف توثيقي على المنصة.`,
        'الشركات والمؤسسات، مكاتب المحاسبة والاستشارات، العيادات والمراكز الخدمية، رواد الأعمال، المستقلون (Freelancers).',
        'جائزة المركز الأول: احتضان تقني للمشروع + دعم تمويلي لتطوير النموذج الأولي + اعتماد رسمي من لجنة التحكيم.',
        now
      ]);
      console.log('[Database] Seeded Competition 1 Challenge: Omni AI Automation OS');
    }
  } catch (err) {
    console.error('[Database Challenge Seed]', err.message);
  }

  // Ensure Competition 2 Placeholder (Theme Idea - Admin provides theme later) exists
  try {
    const existingComp2 = await all("SELECT id FROM challenges WHERE competition_type = 'theme_idea' LIMIT 1");
    if (!existingComp2 || existingComp2.length === 0) {
      const themeId = 'theme_comp2_tba';
      const now = new Date().toISOString();
      await run(`
        INSERT INTO challenges (
          id, competition_type, title, category, summary, problem_statement, expected_outcomes, target_sectors, reward_or_grant, is_active, is_open, created_at
        ) VALUES (?, 'theme_idea', ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
      `, [
        themeId,
        'محور المسابقة الثانية: سيتم الإعلان عن المحور الرسمي قريباً',
        'أمثلة مقترحة: الطبيعة والاستدامة (Nature) • سيتم تحديد المحور لاحقاً',
        'في هذه المسابقة تقوم الإدارة بطرح محور عام ومفتوح (مثل: الطبيعة والبيئة...)، ويتنافس المشاركون على ابتكار أفضل فكرة مشروع إبداعية تخدم هذا المحور مع دراسة الجدوى الأولية.',
        `⏳ لم يتم نشر المحور الرسمي بعد — ستقوم إدارة المسابقة (Admin) بتحديد المحور وإتاحة التقديم قريباً.

🌿 كيف ستعمل المسابقة الثانية عند فتح المحور:
1. تحدد الإدارة المحور الرئيسي للمسابقة (على سبيل المثال: الطبيعة والاستدامة، أو محور آخر تعلنه الإدارة).
2. يبتكر كل مشارك أو فريق أفضل فكرة مشروع أصلية تخدم هذا المحور.
3. يقدّم المشارك شرح الفكرة، الجمهور المستهدف، تحليل SWOT، والجدوى الأولية مع إرفاق ملف العرض التوضيحي (PDF / PPTX / DOCX).`,
        `• فكرة مشروع أصلية ومبتكرة مرتبطة مباشرة بمحور المسابقة المعلن.
• توضيح المشكلة التي تعالجها الفكرة والقيمة المضافة للمجتمع أو السوق.
• تحليل SWOT والجدوى المبدئية مع إرفاق مستند أو عرض تقديمي (PDF / PPTX / DOC).`,
        'مفتوح لجميع المبدعين، الفرق الطلابية، ورواد الأعمال.',
        'جائزة أفضل فكرة في المحور: احتضان وتطوير الفكرة + شهادة تميز واعتماد من لجنة التحكيم.',
        now
      ]);
      console.log('[Database] Seeded Competition 2 Placeholder Theme (TBA)');
    }
  } catch (err) {
    console.error('[Database Comp2 Seed]', err.message);
  }

  // Ensure default Admin exists if no admin exists
  try {
    const adminUser = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (!adminUser) {
      const { hashPassword } = require('./auth');
      const passHash = hashPassword('admin123456');
      const now = new Date().toISOString();
      await run(`
        INSERT INTO users (id, name, email, password_hash, role, organization, bio, is_approved, created_at)
        VALUES (?, ?, ?, ?, 'admin', 'MLIC Organizing Committee', 'المشرف العام على مسابقة MLIC CHALLENGE', 1, ?)
      `, ['user_admin_default', 'Admin MLIC', 'admin@mlic.com', passHash, now]);
      console.log('[Database] Default Admin created: admin@mlic.com / admin123456');
    }
  } catch (err) {
    console.error('[Database Admin Seed]', err.message);
  }
}

module.exports = {
  isPostgres,
  pgPool,
  sqliteDb,
  query,
  get,
  all,
  run,
  exec,
  initDatabase
};
