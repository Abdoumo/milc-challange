// MLIC CHALLENGE HTTP Server & REST API
// Production Server supporting PostgreSQL (via DATABASE_URL in .env) or embedded SQLite

require('./env');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');
const { hashPassword, verifyPassword, generateToken, verifyToken } = require('./auth');
const { seed } = require('./seed');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error('Payload too large (Max 25MB)'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function getAuthUser(req) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return verifyToken(token);
}

// Parse & deduplicate group members (case-insensitive) and optionally prepend leader
function parseGroupMembers(rawMembers, leaderName = '') {
  const list = [];
  if (Array.isArray(rawMembers)) {
    list.push(...rawMembers);
  } else if (typeof rawMembers === 'string') {
    list.push(...rawMembers.split(/[,،;؛\n]+/));
  }

  const seen = new Set();
  const result = [];
  const addUnique = (val) => {
    const clean = String(val || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  };

  if (leaderName) addUnique(leaderName);
  for (const item of list) addUnique(item);

  return {
    members: result,
    formatted: result.join('، '),
    count: result.length
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // -------------------------------------------------------------
    // API: Authentication
    // -------------------------------------------------------------
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const {
        name,
        email,
        password,
        role = 'participant',
        organization = '',
        group_name = '',
        group_members = '',
        bio = ''
      } = await parseBody(req);

      const cleanName = String(name || '').trim();
      const cleanEmail = String(email || '').toLowerCase().trim();
      if (!cleanName || !cleanEmail || !password) {
        return sendJSON(res, 400, { error: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة' });
      }

      const existing = await db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
      if (existing) {
        return sendJSON(res, 409, { error: 'يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل' });
      }

      const validRole = ['participant', 'lajna', 'admin'].includes(role) ? role : 'participant';

      let groupNameVal = '';
      let orgVal = String(organization || '').trim();
      let groupMembersVal = '';

      // Enforce multi-member Group registration (min 2 distinct members, open to anyone)
      if (validRole === 'participant') {
        groupNameVal = String(group_name || organization || '').trim();
        if (!groupNameVal) {
          return sendJSON(res, 400, { error: 'يرجى إدخال اسم المجموعة للتسجيل والمشاركة في المسابقة.' });
        }
        const parsedGroup = parseGroupMembers(group_members, cleanName);
        if (parsedGroup.count < 2) {
          return sendJSON(res, 400, {
            error: 'يشترط أن تتكون المجموعة من عضوين (2) على الأقل (القائد + عضو إضافي واحد مختلف على الأقل). المشاركة الفردية غير مسموحة.'
          });
        }
        orgVal = groupNameVal;
        groupMembersVal = parsedGroup.formatted;
      }

      const id = 'user_' + crypto.randomUUID().slice(0, 12);
      const passHash = hashPassword(password);

      // CRITICAL: Only Admin can approve Lajna members! Groups (participant) are auto-approved for anyone to sign up.
      const isApproved = validRole === 'lajna' ? 0 : 1;
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO users (id, name, email, password_hash, role, organization, group_name, group_members, bio, is_approved, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, cleanName, cleanEmail, passHash, validRole, orgVal, groupNameVal, groupMembersVal, bio, isApproved, now]);

      const user = {
        id,
        name: cleanName,
        email: cleanEmail,
        role: validRole,
        organization: orgVal,
        group_name: groupNameVal,
        group_members: groupMembersVal,
        is_approved: isApproved === 1
      };
      const token = generateToken(user);

      return sendJSON(res, 201, {
        message: validRole === 'lajna'
          ? 'تم إنشاء الحساب بنجاح! طلب عضويتك في لجنة التحكيم قيد اعتماد مدير المنصة (Admin).'
          : validRole === 'participant'
            ? `✓ تم تسجيل مجموعة "${groupNameVal}" بنجاح! يمكنك الآن المشاركة في المسابقة.`
            : '✓ تم إنشاء حساب المنظم بنجاح!',
        user,
        token
      });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = await parseBody(req);
      if (!email || !password) {
        return sendJSON(res, 400, { error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
      }

      const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJSON(res, 401, { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      }

      const isApproved = user.is_approved === 1 || user.is_approved === true || user.role !== 'lajna';

      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization || '',
        group_name: user.group_name || '',
        group_members: user.group_members || '',
        bio: user.bio,
        is_approved: isApproved
      };
      const token = generateToken(safeUser);

      return sendJSON(res, 200, {
        message: 'تم تسجيل الدخول بنجاح',
        user: safeUser,
        token
      });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        return sendJSON(res, 401, { error: 'Unauthorized or token expired' });
      }

      const user = await db.get(
        'SELECT id, name, email, role, organization, group_name, group_members, bio, is_approved, created_at FROM users WHERE id = ?',
        [authUser.id]
      );
      if (!user) {
        return sendJSON(res, 404, { error: 'User not found' });
      }

      const isApproved = user.is_approved === 1 || user.is_approved === true || user.role !== 'lajna';

      return sendJSON(res, 200, {
        user: {
          ...user,
          organization: user.organization || '',
          group_name: user.group_name || '',
          group_members: user.group_members || '',
          is_approved: isApproved
        }
      });
    }

    // -------------------------------------------------------------
    // API: Admin Lajna Approval Panel ("Only Admin can approve Lajna")
    // -------------------------------------------------------------
    if (pathname === '/api/admin/lajna-requests' && req.method === 'GET') {
      const authUser = getAuthUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return sendJSON(res, 403, { error: 'Access denied: Only Admin can view Lajna approval requests' });
      }

      const lajnaUsers = await db.all(`
        SELECT id, name, email, role, organization, bio, is_approved, created_at,
               (SELECT COUNT(*) FROM evaluations e WHERE e.judge_id = users.id) as evaluations_count
        FROM users
        WHERE role = 'lajna'
        ORDER BY is_approved ASC, created_at DESC
      `);

      const pendingCount = lajnaUsers.filter(u => !u.is_approved || u.is_approved === 0).length;

      return sendJSON(res, 200, {
        pending_count: pendingCount,
        lajna_users: lajnaUsers.map(u => ({
          ...u,
          is_approved: u.is_approved === 1 || u.is_approved === true
        }))
      });
    }

    if (pathname === '/api/admin/approve-lajna' && req.method === 'POST') {
      const authUser = getAuthUser(req);
      if (!authUser || authUser.role !== 'admin') {
        return sendJSON(res, 403, { error: 'Access denied: Only Admin can approve or revoke Lajna judges' });
      }

      const { user_id, approve = true } = await parseBody(req);
      if (!user_id) {
        return sendJSON(res, 400, { error: 'user_id is required' });
      }

      const targetUser = await db.get('SELECT id, name, role FROM users WHERE id = ?', [user_id]);
      if (!targetUser) {
        return sendJSON(res, 404, { error: 'User not found' });
      }

      const newStatus = approve ? 1 : 0;
      await db.run('UPDATE users SET is_approved = ? WHERE id = ?', [newStatus, user_id]);

      return sendJSON(res, 200, {
        message: approve
          ? `✓ تم اعتماد ${targetUser.name} كـ عضو رسمي في لجنة التحكيم بنجاح!`
          : `⏸️ تم تجميد صلاحية تحكيم ${targetUser.name}.`,
        user_id,
        is_approved: newStatus === 1
      });
    }

    // -------------------------------------------------------------
    // API: File / Document Upload ("they can post doc")
    // -------------------------------------------------------------
    if (pathname === '/api/upload-doc' && req.method === 'POST') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        return sendJSON(res, 401, { error: 'Sign in required to upload documents' });
      }

      const { filename, base64 } = await parseBody(req);
      if (!filename || !base64) {
        return sendJSON(res, 400, { error: 'Filename and base64 document content are required' });
      }

      const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 6)}_${cleanName}`;
      const savePath = path.join(UPLOADS_DIR, uniqueName);

      const pureBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
      const buffer = Buffer.from(pureBase64, 'base64');

      fs.writeFileSync(savePath, buffer);

      return sendJSON(res, 201, {
        message: 'Document uploaded successfully to database store',
        document_path: `/uploads/${uniqueName}`,
        document_name: filename,
        document_size: buffer.length
      });
    }

    // -------------------------------------------------------------
    // API: Challenges & Themes (Competition 1 Ideas & Competition 2 Themes)
    // -------------------------------------------------------------
    if (pathname === '/api/challenges' && req.method === 'GET') {
      const challenges = await db.all(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM submissions s WHERE s.challenge_id = c.id) as submission_count
        FROM challenges c
        WHERE c.is_active = 1
        ORDER BY c.competition_type ASC, c.created_at ASC
      `);

      return sendJSON(res, 200, { challenges });
    }

    if (pathname === '/api/challenges' && req.method === 'POST') {
      const authUser = getAuthUser(req);
      if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'lajna')) {
        return sendJSON(res, 403, { error: 'Only Organizer (Admin) or Lajna can add competition ideas or themes' });
      }

      const {
        competition_type = 'marketing_strategy',
        is_open = 1,
        title,
        category,
        summary,
        problem_statement,
        expected_outcomes,
        target_sectors,
        reward_or_grant
      } = await parseBody(req);

      if (!title || !problem_statement) {
        return sendJSON(res, 400, { error: 'Title and Description / Problem Statement are required' });
      }

      const validType = competition_type === 'theme_idea' ? 'theme_idea' : 'marketing_strategy';
      const openFlag = (is_open === 0 || is_open === false || is_open === '0') ? 0 : 1;
      const id = (validType === 'theme_idea' ? 'theme_' : 'challenge_') + crypto.randomUUID().slice(0, 8);
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO challenges (id, competition_type, title, category, summary, problem_statement, expected_outcomes, target_sectors, reward_or_grant, author_id, is_active, is_open, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        id,
        validType,
        title.trim(),
        category || (validType === 'theme_idea' ? 'Competition Theme' : 'Marketing Strategy'),
        summary || '',
        problem_statement,
        expected_outcomes || '',
        target_sectors || '',
        reward_or_grant || '',
        authUser.id,
        openFlag,
        now
      ]);

      return sendJSON(res, 201, {
        message: validType === 'theme_idea' ? 'Competition 2 Theme saved successfully' : 'Competition 1 Idea created successfully',
        id
      });
    }

    if (pathname.startsWith('/api/challenges/') && req.method === 'PUT') {
      const authUser = getAuthUser(req);
      if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'lajna')) {
        return sendJSON(res, 403, { error: 'Only Organizer (Admin) or Lajna can edit ideas or themes' });
      }

      const id = pathname.split('/')[3];
      const { competition_type, is_open, title, category, summary, problem_statement, expected_outcomes, reward_or_grant } = await parseBody(req);
      const validType = competition_type ? (competition_type === 'theme_idea' ? 'theme_idea' : 'marketing_strategy') : null;
      const openFlag = is_open === undefined || is_open === null ? null : ((is_open === 0 || is_open === false || is_open === '0') ? 0 : 1);

      await db.run(`
        UPDATE challenges
        SET competition_type = COALESCE(?, competition_type),
            is_open = COALESCE(?, is_open),
            title = COALESCE(?, title),
            category = COALESCE(?, category),
            summary = COALESCE(?, summary),
            problem_statement = COALESCE(?, problem_statement),
            expected_outcomes = COALESCE(?, expected_outcomes),
            reward_or_grant = COALESCE(?, reward_or_grant)
        WHERE id = ?
      `, [validType, openFlag, title, category, summary, problem_statement, expected_outcomes, reward_or_grant, id]);

      return sendJSON(res, 200, { message: 'Competition entry updated successfully' });
    }

    // -------------------------------------------------------------
    // API: Submissions (Confidential - Goes to DB, Lajna Only!)
    // -------------------------------------------------------------
    if (pathname === '/api/submissions' && req.method === 'GET') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        return sendJSON(res, 200, { submissions: [], message: 'Private database storage' });
      }

      let queryStr = `
        SELECT s.*, 
               c.title as challenge_title,
               c.category as challenge_category,
               c.competition_type as competition_type,
               c.is_open as challenge_is_open,
               COALESCE((SELECT AVG(total_score) FROM evaluations e WHERE e.submission_id = s.id), 0) as average_score,
               (SELECT COUNT(*) FROM evaluations e WHERE e.submission_id = s.id) as evaluations_count
        FROM submissions s
        JOIN challenges c ON s.challenge_id = c.id
      `;
      const params = [];

      const isApprovedLajna = authUser.role === 'lajna' && (authUser.is_approved === true || authUser.is_approved === 1);
      const isAdmin = authUser.role === 'admin';

      if (!isAdmin && !isApprovedLajna) {
        queryStr += ` WHERE s.user_id = ? `;
        params.push(authUser.id);
      }

      queryStr += ` ORDER BY s.created_at DESC `;

      const rawSubmissions = await db.all(queryStr, params);

      const submissions = rawSubmissions.map(sub => {
        return {
          ...sub,
          average_score: Math.round(Number(sub.average_score) * 10) / 10,
          target_audience: parseJSONSafe(sub.target_audience),
          swot: parseJSONSafe(sub.swot),
          feasibility: parseJSONSafe(sub.feasibility)
        };
      });

      return sendJSON(res, 200, {
        role: authUser.role,
        submissions
      });
    }

    if (pathname.startsWith('/api/submissions/') && req.method === 'GET') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        return sendJSON(res, 401, { error: 'Please sign in to view this submission' });
      }

      const id = pathname.split('/')[3];
      const sub = await db.get(`
        SELECT s.*, 
               c.title as challenge_title,
               c.category as challenge_category,
               c.competition_type as competition_type,
               c.is_open as challenge_is_open,
               COALESCE((SELECT AVG(total_score) FROM evaluations e WHERE e.submission_id = s.id), 0) as average_score,
               (SELECT COUNT(*) FROM evaluations e WHERE e.submission_id = s.id) as evaluations_count
        FROM submissions s
        JOIN challenges c ON s.challenge_id = c.id
        WHERE s.id = ?
      `, [id]);

      if (!sub) {
        return sendJSON(res, 404, { error: 'Submission not found in database' });
      }

      if (authUser.role === 'participant' && sub.user_id !== authUser.id) {
        return sendJSON(res, 403, { error: 'Access denied: Submissions are confidential to Lajna only' });
      }

      const evaluations = await db.all(`
        SELECT e.*, u.organization as judge_org
        FROM evaluations e
        LEFT JOIN users u ON e.judge_id = u.id
        WHERE e.submission_id = ?
        ORDER BY e.created_at DESC
      `, [id]);

      return sendJSON(res, 200, {
        submission: {
          ...sub,
          average_score: Math.round(Number(sub.average_score) * 10) / 10,
          target_audience: parseJSONSafe(sub.target_audience),
          swot: parseJSONSafe(sub.swot),
          feasibility: parseJSONSafe(sub.feasibility),
          evaluations
        }
      });
    }

    if (pathname === '/api/submissions' && req.method === 'POST') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        return sendJSON(res, 401, { error: 'يجب تسجيل الدخول بحساب مجموعة للمشاركة وتقديم الدراسة.' });
      }

      const dbUser = await db.get(
        'SELECT id, name, role, organization, group_name, group_members FROM users WHERE id = ?',
        [authUser.id]
      );
      if (!dbUser) {
        return sendJSON(res, 401, { error: 'الحساب غير موجود، يرجى تسجيل الدخول مجدداً.' });
      }
      if (dbUser.role === 'lajna') {
        return sendJSON(res, 403, { error: 'حسابات لجنة التحكيم مخصصة للتقييم فقط؛ للمشاركة يرجى التسجيل بحساب مجموعة (2+ أعضاء).' });
      }

      const body = await parseBody(req);
      const {
        challenge_id,
        title,
        pitch,
        team_name,
        team_members,
        target_audience,
        swot,
        feasibility,
        document_path = '',
        document_name = '',
        document_size = 0,
        status = 'submitted'
      } = body;

      if (!challenge_id || !title || !pitch) {
        return sendJSON(res, 400, { error: 'يرجى تحديد المسابقة وعنوان المشروع والملخص التنفيذي.' });
      }

      const finalTeamName = String(team_name || dbUser.group_name || '').trim();
      const rawMembersInput = String(team_members || '').trim() ? team_members : (dbUser.group_members || '');
      const parsedTeam = parseGroupMembers(rawMembersInput);

      if (!finalTeamName || parsedTeam.count < 2) {
        return sendJSON(res, 400, {
          error: 'المشاركة مخصصة للمجموعات المسجلة فقط: يجب إدخال اسم المجموعة وأسماء عضوين (2) مختلفين على الأقل.'
        });
      }

      // Sync group fields for pre-existing participant accounts that completed them on first submission
      if (dbUser.role === 'participant' && (!dbUser.group_name || !dbUser.group_members)) {
        await db.run(
          'UPDATE users SET group_name = ?, organization = ?, group_members = ? WHERE id = ?',
          [finalTeamName, finalTeamName, parsedTeam.formatted, dbUser.id]
        );
      }

      const targetChallenge = await db.get('SELECT id, competition_type, is_active, is_open FROM challenges WHERE id = ?', [challenge_id]);
      if (!targetChallenge || targetChallenge.is_active === 0) {
        return sendJSON(res, 404, { error: 'Selected competition track not found' });
      }
      if (targetChallenge.is_open === 0) {
        return sendJSON(res, 400, {
          error: 'هذا المحور بانتظار الإعلان الرسمي من الإدارة ولم يُفتح للتقديم بعد.'
        });
      }

      const id = 'sub_' + crypto.randomUUID().slice(0, 10);
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO submissions (
          id, challenge_id, user_id, author_name, title, pitch, team_name, team_members,
          target_audience, swot, feasibility, document_path, document_name, document_size,
          status, likes_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, [
        id,
        challenge_id,
        dbUser.id,
        dbUser.name,
        title.trim(),
        pitch.trim(),
        finalTeamName,
        parsedTeam.formatted,
        JSON.stringify(target_audience || {}),
        JSON.stringify(swot || {}),
        JSON.stringify(feasibility || {}),
        document_path || '',
        document_name || '',
        document_size || 0,
        status,
        now,
        now
      ]);

      return sendJSON(res, 201, {
        message: '🔒 تم إرسال وحفظ دراسة المجموعة بنجاح في قاعدة البيانات لتحكيم اللجنة!',
        id,
        document_name
      });
    }

    // -------------------------------------------------------------
    // API: Lajna (Jury) Evaluation & Scoring
    // -------------------------------------------------------------
    if (pathname === '/api/evaluations' && req.method === 'POST') {
      const authUser = getAuthUser(req);
      const isApprovedLajna = authUser && authUser.role === 'lajna' && (authUser.is_approved === true || authUser.is_approved === 1);
      const isAdmin = authUser && authUser.role === 'admin';

      if (!isAdmin && !isApprovedLajna) {
        return sendJSON(res, 403, {
          error: 'صلاحية غير مسموحة: حسابك كعضو لجنة تحكيم بانتظار اعتماد مدير المسابقة (Admin Approval Required).'
        });
      }

      const {
        submission_id,
        score_problem_audience = 0,
        score_swot = 0,
        score_feasibility_tech = 0,
        score_feasibility_financial = 0,
        score_innovation = 0,
        feedback = '',
        strengths_observed = '',
        recommendations = ''
      } = await parseBody(req);

      if (!submission_id) {
        return sendJSON(res, 400, { error: 'Submission ID is required' });
      }

      const sAudience = Math.min(20, Math.max(0, parseInt(score_problem_audience, 10) || 0));
      const sSwot = Math.min(20, Math.max(0, parseInt(score_swot, 10) || 0));
      const sTech = Math.min(25, Math.max(0, parseInt(score_feasibility_tech, 10) || 0));
      const sFinance = Math.min(25, Math.max(0, parseInt(score_feasibility_financial, 10) || 0));
      const sInnov = Math.min(10, Math.max(0, parseInt(score_innovation, 10) || 0));
      const totalScore = sAudience + sSwot + sTech + sFinance + sInnov;

      const existingEval = await db.get('SELECT id FROM evaluations WHERE submission_id = ? AND judge_id = ?', [submission_id, authUser.id]);
      const now = new Date().toISOString();

      if (existingEval) {
        await db.run(`
          UPDATE evaluations 
          SET score_problem_audience = ?,
              score_swot = ?,
              score_feasibility_tech = ?,
              score_feasibility_financial = ?,
              score_innovation = ?,
              total_score = ?,
              feedback = ?,
              strengths_observed = ?,
              recommendations = ?,
              created_at = ?
          WHERE id = ?
        `, [sAudience, sSwot, sTech, sFinance, sInnov, totalScore, feedback, strengths_observed, recommendations, now, existingEval.id]);
      } else {
        const id = 'eval_' + crypto.randomUUID().slice(0, 10);
        await db.run(`
          INSERT INTO evaluations (
            id, submission_id, judge_id, judge_name,
            score_problem_audience, score_swot, score_feasibility_tech, score_feasibility_financial, score_innovation,
            total_score, feedback, strengths_observed, recommendations, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, submission_id, authUser.id, authUser.name, sAudience, sSwot, sTech, sFinance, sInnov, totalScore, feedback, strengths_observed, recommendations, now]);
      }

      return sendJSON(res, 200, {
        message: 'Evaluation saved to database by Lajna',
        total_score: totalScore
      });
    }

    // -------------------------------------------------------------
    // API: Leaderboard & Winner Podium
    // -------------------------------------------------------------
    if (pathname === '/api/leaderboard' && req.method === 'GET') {
      const authUser = getAuthUser(req);
      const winnersSetting = await db.get('SELECT value FROM platform_settings WHERE key = ?', ['winners_announced']);
      const isAnnounced = winnersSetting ? winnersSetting.value === 'true' : false;

      const isApprovedLajnaOrAdmin = authUser && (authUser.role === 'admin' || (authUser.role === 'lajna' && (authUser.is_approved === true || authUser.is_approved === 1)));

      const leaderboard = await db.all(`
        SELECT s.id, s.title, s.pitch, s.team_name, s.author_name, s.status, s.document_path, s.document_name,
               c.title as challenge_title, c.category as challenge_category, c.competition_type as competition_type,
               ROUND(AVG(e.total_score), 1) as avg_score,
               COUNT(e.id) as evaluations_count,
               ROUND(AVG(e.score_problem_audience), 1) as avg_audience,
               ROUND(AVG(e.score_swot), 1) as avg_swot,
               ROUND(AVG(e.score_feasibility_tech), 1) as avg_tech,
               ROUND(AVG(e.score_feasibility_financial), 1) as avg_financial,
               ROUND(AVG(e.score_innovation), 1) as avg_innovation
        FROM submissions s
        JOIN challenges c ON s.challenge_id = c.id
        LEFT JOIN evaluations e ON e.submission_id = s.id
        GROUP BY s.id, c.title, c.category, c.competition_type
        ORDER BY avg_score DESC
      `);

      return sendJSON(res, 200, {
        winners_announced: isAnnounced,
        is_lajna: isApprovedLajnaOrAdmin,
        leaderboard: (isAnnounced || isApprovedLajnaOrAdmin) ? leaderboard : []
      });
    }

    if (pathname === '/api/admin/toggle-winners' && req.method === 'POST') {
      const authUser = getAuthUser(req);
      const isApprovedLajna = authUser && authUser.role === 'lajna' && (authUser.is_approved === true || authUser.is_approved === 1);
      const isAdmin = authUser && authUser.role === 'admin';

      if (!isAdmin && !isApprovedLajna) {
        return sendJSON(res, 403, { error: 'Only approved Lajna members or Admin can announce winners' });
      }

      const current = await db.get('SELECT value FROM platform_settings WHERE key = ?', ['winners_announced']);
      const nextVal = current && current.value === 'true' ? 'false' : 'true';

      if (db.isPostgres) {
        await db.run('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value', ['winners_announced', nextVal]);
      } else {
        await db.run('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?', ['winners_announced', nextVal, nextVal]);
      }

      return sendJSON(res, 200, { winners_announced: nextVal === 'true' });
    }

    // -------------------------------------------------------------
    // Static Files & Document Downloads Handling
    // -------------------------------------------------------------
    if (pathname.startsWith('/uploads/')) {
      const filename = path.basename(pathname);
      const docPath = path.join(UPLOADS_DIR, filename);

      if (!fs.existsSync(docPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Document not found');
      }

      const ext = path.extname(docPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`
      });
      return fs.createReadStream(docPath).pipe(res);
    }

    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Access Denied');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('File not found');
          }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, must-revalidate'
          });
          res.end(content);
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          return res.end('Server Error reading file');
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, must-revalidate'
        });
        res.end(content);
      });
    });

  } catch (error) {
    console.error('[Server Error]', error);
    sendJSON(res, 500, { error: 'Internal server error: ' + error.message });
  }
});

function parseJSONSafe(str) {
  if (typeof str !== 'string') return str || {};
  try {
    return JSON.parse(str);
  } catch (e) {
    return {};
  }
}

async function startServer() {
  try {
    await db.initDatabase();
  } catch (e) {
    console.error('[DB Init]', e);
  }

  server.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`🚀 MLIC CHALLENGE Production Server running at:`);
    console.log(`👉 http://${HOST}:${PORT}`);
    console.log(`👉 Accessible via IP: http://<YOUR_SERVER_IP>:${PORT}`);
    console.log(`👉 Engine: ${db.isPostgres ? 'PostgreSQL' : 'SQLite fallback (Set DATABASE_URL in .env for PostgreSQL)'}`);
    console.log(`👉 Confidential Submissions -> Direct to DB`);
    console.log(`👉 Attached Document Uploads -> /uploads/ Enabled`);
    console.log(`=======================================================`);
  });
}

startServer();
