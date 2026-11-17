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
        bio TEXT DEFAULT '',
        is_approved INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        summary TEXT NOT NULL,
        problem_statement TEXT NOT NULL,
        expected_outcomes TEXT NOT NULL,
        target_sectors TEXT NOT NULL,
        reward_or_grant TEXT DEFAULT '',
        author_id TEXT,
        is_active INTEGER DEFAULT 1,
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

  // Ensure Challenge #1 (Universal AI Automation OS) exists if no challenges
  try {
    const existingChallenges = await all('SELECT id FROM challenges LIMIT 1');
    if (!existingChallenges || existingChallenges.length === 0) {
      const challengeId = 'challenge_omni_ai_automation';
      const now = new Date().toISOString();
      await run(`
        INSERT INTO challenges (
          id, title, category, summary, problem_statement, expected_outcomes, target_sectors, reward_or_grant, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [
        challengeId,
        'منظومة الأتمتة الشاملة بالذكاء الاصطناعي (Omni AI Automation OS)',
        'الذكاء الاصطناعي والأتمتة الذكية (AI & Automation)',
        'ابتكار نظام متكامل لأتمتة المهام الرقمية والمكتبية (Word, Excel, PowerPoint)، أتمتة المواقع وتصفح الويب، جدولة المواعيد الذكية (Rendez-vous)، وتكامل واجهات الذكاء الاصطناعي (AI APIs) مع نظام اشتراكات ومدفوعات إلكترونية.',
        `تهدر المؤسسات والشركات والأفراد آلاف الساعات سنوياً في تنفيذ الأعمال الرقمية المتكررة: إنشاء وتنسيق مستندات Word، معالجة الجداول وتحليل بيانات Excel المعقدة، تصميم عروض PowerPoint التقديمية، تعبئة النماذج والتنقل في المواقع الإلكترونية، وجدولة المواعيد وتنسيق اللقاءات (Rendez-vous).

🎯 التحدي المطلوب من المشاركين:
تصميم وبناء دراسة متكاملة لمنظومة أتمتة ذاتية (Autonomous AI Automation OS) تعمل كـ "وكيل عمل ذكي شامل" يقوم بتنفيذ كافة هذه المهام، مع تمكين كل عميل من ربط مفاتيح الذكاء الاصطناعي الخاصة به (Bring-Your-Own-API Key / Multi-Tenant AI Integration) لضمان الخصوصية والتحكم في التكاليف، مع توفير نموذج ربحي ونظام مدفوعات متكامل (Payment System).

📋 المتطلبات الإلزامية في استمارة المشاركة:
1. دراسة الجمهور المستهدف (Target Audience): تحديد القطاعات والشرائح المستفيدة وتحليل احتياجاتهم (Pain Points) والقيمة المقدمة.
2. تحليل SWOT الرباعي: تحليل نقاط القوة، نقاط الضعف، الفرص السوقية، والتهديدات التقنية والتنافسية.
3. دراسة الجدوى الفنية (Technical Feasibility): المعمارية التقنية، محركات الأتمتة لمستندات Office ومواقع الويب، ومستوى الجاهزية (TRL).
4. دراسة الجدوى التشغيلية والتسويقية (Market & Operational Feasibility): قنوات التسويق والميزة التنافسية.
5. دراسة الجدوى المالية ونظام المدفوعات (Financial Feasibility & Payment System):
   - هيكل التكاليف (CAPEX & OPEX) والعائد على الاستثمار المتوقع (ROI).
   - نموذج التسعير والفوترة وبوابات الدفع الإلكترونية المقترحة (Stripe / Local Payment Gateways / نظام الاشتراكات ونظام الأرصدة Pay-Per-Task).
6. إرفاق ملف التوثيق والدراسة الكاملة (PDF / Word / PowerPoint / Excel) عبر خانة رفع الملفات.`,
        `• محرك ذكي لأتمتة مستندات Office (Word, Excel, PowerPoint) ببيانات ديناميكية دقيقة.
• وكيل ويب (Web Agent) قادر على أتمتة تصفح المواقع وجدولة المواعيد واللقاءات (Rendez-vous) تلقائياً.
• معمارية آمنة تتيح لكل عميل استخدام مفاتيح الـ AI الخاصة به مع عزل كامل للبيانات.
• نظام مدفوعات وفواتير إلكترونية متكامل (بوابات الدفع، الاشتراكات الشهرية/السنوية، ونظام الرصيد).
• دراسة جدوى اقتصادية وفنية شاملة مرفقة بملف توثيقي على المنصة.`,
        'الشركات والمؤسسات، مكاتب المحاسبة والاستشارات، العيادات والمراكز الخدمية، رواد الأعمال، المستقلون (Freelancers).',
        'جائزة المركز الأول: احتضان تقني للمشروع + دعم تمويلي لتطوير النموذج الأولي + اعتماد رسمي من لجنة التحكيم.',
        now
      ]);
      console.log('[Database] Seeded Challenge #1: Omni AI Automation OS');
    }
  } catch (err) {
    console.error('[Database Challenge Seed]', err.message);
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
