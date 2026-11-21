import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { db, hashPassword, verifyPassword } from './db.ts';
import {
  type AuthenticatedRequest,
  createRateLimiter,
  logAudit,
  requireAuth,
  requireRole,
  signAuthToken,
} from './auth.ts';
import {
  analyzeSubmissionWithGemini,
  chatAssistantWithGemini,
  generateInsightsWithGemini,
} from './geminiService.ts';
import { buildExportZipBuffer, getFlaskMysqlVercelFiles } from './exportBundle.ts';

export const apiRouter = Router();

const authLimiter = createRateLimiter(25, 60 * 1000);
const aiLimiter = createRateLimiter(20, 60 * 1000);

const QR_TOKEN_ALIASES: Record<string, string> = {
  'MSU-FALL26-CSE': 'SNU-SEM5-CSE',
  'MSU-FALL26-ALL': 'SNU-SEM5-CAMPUS',
};

function resolvePublicOrigin(req: Request): string {
  const forwardedHost =
    typeof req.headers['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host'].split(',')[0].trim()
      : '';
  const host = forwardedHost || req.get('host') || '';
  const forwardedProto =
    typeof req.headers['x-forwarded-proto'] === 'string'
      ? req.headers['x-forwarded-proto'].split(',')[0].trim()
      : '';
  const proto = forwardedProto || req.protocol || 'https';
  const isLocalHost = !host || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host);

  if (!isLocalHost) {
    return `${proto}://${host}`;
  }

  const envUrl =
    process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : '';
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }

  return host ? `${proto}://${host}` : 'http://localhost:3000';
}

function ensureSubmissionReceiptToken(submissionId: number, currentToken: unknown): string {
  if (typeof currentToken === 'string' && currentToken.trim().length >= 8) {
    return currentToken.trim();
  }
  const nextToken = `SNU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  db.prepare(`UPDATE feedback_submissions SET receipt_token = ? WHERE id = ?`).run(nextToken, submissionId);
  return nextToken;
}

const ENROLLMENT_FORMAT_REGEX = /^\d{2}SUU[A-Z]{2,6}\d{3}$/;
const DEPT_PROGRAM_INFIX: Record<string, string> = {
  CSE: 'BECS',
  ISE: 'BEIS',
  AIML: 'BEAI',
  DS: 'BEDS',
  ECE: 'BEEC',
  EEE: 'BEEE',
  MECH: 'BEME',
  CIVIL: 'BECV',
  MGMT: 'MBTM',
};

function resolveProgramInfix(deptCode?: string): string {
  const clean = (deptCode || 'CSE').trim().toUpperCase();
  if (DEPT_PROGRAM_INFIX[clean]) return DEPT_PROGRAM_INFIX[clean];
  return `BE${clean.slice(0, 2).padEnd(2, 'X')}`;
}

function generateEnrollmentNumber(deptCode: string, batchYear: number): string {
  const yy = String(batchYear).slice(-2).padStart(2, '0');
  const infix = resolveProgramInfix(deptCode);
  const prefix = `${yy}SUU${infix}`;
  const existingRows = db
    .prepare(`SELECT roll_number FROM students WHERE roll_number LIKE ?`)
    .all(`${prefix}%`) as Array<{ roll_number: string }>;
  const used = new Set(existingRows.map((r) => r.roll_number));
  for (let seq = 1; seq <= 999; seq++) {
    const candidate = `${prefix}${String(seq).padStart(3, '0')}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${prefix}${String(Date.now()).slice(-3)}`;
}

function buildStudentEightSemesterTracking(
  studentId: number,
  departmentId: number,
  enrolledSemOrder: number
) {
  const semesters = db
    .prepare(
      `SELECT s.id, s.name, s.term_order, s.start_date, s.end_date, s.is_current,
              ay.label AS academic_year_label
       FROM semesters s
       JOIN academic_years ay ON ay.id = s.academic_year_id
       ORDER BY s.term_order ASC`
    )
    .all() as Array<{
    id: number;
    name: string;
    term_order: number;
    start_date: string;
    end_date: string;
    is_current: number;
    academic_year_label: string;
  }>;

  const subCountsBySem = db
    .prepare(
      `SELECT semester_id, COUNT(*) AS dept_subjects
       FROM subjects
       WHERE department_id = ?
       GROUP BY semester_id`
    )
    .all(departmentId) as Array<{ semester_id: number; dept_subjects: number }>;
  const subCountMap = new Map(subCountsBySem.map((r) => [r.semester_id, r.dept_subjects]));

  const stuActivityBySem = db
    .prepare(
      `SELECT sub.semester_id AS semester_id,
              COUNT(DISTINCT CASE WHEN fs.status = 'submitted' THEN fs.id END) AS submitted_count,
              COUNT(DISTINCT CASE WHEN fs.status = 'draft' THEN fs.id END) AS draft_count,
              ROUND(AVG(CASE WHEN fs.status = 'submitted' THEN r.overall_satisfaction END), 2) AS avg_satisfaction
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.student_id = ?
       GROUP BY sub.semester_id`
    )
    .all(studentId) as Array<{
    semester_id: number;
    submitted_count: number;
    draft_count: number;
    avg_satisfaction: number | null;
  }>;
  const activityMap = new Map(stuActivityBySem.map((r) => [r.semester_id, r]));

  return semesters.map((sem) => {
    const act = activityMap.get(sem.id);
    const submittedCount = act?.submitted_count ?? 0;
    const draftCount = act?.draft_count ?? 0;
    const deptSubjects = subCountMap.get(sem.id) ?? 0;
    const isEnrolled = sem.term_order === enrolledSemOrder;

    let status: 'Completed' | 'Current' | 'Upcoming' = 'Upcoming';
    if (sem.term_order < enrolledSemOrder) {
      status = 'Completed';
    } else if (isEnrolled) {
      status = 'Current';
    } else if (submittedCount > 0) {
      status = 'Completed';
    }

    return {
      semester_id: sem.id,
      semester_name: sem.name,
      term_order: sem.term_order,
      academic_year_label: sem.academic_year_label,
      start_date: sem.start_date,
      end_date: sem.end_date,
      is_enrolled_semester: isEnrolled,
      department_subjects: deptSubjects,
      submitted_count: submittedCount,
      draft_count: draftCount,
      avg_satisfaction: act?.avg_satisfaction ?? null,
      status,
    };
  });
}

function buildDepartmentEightSemesterTracking() {
  const semesters = db
    .prepare(
      `SELECT s.id, s.name, s.term_order, ay.label AS academic_year_label, s.is_current
       FROM semesters s
       JOIN academic_years ay ON ay.id = s.academic_year_id
       ORDER BY s.term_order ASC`
    )
    .all() as Array<{
    id: number;
    name: string;
    term_order: number;
    academic_year_label: string;
    is_current: number;
  }>;

  const departments = db
    .prepare('SELECT id, code, name, head_name FROM departments ORDER BY name ASC')
    .all() as Array<{ id: number; code: string; name: string; head_name: string }>;

  const studentCounts = db
    .prepare(
      `SELECT department_id, semester_id, COUNT(*) AS enrolled_students
       FROM students
       GROUP BY department_id, semester_id`
    )
    .all() as Array<{ department_id: number; semester_id: number; enrolled_students: number }>;

  const subjectCounts = db
    .prepare(
      `SELECT department_id, semester_id, COUNT(*) AS subjects_count
       FROM subjects
       GROUP BY department_id, semester_id`
    )
    .all() as Array<{ department_id: number; semester_id: number; subjects_count: number }>;

  const submissionStats = db
    .prepare(
      `SELECT sub.department_id, sub.semester_id,
              COUNT(DISTINCT fs.id) AS submitted_feedbacks,
              ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.status = 'submitted'
       GROUP BY sub.department_id, sub.semester_id`
    )
    .all() as Array<{
    department_id: number;
    semester_id: number;
    submitted_feedbacks: number;
    avg_satisfaction: number | null;
  }>;

  const stuMap = new Map(studentCounts.map((r) => [`${r.department_id}:${r.semester_id}`, r.enrolled_students]));
  const subMap = new Map(subjectCounts.map((r) => [`${r.department_id}:${r.semester_id}`, r.subjects_count]));
  const fbMap = new Map(
    submissionStats.map((r) => [
      `${r.department_id}:${r.semester_id}`,
      { submitted_feedbacks: r.submitted_feedbacks, avg_satisfaction: r.avg_satisfaction },
    ])
  );

  const deptRows = departments.map((dept) => {
    let totalStudents = 0;
    let totalSubjects = 0;
    let totalSubmissions = 0;

    const semesterCells = semesters.map((sem) => {
      const key = `${dept.id}:${sem.id}`;
      const enrolled_students = stuMap.get(key) ?? 0;
      const subjects_count = subMap.get(key) ?? 0;
      const fb = fbMap.get(key);
      const submitted_feedbacks = fb?.submitted_feedbacks ?? 0;
      const avg_satisfaction = fb?.avg_satisfaction ?? null;

      totalStudents += enrolled_students;
      totalSubjects += subjects_count;
      totalSubmissions += submitted_feedbacks;

      return {
        semester_id: sem.id,
        semester_name: sem.name,
        term_order: sem.term_order,
        enrolled_students,
        subjects_count,
        submitted_feedbacks,
        avg_satisfaction,
      };
    });

    return {
      department_id: dept.id,
      department_code: dept.code,
      department_name: dept.name,
      head_name: dept.head_name,
      program_prefix: `24SUU${resolveProgramInfix(dept.code)}`,
      total_students: totalStudents,
      total_subjects: totalSubjects,
      total_submissions: totalSubmissions,
      semesters: semesterCells,
    };
  });

  return { semesters, departments: deptRows };
}

interface FilterParams {
  departmentId?: number;
  courseId?: number;
  facultyId?: number;
  subjectId?: number;
  academicYearId?: number;
  semesterId?: number;
  startDate?: string;
  endDate?: string;
}

function parseFilters(query: Record<string, unknown>): FilterParams {
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const toStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    departmentId: toNum(query.departmentId),
    courseId: toNum(query.courseId),
    facultyId: toNum(query.facultyId),
    subjectId: toNum(query.subjectId),
    academicYearId: toNum(query.academicYearId),
    semesterId: toNum(query.semesterId),
    startDate: toStr(query.startDate),
    endDate: toStr(query.endDate),
  };
}

function buildSubmissionWhereClause(filters: FilterParams): { sql: string; params: unknown[] } {
  const clauses: string[] = ["fs.status = 'submitted'"];
  const params: unknown[] = [];

  if (filters.departmentId) {
    clauses.push('sub.department_id = ?');
    params.push(filters.departmentId);
  }
  if (filters.courseId) {
    clauses.push('sub.course_id = ?');
    params.push(filters.courseId);
  }
  if (filters.facultyId) {
    clauses.push('fs.faculty_id = ?');
    params.push(filters.facultyId);
  }
  if (filters.subjectId) {
    clauses.push('fs.subject_id = ?');
    params.push(filters.subjectId);
  }
  if (filters.academicYearId) {
    clauses.push('ff.academic_year_id = ?');
    params.push(filters.academicYearId);
  }
  if (filters.semesterId) {
    clauses.push('ff.semester_id = ?');
    params.push(filters.semesterId);
  }
  if (filters.startDate) {
    clauses.push('date(fs.submitted_at) >= date(?)');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push('date(fs.submitted_at) <= date(?)');
    params.push(filters.endDate);
  }

  return { sql: clauses.join(' AND '), params };
}

// ---------------------------------------------------------------------------
// HEALTH & PUBLIC CATALOG
// ---------------------------------------------------------------------------
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Sapthagiri NPS University Feedback API' });
});

apiRouter.get('/catalog', (_req, res) => {
  const departments = db.prepare('SELECT id, code, name, head_name FROM departments ORDER BY name').all();
  const academicYears = db.prepare('SELECT id, label, start_date, end_date, is_current FROM academic_years ORDER BY id DESC').all();
  const semesters = db
    .prepare(
      `SELECT s.id, s.academic_year_id, ay.label AS academic_year_label, s.name, s.term_order, s.start_date, s.end_date, s.is_current
       FROM semesters s JOIN academic_years ay ON ay.id = s.academic_year_id ORDER BY s.term_order ASC`
    )
    .all();
  const courses = db
    .prepare(
      `SELECT c.id, c.department_id, d.name AS department_name, c.code, c.name, c.degree_level, c.duration_years
       FROM courses c JOIN departments d ON d.id = c.department_id ORDER BY c.name`
    )
    .all();
  const subjects = db
    .prepare(
      `SELECT sub.id, sub.department_id, d.name AS department_name, sub.course_id, c.code AS course_code, c.name AS course_name,
              sub.semester_id, sem.name AS semester_name, sub.faculty_id, u.full_name AS faculty_name,
              sub.code, sub.short_code, sub.elective_group, sub.name, sub.credits
       FROM subjects sub
       JOIN departments d ON d.id = sub.department_id
       JOIN courses c ON c.id = sub.course_id
       JOIN semesters sem ON sem.id = sub.semester_id
       LEFT JOIN faculty f ON f.id = sub.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY sem.term_order ASC, sub.code ASC`
    )
    .all();
  const teachers = db
    .prepare(
      `SELECT f.id, u.full_name, f.department_id, d.name AS department_name, f.employee_code, f.designation, f.specialization
       FROM faculty f JOIN users u ON u.id = f.user_id JOIN departments d ON d.id = f.department_id
       ORDER BY u.full_name`
    )
    .all();

  res.json({ departments, academicYears, semesters, courses, subjects, teachers });
});

apiRouter.get('/public/landing-stats', (_req, res) => {
  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM feedback_submissions WHERE status = 'submitted') AS totalSubmissions,
         (SELECT ROUND(AVG(overall_satisfaction), 2) FROM feedback_ratings r JOIN feedback_submissions s ON s.id = r.submission_id WHERE s.status = 'submitted') AS avgSatisfaction,
         (SELECT COUNT(*) FROM departments) AS totalDepartments,
         (SELECT COUNT(*) FROM feedback_forms WHERE is_active = 1) AS activeCampaigns,
         (SELECT COUNT(*) FROM subjects) AS totalSubjects`
    )
    .get();
  res.json(stats);
});

// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------
apiRouter.post('/auth/register', authLimiter, (req, res) => {
  const {
    email,
    password,
    full_name,
    department_id,
    course_id,
    semester_id,
    batch_year,
    roll_number,
    preferred_language,
  } = req.body ?? {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanName = typeof full_name === 'string' ? full_name.trim() : '';
  const cleanPass = typeof password === 'string' ? password : '';
  const cleanRoll = typeof roll_number === 'string' ? roll_number.trim().toUpperCase() : '';
  const lang = ['en', 'hi', 'kn', 'te'].includes(preferred_language) ? preferred_language : 'en';

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Please provide a valid university email address.' });
    return;
  }
  if (!cleanName || cleanName.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (cleanPass.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  if (cleanRoll && !ENROLLMENT_FORMAT_REGEX.test(cleanRoll)) {
    res.status(400).json({
      error:
        'Enrollment number must match the 24SUUBECS001 format (2-digit year + SUU + program code + 3-digit roll, e.g. 24SUUBECS104).',
    });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const deptId = Number(department_id) || 1;
  const deptRow = db.prepare('SELECT id, code FROM departments WHERE id = ?').get(deptId) as
    | { id: number; code: string }
    | undefined;
  if (!deptRow) {
    res.status(400).json({ error: 'Selected department does not exist.' });
    return;
  }

  const requestedCourseId = Number(course_id) || 0;
  const courseRow = (requestedCourseId
    ? db.prepare('SELECT id FROM courses WHERE id = ?').get(requestedCourseId)
    : db.prepare('SELECT id FROM courses WHERE department_id = ? ORDER BY id ASC LIMIT 1').get(deptRow.id)) as
    | { id: number }
    | undefined;
  if (!courseRow) {
    res.status(400).json({ error: 'Selected course/program does not exist.' });
    return;
  }

  const requestedSemId = Number(semester_id) || 0;
  const semRow = (requestedSemId
    ? db.prepare('SELECT id, academic_year_id FROM semesters WHERE id = ?').get(requestedSemId)
    : db.prepare('SELECT id, academic_year_id FROM semesters WHERE is_current = 1 LIMIT 1').get()) as
    | { id: number; academic_year_id: number }
    | undefined;
  if (!semRow) {
    res.status(400).json({ error: 'Selected semester (1–8) does not exist.' });
    return;
  }

  const parsedBatch = Number(batch_year) || 2024;
  if (!Number.isInteger(parsedBatch) || parsedBatch < 2020 || parsedBatch > 2030) {
    res.status(400).json({ error: 'Batch year must be between 2020 and 2030.' });
    return;
  }

  const generatedRoll = cleanRoll || generateEnrollmentNumber(deptRow.code, parsedBatch);

  const rollConflict = db.prepare('SELECT id FROM students WHERE roll_number = ?').get(generatedRoll);
  if (rollConflict) {
    res.status(409).json({ error: `Enrollment number ${generatedRoll} is already registered.` });
    return;
  }

  const pwHash = hashPassword(cleanPass);

  const tx = db.transaction(() => {
    const uRes = db
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, role, preferred_language) VALUES (?, ?, ?, 'student', ?)`
      )
      .run(cleanEmail, pwHash, cleanName, lang);
    const userId = Number(uRes.lastInsertRowid);

    db.prepare(
      `INSERT INTO students (user_id, department_id, course_id, academic_year_id, semester_id, roll_number, batch_year)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, deptRow.id, courseRow.id, semRow.academic_year_id, semRow.id, generatedRoll, parsedBatch);

    return userId;
  });

  const userId = tx();
  logAudit({
    userId,
    userEmail: cleanEmail,
    userRole: 'student',
    action: 'STUDENT_REGISTERED',
    entityType: 'users',
    entityId: userId,
    details: { roll_number: generatedRoll, semester_id: semRow.id, department_id: deptRow.id },
    ipAddress: req.ip,
  });

  const token = signAuthToken({ sub: userId, email: cleanEmail, role: 'student', name: cleanName });
  res.status(201).json({
    token,
    user: { id: userId, email: cleanEmail, full_name: cleanName, role: 'student', preferred_language: lang },
    studentProfile: {
      roll_number: generatedRoll,
      department_id: deptRow.id,
      course_id: courseRow.id,
      semester_id: semRow.id,
      batch_year: parsedBatch,
    },
  });
});

apiRouter.post('/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanPass = typeof password === 'string' ? password : '';

  if (!cleanEmail || !cleanPass) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db
    .prepare(
      `SELECT id, email, password_hash, full_name, role, preferred_language, phone, is_active FROM users WHERE email = ?`
    )
    .get(cleanEmail) as
    | {
        id: number;
        email: string;
        password_hash: string;
        full_name: string;
        role: 'student' | 'faculty' | 'admin';
        preferred_language: string;
        phone: string | null;
        is_active: number;
      }
    | undefined;

  if (!user || !verifyPassword(cleanPass, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  if (user.is_active !== 1) {
    res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
    return;
  }

  const token = signAuthToken({ sub: user.id, email: user.email, role: user.role, name: user.full_name });
  logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'users',
    entityId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      preferred_language: user.preferred_language,
      phone: user.phone,
    },
  });
});

apiRouter.post('/auth/demo-login', authLimiter, (req, res) => {
  const { role } = req.body ?? {};
  const demoEmails: Record<string, string> = {
    student: 'student@meridian.edu',
    faculty: 'faculty@meridian.edu',
    admin: 'admin@meridian.edu',
  };
  const targetEmail = demoEmails[String(role)];
  if (!targetEmail) {
    res.status(400).json({ error: 'Invalid demo role selected.' });
    return;
  }

  const user = db
    .prepare(`SELECT id, email, full_name, role, preferred_language, phone, is_active FROM users WHERE email = ?`)
    .get(targetEmail) as
    | {
        id: number;
        email: string;
        full_name: string;
        role: 'student' | 'faculty' | 'admin';
        preferred_language: string;
        phone: string | null;
        is_active: number;
      }
    | undefined;

  if (!user || user.is_active !== 1) {
    res.status(404).json({ error: 'Demo account unavailable.' });
    return;
  }

  const token = signAuthToken({ sub: user.id, email: user.email, role: user.role, name: user.full_name });
  logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'DEMO_LOGIN',
    entityType: 'users',
    entityId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      preferred_language: user.preferred_language,
      phone: user.phone,
    },
  });
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  logAudit({
    userId: req.user?.sub,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    action: 'USER_LOGOUT',
    entityType: 'users',
    entityId: req.user?.sub,
    ipAddress: req.ip,
  });
  res.json({ message: 'Signed out cleanly.' });
});

apiRouter.get('/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db
    .prepare(`SELECT id, email, full_name, role, preferred_language, phone, created_at FROM users WHERE id = ?`)
    .get(req.user!.sub);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  let roleProfile: unknown = null;
  if (req.user!.role === 'student') {
    roleProfile = db
      .prepare(
        `SELECT s.*, d.name AS department_name, c.name AS course_name, sem.name AS semester_name, ay.label AS academic_year_label
         FROM students s
         JOIN departments d ON d.id = s.department_id
         JOIN courses c ON c.id = s.course_id
         JOIN semesters sem ON sem.id = s.semester_id
         JOIN academic_years ay ON ay.id = s.academic_year_id
         WHERE s.user_id = ?`
      )
      .get(req.user!.sub);
  } else if (req.user!.role === 'faculty') {
    roleProfile = db
      .prepare(
        `SELECT f.*, d.name AS department_name
         FROM faculty f JOIN departments d ON d.id = f.department_id
         WHERE f.user_id = ?`
      )
      .get(req.user!.sub);
  }
  res.json({ user, roleProfile });
});

apiRouter.put('/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { full_name, phone, preferred_language, new_password } = req.body ?? {};
  const cleanName = typeof full_name === 'string' && full_name.trim().length >= 2 ? full_name.trim() : null;
  const lang = ['en', 'hi', 'kn', 'te'].includes(preferred_language) ? preferred_language : null;

  if (cleanName) {
    db.prepare(`UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?`).run(
      cleanName,
      req.user!.sub
    );
  }
  if (typeof phone === 'string') {
    db.prepare(`UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`).run(
      phone.trim(),
      req.user!.sub
    );
  }
  if (lang) {
    db.prepare(`UPDATE users SET preferred_language = ?, updated_at = datetime('now') WHERE id = ?`).run(
      lang,
      req.user!.sub
    );
  }
  if (typeof new_password === 'string' && new_password.length > 0) {
    if (new_password.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      hashPassword(new_password),
      req.user!.sub
    );
  }

  const updated = db
    .prepare(`SELECT id, email, full_name, role, preferred_language, phone FROM users WHERE id = ?`)
    .get(req.user!.sub);
  res.json({ user: updated });
});

// ---------------------------------------------------------------------------
// STUDENT ENDPOINTS
// ---------------------------------------------------------------------------
apiRouter.get('/students', requireAuth, requireRole('admin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? `%${req.query.search.trim()}%` : '%';
  const rows = db
    .prepare(
      `SELECT s.id, u.id AS user_id, u.full_name, u.email, u.is_active, s.roll_number, s.batch_year,
              s.department_id, s.course_id, s.semester_id,
              d.code AS department_code, d.name AS department_name, c.code AS course_code, c.name AS course_name,
              sem.name AS semester_name, sem.term_order,
              (SELECT COUNT(*) FROM feedback_submissions fs WHERE fs.student_id = s.id AND fs.status = 'submitted') AS submissions_count
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN departments d ON d.id = s.department_id
       JOIN courses c ON c.id = s.course_id
       JOIN semesters sem ON sem.id = s.semester_id
       WHERE u.full_name LIKE ? OR u.email LIKE ? OR s.roll_number LIKE ?
       ORDER BY s.id DESC`
    )
    .all(search, search, search);
  res.json({ students: rows });
});

function loadStudentProfileRecord(userId: number) {
  return db
    .prepare(
      `SELECT s.*, u.email, u.full_name, u.preferred_language, u.phone,
              d.code AS department_code, d.name AS department_name,
              c.code AS course_code, c.name AS course_name,
              sem.name AS semester_name, sem.term_order,
              ay.label AS academic_year_label
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN departments d ON d.id = s.department_id
       JOIN courses c ON c.id = s.course_id
       JOIN semesters sem ON sem.id = s.semester_id
       JOIN academic_years ay ON ay.id = s.academic_year_id
       WHERE s.user_id = ?`
    )
    .get(userId) as
    | {
        id: number;
        user_id: number;
        department_id: number;
        course_id: number;
        academic_year_id: number;
        semester_id: number;
        roll_number: string;
        batch_year: number;
        email: string;
        full_name: string;
        preferred_language: string;
        phone: string | null;
        department_code: string;
        department_name: string;
        course_code: string;
        course_name: string;
        semester_name: string;
        term_order: number;
        academic_year_label: string;
      }
    | undefined;
}

apiRouter.get('/students/profile', requireAuth, requireRole('student'), (req: AuthenticatedRequest, res) => {
  const row = loadStudentProfileRecord(req.user!.sub);
  if (!row) {
    res.status(404).json({ error: 'Student profile not found.' });
    return;
  }
  const eightSemesterTracking = buildStudentEightSemesterTracking(row.id, row.department_id, row.term_order);
  res.json({ profile: row, eightSemesterTracking });
});

apiRouter.put('/students/profile', requireAuth, requireRole('student'), (req: AuthenticatedRequest, res) => {
  const {
    roll_number,
    department_id,
    course_id,
    semester_id,
    batch_year,
    full_name,
    phone,
    preferred_language,
    new_password,
  } = req.body ?? {};

  const currentStudent = db
    .prepare('SELECT id, department_id, course_id, semester_id, academic_year_id, roll_number, batch_year FROM students WHERE user_id = ?')
    .get(req.user!.sub) as
    | {
        id: number;
        department_id: number;
        course_id: number;
        semester_id: number;
        academic_year_id: number;
        roll_number: string;
        batch_year: number;
      }
    | undefined;

  if (!currentStudent) {
    res.status(404).json({ error: 'Student enrollment record not found.' });
    return;
  }

  let nextRoll = currentStudent.roll_number;
  if (typeof roll_number === 'string' && roll_number.trim().length > 0) {
    const normalized = roll_number.trim().toUpperCase();
    if (!ENROLLMENT_FORMAT_REGEX.test(normalized)) {
      res.status(400).json({
        error:
          'Enrollment number must match the 24SUUBECS001 format (2-digit year + SUU + program code + 3-digit roll).',
      });
      return;
    }
    const conflict = db
      .prepare('SELECT id FROM students WHERE roll_number = ? AND id != ?')
      .get(normalized, currentStudent.id);
    if (conflict) {
      res.status(409).json({ error: `Enrollment number ${normalized} is already assigned to another student.` });
      return;
    }
    nextRoll = normalized;
  }

  let nextDeptId = currentStudent.department_id;
  if (Number(department_id) > 0) {
    const dRow = db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(department_id)) as
      | { id: number }
      | undefined;
    if (!dRow) {
      res.status(400).json({ error: 'Selected department does not exist.' });
      return;
    }
    nextDeptId = dRow.id;
  }

  let nextCourseId = currentStudent.course_id;
  if (Number(course_id) > 0) {
    const cRow = db.prepare('SELECT id FROM courses WHERE id = ?').get(Number(course_id)) as
      | { id: number }
      | undefined;
    if (!cRow) {
      res.status(400).json({ error: 'Selected course/program does not exist.' });
      return;
    }
    nextCourseId = cRow.id;
  }

  let nextSemId = currentStudent.semester_id;
  let nextAyId = currentStudent.academic_year_id;
  if (Number(semester_id) > 0) {
    const sRow = db.prepare('SELECT id, academic_year_id FROM semesters WHERE id = ?').get(Number(semester_id)) as
      | { id: number; academic_year_id: number }
      | undefined;
    if (!sRow) {
      res.status(400).json({ error: 'Selected semester does not exist.' });
      return;
    }
    nextSemId = sRow.id;
    nextAyId = sRow.academic_year_id;
  }

  let nextBatch = currentStudent.batch_year;
  if (batch_year !== undefined && batch_year !== null && batch_year !== '') {
    const parsedBatch = Number(batch_year);
    if (!Number.isInteger(parsedBatch) || parsedBatch < 2020 || parsedBatch > 2030) {
      res.status(400).json({ error: 'Batch year must be between 2020 and 2030.' });
      return;
    }
    nextBatch = parsedBatch;
  }

  if (typeof new_password === 'string' && new_password.length > 0 && new_password.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const tx = db.transaction(() => {
    if (typeof full_name === 'string' && full_name.trim().length >= 2) {
      db.prepare(`UPDATE users SET full_name = ?, updated_at = datetime('now') WHERE id = ?`).run(
        full_name.trim(),
        req.user!.sub
      );
    }
    if (typeof phone === 'string') {
      db.prepare(`UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`).run(
        phone.trim(),
        req.user!.sub
      );
    }
    if (['en', 'hi', 'kn', 'te'].includes(preferred_language)) {
      db.prepare(`UPDATE users SET preferred_language = ?, updated_at = datetime('now') WHERE id = ?`).run(
        preferred_language,
        req.user!.sub
      );
    }
    if (typeof new_password === 'string' && new_password.length >= 8) {
      db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
        hashPassword(new_password),
        req.user!.sub
      );
    }

    db.prepare(
      `UPDATE students
       SET roll_number = ?, department_id = ?, course_id = ?, semester_id = ?, academic_year_id = ?, batch_year = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(nextRoll, nextDeptId, nextCourseId, nextSemId, nextAyId, nextBatch, req.user!.sub);
  });

  tx();

  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'student',
    action: 'STUDENT_PROFILE_UPDATED',
    entityType: 'students',
    entityId: currentStudent.id,
    details: { roll_number: nextRoll, department_id: nextDeptId, course_id: nextCourseId, semester_id: nextSemId },
    ipAddress: req.ip,
  });

  const updatedUser = db
    .prepare(`SELECT id, email, full_name, role, preferred_language, phone FROM users WHERE id = ?`)
    .get(req.user!.sub);
  const updatedProfile = loadStudentProfileRecord(req.user!.sub)!;
  const eightSemesterTracking = buildStudentEightSemesterTracking(
    updatedProfile.id,
    updatedProfile.department_id,
    updatedProfile.term_order
  );

  res.json({
    message: 'Student profile updated.',
    user: updatedUser,
    profile: updatedProfile,
    eightSemesterTracking,
  });
});

apiRouter.get('/students/dashboard', requireAuth, requireRole('student', 'admin'), (req: AuthenticatedRequest, res) => {
  const student = db
    .prepare(
      `SELECT s.*, d.code AS department_code, d.name AS department_name, c.code AS course_code, c.name AS course_name,
              sem.name AS semester_name, sem.term_order AS semester_term_order, ay.label AS academic_year_label
       FROM students s
       JOIN departments d ON d.id = s.department_id
       JOIN courses c ON c.id = s.course_id
       JOIN semesters sem ON sem.id = s.semester_id
       JOIN academic_years ay ON ay.id = s.academic_year_id
       WHERE s.user_id = ?`
    )
    .get(req.user!.sub) as {
      id: number;
      department_id: number;
      course_id: number;
      department_code: string;
      department_name: string;
      course_code: string;
      course_name: string;
      semester_name: string;
      semester_term_order: number;
      academic_year_label: string;
      roll_number: string;
      batch_year: number;
    } | undefined;

  const activeForms = db
    .prepare(
      `SELECT ff.*, ay.label AS academic_year_label, sem.name AS semester_name, d.name AS department_name
       FROM feedback_forms ff
       JOIN academic_years ay ON ay.id = ff.academic_year_id
       JOIN semesters sem ON sem.id = ff.semester_id
       LEFT JOIN departments d ON d.id = ff.department_id
       WHERE ff.is_active = 1
       ORDER BY ff.close_date ASC`
    )
    .all() as Array<{ id: number; department_id: number | null; title: string; close_date: string }>;

  const mySubmissions = student
    ? (db
        .prepare(
          `SELECT fs.id, fs.form_id, fs.subject_id, fs.status, fs.is_anonymous, fs.submitted_at,
                  sub.name AS subject_name, sub.code AS subject_code
           FROM feedback_submissions fs
           JOIN subjects sub ON sub.id = fs.subject_id
           WHERE fs.student_id = ?
           ORDER BY fs.updated_at DESC`
        )
        .all(student.id) as Array<{ form_id: number; status: string }>)
    : [];

  const submittedCount = mySubmissions.filter((s) => s.status === 'submitted').length;
  const draftCount = mySubmissions.filter((s) => s.status === 'draft').length;
  const totalAvailable = Math.max(activeForms.length, 1);
  const completionPercent = Math.min(100, Math.round((submittedCount / totalAvailable) * 100));

  const eightSemesterTracking = student
    ? buildStudentEightSemesterTracking(student.id, student.department_id, student.semester_term_order)
    : [];

  // Aggregate department participation leaderboard (no individual ratings exposed!)
  const leaderboard = db
    .prepare(
      `SELECT d.code, d.name AS department_name,
              COUNT(DISTINCT s.id) AS enrolled_students,
              COUNT(DISTINCT CASE WHEN fs.status = 'submitted' THEN fs.id END) AS completed_evaluations,
              ROUND(
                CASE WHEN COUNT(DISTINCT s.id) = 0 THEN 0
                ELSE (COUNT(DISTINCT CASE WHEN fs.status = 'submitted' THEN fs.student_id END) * 100.0 / COUNT(DISTINCT s.id))
                END, 1
              ) AS participation_rate
       FROM departments d
       LEFT JOIN students s ON s.department_id = d.id
       LEFT JOIN feedback_submissions fs ON fs.student_id = s.id
       GROUP BY d.id
       ORDER BY participation_rate DESC, completed_evaluations DESC`
    )
    .all();

  const notifications = db
    .prepare(
      `SELECT id, title, message, category, created_at FROM notifications
       WHERE target_role IN ('all', 'student') OR user_id = ?
       ORDER BY id DESC LIMIT 6`
    )
    .all(req.user!.sub);

  res.json({
    student,
    activeForms,
    mySubmissions,
    progress: { submittedCount, draftCount, totalAvailable, completionPercent },
    eightSemesterTracking,
    leaderboard,
    notifications,
  });
});

// ---------------------------------------------------------------------------
// FACULTY ENDPOINTS
// ---------------------------------------------------------------------------
apiRouter.get('/faculty', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT f.id, u.id AS user_id, u.full_name, u.email, u.is_active, f.employee_code, f.designation, f.specialization,
              f.department_id, d.name AS department_name,
              COUNT(DISTINCT sub.id) AS subject_count,
              ROUND(AVG(CASE WHEN fs.status = 'submitted' THEN r.overall_satisfaction END), 2) AS avg_rating,
              COUNT(DISTINCT CASE WHEN fs.status = 'submitted' THEN fs.id END) AS feedback_count
       FROM faculty f
       JOIN users u ON u.id = f.user_id
       JOIN departments d ON d.id = f.department_id
       LEFT JOIN subjects sub ON sub.faculty_id = f.id
       LEFT JOIN feedback_submissions fs ON fs.faculty_id = f.id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       GROUP BY f.id
       ORDER BY u.full_name`
    )
    .all();
  res.json({ faculty: rows });
});

apiRouter.get('/faculty/dashboard', requireAuth, requireRole('faculty', 'admin'), (req: AuthenticatedRequest, res) => {
  let facultyRow = db
    .prepare(
      `SELECT f.*, u.full_name, u.email, d.name AS department_name
       FROM faculty f
       JOIN users u ON u.id = f.user_id
       JOIN departments d ON d.id = f.department_id
       WHERE f.user_id = ?`
    )
    .get(req.user!.sub) as { id: number; full_name: string; department_name: string } | undefined;

  if (!facultyRow && req.user!.role === 'admin') {
    const requestedFacultyId = Number(req.query.facultyId) || 1;
    facultyRow = db
      .prepare(
        `SELECT f.*, u.full_name, u.email, d.name AS department_name
         FROM faculty f
         JOIN users u ON u.id = f.user_id
         JOIN departments d ON d.id = f.department_id
         WHERE f.id = ?`
      )
      .get(requestedFacultyId) as { id: number; full_name: string; department_name: string } | undefined;
  }

  if (!facultyRow) {
    res.status(404).json({ error: 'Faculty profile not found.' });
    return;
  }

  const assignedSubjects = db
    .prepare(
      `SELECT sub.id, sub.code, sub.name, sub.credits, c.name AS course_name, sem.name AS semester_name,
              COUNT(DISTINCT CASE WHEN fs.status = 'submitted' THEN fs.id END) AS response_count,
              ROUND(AVG(CASE WHEN fs.status = 'submitted' THEN r.overall_satisfaction END), 2) AS avg_satisfaction
       FROM subjects sub
       JOIN courses c ON c.id = sub.course_id
       JOIN semesters sem ON sem.id = sub.semester_id
       LEFT JOIN feedback_submissions fs ON fs.subject_id = sub.id AND fs.faculty_id = ?
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE sub.faculty_id = ?
       GROUP BY sub.id
       ORDER BY sem.term_order DESC, sub.code ASC`
    )
    .all(facultyRow.id, facultyRow.id);

  const metrics = db
    .prepare(
      `SELECT
         COUNT(*) AS total_responses,
         ROUND(AVG(r.overall_satisfaction), 2) AS avg_overall,
         ROUND(AVG(r.teaching_quality), 2) AS avg_teaching,
         ROUND(AVG(r.communication), 2) AS avg_communication,
         ROUND(AVG(r.punctuality), 2) AS avg_punctuality,
         ROUND(AVG(r.subject_knowledge), 2) AS avg_knowledge,
         ROUND(AVG(r.methodology), 2) AS avg_methodology
       FROM feedback_submissions fs
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.faculty_id = ? AND fs.status = 'submitted'`
    )
    .get(facultyRow.id);

  const semesterTrend = db
    .prepare(
      `SELECT sem.name AS semester_name, sem.term_order,
              ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction,
              COUNT(*) AS submissions
       FROM feedback_submissions fs
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN semesters sem ON sem.id = ff.semester_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.faculty_id = ? AND fs.status = 'submitted'
       GROUP BY sem.id
       ORDER BY sem.term_order ASC`
    )
    .all(facultyRow.id);

  // Strict privacy: NEVER include student_id, student name, or email in faculty feedback list
  const anonymizedComments = db
    .prepare(
      `SELECT fs.id, sub.code AS subject_code, sub.name AS subject_name, fs.comment_text,
              r.overall_satisfaction, fs.submitted_at,
              ai.sentiment, ai.primary_category
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       WHERE fs.faculty_id = ? AND fs.status = 'submitted'
       ORDER BY fs.submitted_at DESC`
    )
    .all(facultyRow.id);

  const recommendations = db
    .prepare(
      `SELECT * FROM ai_recommendations
       WHERE (target_type = 'faculty' AND (target_id = ? OR target_id IS NULL)) OR target_type = 'institution'
       ORDER BY id DESC LIMIT 10`
    )
    .all(facultyRow.id);

  res.json({
    faculty: facultyRow,
    assignedSubjects,
    metrics,
    semesterTrend,
    anonymizedComments,
    recommendations,
  });
});

// ---------------------------------------------------------------------------
// FEEDBACK FORMS, QR CODES & SUBMISSIONS
// ---------------------------------------------------------------------------
apiRouter.get('/feedback/forms', requireAuth, (req: AuthenticatedRequest, res) => {
  const forms = db
    .prepare(
      `SELECT ff.*, d.name AS department_name, c.name AS course_name, ay.label AS academic_year_label, sem.name AS semester_name
       FROM feedback_forms ff
       LEFT JOIN departments d ON d.id = ff.department_id
       LEFT JOIN courses c ON c.id = ff.course_id
       JOIN academic_years ay ON ay.id = ff.academic_year_id
       JOIN semesters sem ON sem.id = ff.semester_id
       ORDER BY ff.is_active DESC, ff.close_date ASC`
    )
    .all() as Array<{ id: number; qr_token: string }>;

  const getQuestions = db.prepare(
    `SELECT id, form_id, question_text, question_type, category, is_required, sort_order, options_json
     FROM feedback_questions WHERE form_id = ? ORDER BY sort_order ASC`
  );

  let studentId: number | null = null;
  if (req.user?.role === 'student') {
    const stu = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user.sub) as { id: number } | undefined;
    studentId = stu?.id ?? null;
  }

  const enriched = forms.map((f) => {
    const questions = getQuestions.all(f.id);
    const existingSubmissions = studentId
      ? db
          .prepare('SELECT id, subject_id, status FROM feedback_submissions WHERE form_id = ? AND student_id = ?')
          .all(f.id, studentId)
      : [];
    return { ...f, questions, existingSubmissions };
  });

  res.json({ forms: enriched });
});

apiRouter.get('/feedback/forms/qr/:token', async (req, res) => {
  const rawToken = decodeURIComponent(String(req.params.token || '')).trim();
  if (!rawToken) {
    res.status(400).json({ error: 'Feedback form QR token is required.' });
    return;
  }
  const normalizedToken = QR_TOKEN_ALIASES[rawToken.toUpperCase()] || rawToken;
  const numericId = /^\d+$/.test(normalizedToken) ? Number(normalizedToken) : -1;

  const form = db
    .prepare(
      `SELECT ff.*, d.name AS department_name, c.code AS course_code, c.name AS course_name, sem.name AS semester_name
       FROM feedback_forms ff
       LEFT JOIN departments d ON d.id = ff.department_id
       LEFT JOIN courses c ON c.id = ff.course_id
       JOIN semesters sem ON sem.id = ff.semester_id
       WHERE UPPER(ff.qr_token) = UPPER(?) OR ff.id = ?
       LIMIT 1`
    )
    .get(normalizedToken, numericId) as (Record<string, unknown> & { id: number; qr_token: string }) | undefined;

  if (!form) {
    res.status(404).json({ error: 'Feedback form QR token not found.' });
    return;
  }

  const questionStats = db
    .prepare(`SELECT COUNT(*) AS cnt FROM feedback_questions WHERE form_id = ?`)
    .get(form.id) as { cnt: number };

  const origin = resolvePublicOrigin(req);
  const targetUrl = `${origin}/?qr=${encodeURIComponent(form.qr_token)}`;
  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  res.json({
    form: { ...form, questions_count: questionStats?.cnt ?? 0 },
    qrDataUrl,
    targetUrl,
  });
});

apiRouter.post('/feedback/submit', requireAuth, requireRole('student'), async (req: AuthenticatedRequest, res) => {
  const {
    form_id,
    subject_id,
    status = 'submitted',
    is_anonymous = false,
    comment_text = '',
    ratings = {},
    responses = [],
  } = req.body ?? {};

  const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user!.sub) as { id: number } | undefined;
  if (!student) {
    res.status(403).json({ error: 'Student enrollment record not found.' });
    return;
  }

  const form = db.prepare('SELECT * FROM feedback_forms WHERE id = ?').get(Number(form_id)) as
    | { id: number; is_active: number; open_date: string; close_date: string; allow_anonymous: number }
    | undefined;
  if (!form) {
    res.status(404).json({ error: 'Feedback form does not exist.' });
    return;
  }
  if (form.is_active !== 1) {
    res.status(400).json({ error: 'This feedback campaign is currently inactive.' });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (today > form.close_date) {
    res.status(400).json({ error: `Submission deadline (${form.close_date}) has passed.` });
    return;
  }

  const subject = db
    .prepare(
      `SELECT sub.id, sub.name, sub.faculty_id, d.name AS department_name
       FROM subjects sub JOIN departments d ON d.id = sub.department_id
       WHERE sub.id = ?`
    )
    .get(Number(subject_id)) as { id: number; name: string; faculty_id: number | null; department_name: string } | undefined;
  if (!subject) {
    res.status(404).json({ error: 'Selected subject not found.' });
    return;
  }

  const clampScore = (val: unknown, fallback = 4) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(5, Math.max(1, Math.round(n * 10) / 10));
  };

  const cleanRatings = {
    teaching_quality: clampScore(ratings.teaching_quality, 4),
    communication: clampScore(ratings.communication, 4),
    punctuality: clampScore(ratings.punctuality, 4),
    subject_knowledge: clampScore(ratings.subject_knowledge, 4),
    methodology: clampScore(ratings.methodology, 4),
    classroom_environment: clampScore(ratings.classroom_environment, 4),
    infrastructure: clampScore(ratings.infrastructure, 4),
    overall_satisfaction: clampScore(ratings.overall_satisfaction, 4),
  };

  const cleanStatus = status === 'draft' ? 'draft' : 'submitted';
  const cleanAnon = form.allow_anonymous && is_anonymous ? 1 : 0;
  const cleanComment = typeof comment_text === 'string' ? comment_text.trim().slice(0, 3000) : '';

  const existing = db
    .prepare('SELECT id, status FROM feedback_submissions WHERE form_id = ? AND student_id = ? AND subject_id = ?')
    .get(form.id, student.id, subject.id) as { id: number; status: string } | undefined;

  // Prevent duplicate submission if user explicitly tries to submit new when already submitted unless editing before deadline
  const isEditing = Boolean(req.body?.allow_edit_before_deadline);
  if (existing && existing.status === 'submitted' && cleanStatus === 'submitted' && !isEditing) {
    res.status(409).json({
      error: 'Duplicate submission prevented. You have already submitted feedback for this subject. You can edit it from Feedback History before the deadline.',
    });
    return;
  }

  const generatedReceiptToken = `SNU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  const tx = db.transaction(() => {
    let submissionId: number;
    if (existing) {
      db.prepare(
        `UPDATE feedback_submissions
         SET status = ?, is_anonymous = ?, comment_text = ?, faculty_id = ?,
             receipt_token = COALESCE(NULLIF(receipt_token, ''), ?),
             submitted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
      ).run(cleanStatus, cleanAnon, cleanComment, subject.faculty_id, generatedReceiptToken, existing.id);
      submissionId = existing.id;

      db.prepare(
        `UPDATE feedback_ratings
         SET teaching_quality = ?, communication = ?, punctuality = ?, subject_knowledge = ?,
             methodology = ?, classroom_environment = ?, infrastructure = ?, overall_satisfaction = ?, updated_at = datetime('now')
         WHERE submission_id = ?`
      ).run(
        cleanRatings.teaching_quality,
        cleanRatings.communication,
        cleanRatings.punctuality,
        cleanRatings.subject_knowledge,
        cleanRatings.methodology,
        cleanRatings.classroom_environment,
        cleanRatings.infrastructure,
        cleanRatings.overall_satisfaction,
        submissionId
      );
    } else {
      const subRes = db
        .prepare(
          `INSERT INTO feedback_submissions (form_id, student_id, subject_id, faculty_id, status, is_anonymous, comment_text, receipt_token)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(form.id, student.id, subject.id, subject.faculty_id, cleanStatus, cleanAnon, cleanComment, generatedReceiptToken);
      submissionId = Number(subRes.lastInsertRowid);

      db.prepare(
        `INSERT INTO feedback_ratings (submission_id, teaching_quality, communication, punctuality, subject_knowledge, methodology, classroom_environment, infrastructure, overall_satisfaction)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        submissionId,
        cleanRatings.teaching_quality,
        cleanRatings.communication,
        cleanRatings.punctuality,
        cleanRatings.subject_knowledge,
        cleanRatings.methodology,
        cleanRatings.classroom_environment,
        cleanRatings.infrastructure,
        cleanRatings.overall_satisfaction
      );
    }

    if (Array.isArray(responses)) {
      const upsertResp = db.prepare(
        `INSERT INTO feedback_responses (submission_id, question_id, response_value, numeric_score)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(submission_id, question_id) DO UPDATE SET response_value = excluded.response_value, numeric_score = excluded.numeric_score, updated_at = datetime('now')`
      );
      for (const r of responses) {
        if (r && Number(r.question_id) > 0) {
          const val = String(r.response_value ?? '').slice(0, 1500);
          const num = Number.isFinite(Number(r.numeric_score)) ? Number(r.numeric_score) : null;
          upsertResp.run(submissionId, Number(r.question_id), val, num);
        }
      }
    }

    return submissionId;
  });

  const submissionId = tx();

  logAudit({
    userId: req.user!.sub,
    userEmail: cleanAnon ? '[ANONYMOUS_SUBMITTER]' : req.user!.email,
    userRole: 'student',
    action: cleanStatus === 'draft' ? 'FEEDBACK_DRAFT_SAVED' : 'FEEDBACK_SUBMITTED',
    entityType: 'feedback_submissions',
    entityId: submissionId,
    details: { form_id: form.id, subject_id: subject.id, is_anonymous: Boolean(cleanAnon) },
    ipAddress: req.ip,
  });

  // Trigger real Gemini sentiment analysis when submitted (non-fatal if GEMINI_API_KEY unset during local offline tests)
  let aiStatus: string = 'pending';
  if (cleanStatus === 'submitted' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    try {
      const aiRes = await analyzeSubmissionWithGemini({
        commentText: cleanComment,
        subjectName: subject.name,
        departmentName: subject.department_name,
        overallSatisfaction: cleanRatings.overall_satisfaction,
        infrastructureScore: cleanRatings.infrastructure,
      });
      db.prepare(
        `INSERT INTO ai_sentiment_analysis (submission_id, sentiment, confidence_score, primary_category, urgency_level, key_phrases_json, model_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(submission_id) DO UPDATE SET sentiment = excluded.sentiment, confidence_score = excluded.confidence_score,
         primary_category = excluded.primary_category, urgency_level = excluded.urgency_level, key_phrases_json = excluded.key_phrases_json,
         model_name = excluded.model_name, updated_at = datetime('now')`
      ).run(
        submissionId,
        aiRes.sentiment,
        aiRes.confidence_score,
        aiRes.primary_category,
        aiRes.urgency_level,
        JSON.stringify(aiRes.key_phrases),
        aiRes.model_name
      );
      aiStatus = aiRes.sentiment;
    } catch (aiErr) {
      console.warn('Auto AI sentiment skipped:', aiErr instanceof Error ? aiErr.message : aiErr);
    }
  }

  res.status(existing ? 200 : 201).json({
    submission_id: submissionId,
    status: cleanStatus,
    ai_sentiment: aiStatus,
    message:
      cleanStatus === 'draft'
        ? 'Draft saved to database.'
        : 'Feedback submitted and recorded permanently.',
  });
});

apiRouter.get('/feedback/history', requireAuth, requireRole('student'), (req: AuthenticatedRequest, res) => {
  const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user!.sub) as { id: number } | undefined;
  if (!student) {
    res.json({ history: [] });
    return;
  }

  const rows = db
    .prepare(
      `SELECT fs.id, fs.form_id, fs.subject_id, fs.status, fs.is_anonymous, fs.comment_text, fs.submitted_at, fs.updated_at,
              ff.title AS form_title, ff.close_date, ff.is_active,
              sub.code AS subject_code, sub.short_code, sub.elective_group, sub.name AS subject_name,
              c.code AS course_code, c.name AS course_name, sem.name AS semester_name,
              stu.roll_number, d.name AS department_name, u.full_name AS faculty_name,
              r.teaching_quality, r.communication, r.punctuality, r.subject_knowledge,
              r.methodology, r.classroom_environment, r.infrastructure, r.overall_satisfaction
       FROM feedback_submissions fs
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN students stu ON stu.id = fs.student_id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN courses c ON c.id = sub.course_id
       JOIN semesters sem ON sem.id = sub.semester_id
       JOIN departments d ON d.id = sub.department_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.student_id = ?
       ORDER BY fs.updated_at DESC`
    )
    .all(student.id) as Array<{ close_date: string; is_active: number }>;

  const today = new Date().toISOString().slice(0, 10);
  const enriched = rows.map((row) => ({
    ...row,
    can_edit: row.is_active === 1 && today <= row.close_date,
  }));

  res.json({ history: enriched });
});

function loadOwnedSubmissionReceipt(submissionId: number, req: AuthenticatedRequest) {
  const row = db
    .prepare(
      `SELECT fs.id, fs.form_id, fs.student_id, fs.subject_id, fs.status, fs.is_anonymous,
              fs.comment_text, fs.receipt_token, fs.submitted_at, fs.updated_at,
              ff.title AS form_title, ff.close_date,
              sub.code AS subject_code, sub.short_code, sub.elective_group, sub.name AS subject_name,
              c.code AS course_code, c.name AS course_name, sem.name AS semester_name,
              d.name AS department_name, fu.full_name AS faculty_name,
              su.full_name AS student_name, stu.roll_number, stu.user_id AS student_user_id,
              r.teaching_quality, r.communication, r.punctuality, r.subject_knowledge,
              r.methodology, r.classroom_environment, r.infrastructure, r.overall_satisfaction
       FROM feedback_submissions fs
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN courses c ON c.id = sub.course_id
       JOIN semesters sem ON sem.id = sub.semester_id
       JOIN departments d ON d.id = sub.department_id
       JOIN students stu ON stu.id = fs.student_id
       JOIN users su ON su.id = stu.user_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users fu ON fu.id = f.user_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.id = ?`
    )
    .get(submissionId) as Record<string, unknown> | undefined;

  if (!row) return { errorStatus: 404, error: 'Submission receipt not found.' as const };
  if (req.user!.role === 'student' && row.student_user_id !== req.user!.sub) {
    return { errorStatus: 403, error: 'Access denied to another student receipt.' as const };
  }
  if (req.user!.role === 'faculty') {
    return { errorStatus: 403, error: 'Faculty cannot access individual student receipts.' as const };
  }
  return { row };
}

apiRouter.get('/feedback/receipt/verify', (req, res) => {
  const rawReceipt = typeof req.query.receipt === 'string' ? req.query.receipt.trim() : '';
  const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  const receiptMatch = rawReceipt.match(/^(?:SNU-REC-)?0*(\d+)$/i);
  const submissionId = receiptMatch ? Number(receiptMatch[1]) : Number(rawId);

  if (!Number.isInteger(submissionId) || submissionId <= 0 || !token) {
    res.status(400).json({ error: 'Valid receipt number and verification token are required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT fs.id, fs.status, fs.is_anonymous, fs.comment_text, fs.receipt_token,
              fs.submitted_at, fs.updated_at,
              ff.title AS form_title, ff.close_date,
              sub.code AS subject_code, sub.short_code, sub.elective_group, sub.name AS subject_name,
              c.code AS course_code, c.name AS course_name, sem.name AS semester_name,
              d.name AS department_name, fu.full_name AS faculty_name,
              su.full_name AS student_name, stu.roll_number,
              r.teaching_quality, r.communication, r.punctuality, r.subject_knowledge,
              r.methodology, r.classroom_environment, r.infrastructure, r.overall_satisfaction,
              ai.sentiment, ai.primary_category
       FROM feedback_submissions fs
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN courses c ON c.id = sub.course_id
       JOIN semesters sem ON sem.id = sub.semester_id
       JOIN departments d ON d.id = sub.department_id
       JOIN students stu ON stu.id = fs.student_id
       JOIN users su ON su.id = stu.user_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users fu ON fu.id = f.user_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       WHERE fs.id = ?`
    )
    .get(submissionId) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Feedback receipt not found.' });
    return;
  }

  const storedToken = typeof row.receipt_token === 'string' ? row.receipt_token : '';
  const tokenBuf = Buffer.from(token);
  const storedBuf = Buffer.from(storedToken);
  if (!storedToken || tokenBuf.length !== storedBuf.length || !crypto.timingSafeEqual(tokenBuf, storedBuf)) {
    res.status(403).json({ error: 'Invalid or expired receipt verification token.' });
    return;
  }

  const isAnon = Number(row.is_anonymous) === 1;
  const receiptNumber = `SNU-REC-${String(row.id).padStart(5, '0')}`;

  res.json({
    receipt: {
      receiptNumber,
      id: row.id,
      status: row.status,
      is_anonymous: isAnon,
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      student_name: isAnon ? 'Anonymous Respondent' : row.student_name,
      roll_number: isAnon ? 'CONFIDENTIAL (Anonymous)' : row.roll_number,
      department_name: row.department_name,
      course_code: row.course_code,
      course_name: row.course_name,
      semester_name: row.semester_name,
      subject_code: row.subject_code,
      short_code: row.short_code,
      elective_group: row.elective_group,
      subject_name: row.subject_name,
      faculty_name: row.faculty_name || 'Department Faculty',
      form_title: row.form_title,
      close_date: row.close_date,
      comment_text: row.comment_text || '',
      sentiment: row.sentiment || null,
      primary_category: row.primary_category || null,
      ratings: {
        teaching_quality: row.teaching_quality,
        communication: row.communication,
        punctuality: row.punctuality,
        subject_knowledge: row.subject_knowledge,
        methodology: row.methodology,
        classroom_environment: row.classroom_environment,
        infrastructure: row.infrastructure,
        overall_satisfaction: row.overall_satisfaction,
      },
    },
  });
});

apiRouter.get('/feedback/submissions/:id/qr', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = Number(req.params.id);
  const lookup = loadOwnedSubmissionReceipt(submissionId, req);
  if ('error' in lookup) {
    res.status(lookup.errorStatus!).json({ error: lookup.error });
    return;
  }

  const row = lookup.row!;
  const receiptNumber = `SNU-REC-${String(row.id).padStart(5, '0')}`;
  const receiptToken = ensureSubmissionReceiptToken(Number(row.id), row.receipt_token);
  const origin = resolvePublicOrigin(req);
  const verifyUrl = `${origin}/?receipt=${encodeURIComponent(receiptNumber)}&token=${encodeURIComponent(receiptToken)}`;
  // Encode direct URL so Google Scan / mobile cameras open full feedback details immediately
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  res.json({
    receiptNumber,
    receiptToken,
    qrDataUrl,
    verifyUrl,
    submission: {
      id: row.id,
      roll_number: row.roll_number,
      subject_code: row.subject_code,
      short_code: row.short_code,
      subject_name: row.subject_name,
      faculty_name: row.faculty_name,
      semester_name: row.semester_name,
      status: row.status,
      submitted_at: row.submitted_at,
    },
  });
});

apiRouter.get('/feedback/submissions/:id/receipt/pdf', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = Number(req.params.id);
  const lookup = loadOwnedSubmissionReceipt(submissionId, req);
  if ('error' in lookup) {
    res.status(lookup.errorStatus!).json({ error: lookup.error });
    return;
  }

  const row = lookup.row!;
  const receiptNumber = `SNU-REC-${String(row.id).padStart(5, '0')}`;
  const receiptToken = ensureSubmissionReceiptToken(Number(row.id), row.receipt_token);
  const origin = resolvePublicOrigin(req);
  const verifyUrl = `${origin}/?receipt=${encodeURIComponent(receiptNumber)}&token=${encodeURIComponent(receiptToken)}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, {
    width: 160,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="SNU_Receipt_${String(row.subject_code)}_${row.id}.pdf"`
  );

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(20).fillColor('#0B192C').text('Sapthagiri NPS University');
  doc.fontSize(12).fillColor('#1E40AF').text('Official Student Feedback Submission Receipt');
  doc.moveDown(0.5);
  doc
    .fontSize(9)
    .fillColor('#475569')
    .text(`Receipt ID: ${receiptNumber}   |   Status: ${String(row.status).toUpperCase()}   |   Timestamp: ${row.submitted_at}`);
  doc.moveDown(1);

  const startY = doc.y;
  doc.fontSize(11).fillColor('#0B192C').text('Student & Course Details');
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#1E293B');
  doc.text(`Enrollment Number: ${row.roll_number}`);
  doc.text(`Student Name: ${row.is_anonymous ? 'Anonymous Mode Enabled' : row.student_name}`);
  doc.text(`Department: ${row.department_name}`);
  doc.text(`Program: ${row.course_code} — ${row.course_name}`);
  doc.text(`Semester: ${row.semester_name}`);
  doc.text(
    `Subject: ${row.subject_code}${row.short_code ? ` (${row.short_code})` : ''} · ${row.subject_name}`
  );
  doc.text(`Course Faculty: ${row.faculty_name || 'Department Faculty'}`);
  doc.text(`Campaign: ${row.form_title}`);

  // Place QR Code on top right of the details block
  doc.image(qrBuffer, 415, startY, { width: 120, height: 120 });
  doc.fontSize(8).fillColor('#64748B').text('Scan to Verify Receipt', 415, startY + 124, { width: 120, align: 'center' });

  doc.y = Math.max(doc.y, startY + 150);
  doc.moveDown(0.6);
  doc.fontSize(11).fillColor('#0B192C').text('Submitted Evaluation Ratings (Scale 1.0 - 5.0)');
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#334155');
  doc.text(
    `Teaching Quality: ${row.teaching_quality}/5   |   Communication: ${row.communication}/5   |   Punctuality: ${row.punctuality}/5`
  );
  doc.text(
    `Subject Knowledge: ${row.subject_knowledge}/5   |   Methodology: ${row.methodology}/5   |   Classroom Env: ${row.classroom_environment}/5`
  );
  doc.text(
    `Infrastructure: ${row.infrastructure}/5   |   Overall Satisfaction: ${row.overall_satisfaction}/5`
  );
  doc.moveDown(0.8);

  doc.fontSize(11).fillColor('#0B192C').text('Written Feedback');
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#334155').text(String(row.comment_text || 'No written comment provided.'));
  doc.moveDown(1);

  doc.fontSize(8).fillColor('#64748B').text(`Verification URI: ${verifyUrl}`);
  doc.end();
});

apiRouter.get('/feedback/history/export/csv', requireAuth, requireRole('student'), (req: AuthenticatedRequest, res: Response) => {
  const student = db.prepare('SELECT id, roll_number FROM students WHERE user_id = ?').get(req.user!.sub) as
    | { id: number; roll_number: string }
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Student enrollment record not found.' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT fs.id, fs.status, fs.is_anonymous, fs.submitted_at,
              ff.title AS form_title, sub.code AS subject_code, sub.short_code, sub.name AS subject_name,
              sem.name AS semester_name, u.full_name AS faculty_name,
              r.overall_satisfaction, fs.comment_text
       FROM feedback_submissions fs
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN semesters sem ON sem.id = sub.semester_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.student_id = ?
       ORDER BY fs.updated_at DESC`
    )
    .all(student.id) as Array<Record<string, unknown>>;

  const headers = [
    'receipt_id',
    'enrollment_number',
    'semester',
    'subject_code',
    'short_code',
    'subject_name',
    'faculty_name',
    'campaign',
    'status',
    'anonymous',
    'overall_satisfaction',
    'submitted_at',
    'comment',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        `SNU-REC-${String(r.id).padStart(5, '0')}`,
        student.roll_number,
        r.semester_name,
        r.subject_code,
        r.short_code ?? '',
        r.subject_name,
        r.faculty_name ?? '',
        r.form_title,
        r.status,
        r.is_anonymous ? 'Yes' : 'No',
        r.overall_satisfaction ?? '',
        r.submitted_at,
        r.comment_text ?? '',
      ]
        .map(esc)
        .join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${student.roll_number}_feedback_history.csv"`);
  res.send(lines.join('\n'));
});

apiRouter.get('/feedback/details', requireAuth, (req: AuthenticatedRequest, res) => {
  const id = Number(req.query.id);
  if (!id) {
    res.status(400).json({ error: 'Submission id is required.' });
    return;
  }
  const row = db
    .prepare(
      `SELECT fs.id, fs.form_id, fs.student_id, fs.subject_id, fs.faculty_id, fs.status, fs.is_anonymous,
              fs.comment_text, fs.submitted_at,
              ff.title AS form_title, sub.code AS subject_code, sub.name AS subject_name,
              d.name AS department_name, fu.full_name AS faculty_name,
              su.full_name AS student_name, stu.roll_number, stu.user_id AS student_user_id,
              r.teaching_quality, r.communication, r.punctuality, r.subject_knowledge,
              r.methodology, r.classroom_environment, r.infrastructure, r.overall_satisfaction,
              ai.sentiment, ai.primary_category, ai.confidence_score, ai.urgency_level, ai.key_phrases_json
       FROM feedback_submissions fs
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       JOIN students stu ON stu.id = fs.student_id
       JOIN users su ON su.id = stu.user_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users fu ON fu.id = f.user_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       WHERE fs.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Submission not found.' });
    return;
  }

  if (req.user!.role === 'student' && row.student_user_id !== req.user!.sub) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  if (req.user!.role === 'faculty') {
    const fac = db.prepare('SELECT id FROM faculty WHERE user_id = ?').get(req.user!.sub) as { id: number } | undefined;
    if (!fac || fac.id !== row.faculty_id) {
      res.status(403).json({ error: 'Access denied to other faculty records.' });
      return;
    }
  }

  const responses = db
    .prepare(
      `SELECT fr.*, fq.question_text, fq.question_type, fq.category
       FROM feedback_responses fr
       JOIN feedback_questions fq ON fq.id = fr.question_id
       WHERE fr.submission_id = ?`
    )
    .all(id);

  // Enforce anonymous isolation at API boundary
  const scrubIdentity = row.is_anonymous === 1 || req.user!.role === 'faculty';
  const sanitized = {
    ...row,
    student_id: scrubIdentity ? null : row.student_id,
    student_user_id: scrubIdentity ? null : row.student_user_id,
    student_name: scrubIdentity ? 'Anonymous Student' : row.student_name,
    roll_number: scrubIdentity ? 'CONFIDENTIAL' : row.roll_number,
    responses,
  };

  res.json({ submission: sanitized });
});

// ---------------------------------------------------------------------------
// ADMIN DASHBOARD & GOVERNANCE CRUD
// ---------------------------------------------------------------------------
apiRouter.get('/admin/dashboard', requireAuth, requireRole('admin'), (_req, res) => {
  const kpis = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM students) AS total_students,
         (SELECT COUNT(*) FROM faculty) AS total_faculty,
         (SELECT COUNT(*) FROM feedback_forms WHERE is_active = 1) AS active_forms,
         (SELECT COUNT(*) FROM feedback_submissions WHERE status = 'submitted') AS total_submissions,
         (SELECT ROUND(AVG(overall_satisfaction), 2) FROM feedback_ratings r JOIN feedback_submissions s ON s.id = r.submission_id WHERE s.status = 'submitted') AS avg_satisfaction,
         (SELECT COUNT(*) FROM ai_recommendations WHERE is_alert = 1 AND reviewed_by_admin = 0) AS open_alerts`
    )
    .get();

  // Enforce anonymous identity protection even in admin table!
  const recentSubmissions = db
    .prepare(
      `SELECT fs.id, fs.status, fs.is_anonymous, fs.comment_text, fs.submitted_at,
              ff.title AS form_title, sub.code AS subject_code, sub.name AS subject_name,
              d.name AS department_name, fu.full_name AS faculty_name,
              CASE WHEN fs.is_anonymous = 1 THEN 'Anonymous Respondent' ELSE su.full_name END AS student_display,
              r.overall_satisfaction,
              ai.sentiment, ai.primary_category, ai.urgency_level
       FROM feedback_submissions fs
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       JOIN students stu ON stu.id = fs.student_id
       JOIN users su ON su.id = stu.user_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users fu ON fu.id = f.user_id
       LEFT JOIN feedback_ratings r ON r.submission_id = fs.id
       LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       ORDER BY fs.submitted_at DESC LIMIT 50`
    )
    .all();

  const auditLogs = db
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 40')
    .all();

  const users = db
    .prepare('SELECT id, email, full_name, role, preferred_language, is_active, created_at FROM users ORDER BY id DESC')
    .all();

  const notifications = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 20').all();

  res.json({ kpis, recentSubmissions, auditLogs, users, notifications });
});

apiRouter.post('/admin/feedback-forms', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const {
    title,
    description,
    department_id,
    course_id,
    subject_id,
    academic_year_id,
    semester_id,
    open_date,
    close_date,
    allow_anonymous = true,
    questions = [],
  } = req.body ?? {};

  if (!title || !open_date || !close_date) {
    res.status(400).json({ error: 'Title, open date, and close date are required.' });
    return;
  }

  const qrToken = `SNU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const currentAy = db.prepare('SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1').get() as { id: number } | undefined;
  const currentSem = db.prepare('SELECT id FROM semesters WHERE is_current = 1 LIMIT 1').get() as { id: number } | undefined;
  const ayId = Number(academic_year_id) || currentAy?.id || 1;
  const semId = Number(semester_id) || currentSem?.id || 5;

  const tx = db.transaction(() => {
    const fRes = db
      .prepare(
        `INSERT INTO feedback_forms (title, description, department_id, course_id, subject_id, academic_year_id, semester_id, open_date, close_date, is_active, allow_anonymous, qr_token, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .run(
        String(title).trim(),
        String(description || '').trim(),
        Number(department_id) || null,
        Number(course_id) || null,
        Number(subject_id) || null,
        ayId,
        semId,
        open_date,
        close_date,
        allow_anonymous ? 1 : 0,
        qrToken,
        req.user!.sub
      );
    const formId = Number(fRes.lastInsertRowid);

    const defaultQuestions =
      Array.isArray(questions) && questions.length > 0
        ? questions
        : [
            { question_text: 'Rate overall clarity and structure of lectures.', question_type: 'star', category: 'Teaching Quality' },
            { question_text: 'Rate classroom and lab facility readiness.', question_type: 'slider', category: 'Laboratory Facilities' },
          ];

    const insQ = db.prepare(
      `INSERT INTO feedback_questions (form_id, question_text, question_type, category, is_required, sort_order, options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    defaultQuestions.forEach((q, idx) => {
      if (q && q.question_text) {
        insQ.run(
          formId,
          String(q.question_text).trim(),
          ['star', 'slider', 'radio', 'text'].includes(q.question_type) ? q.question_type : 'star',
          String(q.category || 'Teaching Quality'),
          q.is_required === false ? 0 : 1,
          idx + 1,
          q.options ? JSON.stringify(q.options) : null
        );
      }
    });

    db.prepare(
      `INSERT INTO notifications (target_role, title, message, category) VALUES ('student', ?, ?, 'campaign')`
    ).run(`New Feedback Campaign: ${String(title).trim()}`, `Open from ${open_date} to ${close_date}.`);

    return formId;
  });

  const formId = tx();
  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'admin',
    action: 'FEEDBACK_FORM_CREATED',
    entityType: 'feedback_forms',
    entityId: formId,
    details: { title, qrToken },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: formId, qr_token: qrToken, message: 'Feedback campaign created and activated.' });
});

apiRouter.put('/admin/feedback-forms/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { title, description, open_date, close_date, is_active, allow_anonymous } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM feedback_forms WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Feedback form not found.' });
    return;
  }

  db.prepare(
    `UPDATE feedback_forms
     SET title = COALESCE(?, title),
         description = COALESCE(?, description),
         open_date = COALESCE(?, open_date),
         close_date = COALESCE(?, close_date),
         is_active = COALESCE(?, is_active),
         allow_anonymous = COALESCE(?, allow_anonymous),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title ?? null,
    description ?? null,
    open_date ?? null,
    close_date ?? null,
    typeof is_active === 'boolean' || typeof is_active === 'number' ? (is_active ? 1 : 0) : null,
    typeof allow_anonymous === 'boolean' || typeof allow_anonymous === 'number' ? (allow_anonymous ? 1 : 0) : null,
    id
  );

  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'admin',
    action: 'FEEDBACK_FORM_UPDATED',
    entityType: 'feedback_forms',
    entityId: id,
    details: { is_active, close_date },
    ipAddress: req.ip,
  });

  res.json({ message: 'Feedback campaign updated.' });
});

apiRouter.delete('/admin/feedback-forms/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM feedback_forms WHERE id = ?').run(id);
  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'admin',
    action: 'FEEDBACK_FORM_DELETED',
    entityType: 'feedback_forms',
    entityId: id,
    ipAddress: req.ip,
  });
  res.json({ message: 'Feedback campaign removed.' });
});

// Academic Entity Management
apiRouter.post('/admin/departments', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const { code, name, head_name } = req.body ?? {};
  if (!code || !name || !head_name) {
    res.status(400).json({ error: 'Code, department name, and head name are required.' });
    return;
  }
  try {
    const r = db
      .prepare('INSERT INTO departments (code, name, head_name) VALUES (?, ?, ?)')
      .run(String(code).trim().toUpperCase(), String(name).trim(), String(head_name).trim());
    logAudit({
      userId: req.user!.sub,
      userEmail: req.user!.email,
      userRole: 'admin',
      action: 'DEPARTMENT_CREATED',
      entityType: 'departments',
      entityId: Number(r.lastInsertRowid),
      ipAddress: req.ip,
    });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Department already exists.' });
  }
});

apiRouter.post('/admin/courses', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const { department_id, code, name, degree_level = 'Undergraduate', duration_years = 4 } = req.body ?? {};
  if (!department_id || !code || !name) {
    res.status(400).json({ error: 'Department, code, and course name are required.' });
    return;
  }
  try {
    const r = db
      .prepare('INSERT INTO courses (department_id, code, name, degree_level, duration_years) VALUES (?, ?, ?, ?, ?)')
      .run(Number(department_id), String(code).trim().toUpperCase(), String(name).trim(), String(degree_level), Number(duration_years) || 4);
    logAudit({
      userId: req.user!.sub,
      userEmail: req.user!.email,
      userRole: 'admin',
      action: 'COURSE_CREATED',
      entityType: 'courses',
      entityId: Number(r.lastInsertRowid),
      ipAddress: req.ip,
    });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Course already exists.' });
  }
});

apiRouter.post('/admin/subjects', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const { department_id, course_id, semester_id, faculty_id, code, short_code, elective_group, name, credits = 4 } = req.body ?? {};
  if (!department_id || !course_id || !semester_id || !code || !name) {
    res.status(400).json({ error: 'Department, course, semester, subject code, and name are required.' });
    return;
  }
  try {
    const r = db
      .prepare(
        'INSERT INTO subjects (department_id, course_id, semester_id, faculty_id, code, short_code, elective_group, name, credits) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        Number(department_id),
        Number(course_id),
        Number(semester_id),
        Number(faculty_id) || null,
        String(code).trim().toUpperCase(),
        short_code ? String(short_code).trim().toUpperCase() : null,
        elective_group ? String(elective_group).trim() : 'Core',
        String(name).trim(),
        Number(credits) || 4
      );
    logAudit({
      userId: req.user!.sub,
      userEmail: req.user!.email,
      userRole: 'admin',
      action: 'SUBJECT_CREATED',
      entityType: 'subjects',
      entityId: Number(r.lastInsertRowid),
      ipAddress: req.ip,
    });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Subject code already exists.' });
  }
});

apiRouter.put('/admin/subjects/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { faculty_id, name, credits } = req.body ?? {};
  db.prepare(
    `UPDATE subjects SET faculty_id = COALESCE(?, faculty_id), name = COALESCE(?, name), credits = COALESCE(?, credits), updated_at = datetime('now') WHERE id = ?`
  ).run(faculty_id ? Number(faculty_id) : null, name ?? null, credits ? Number(credits) : null, id);
  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'admin',
    action: 'SUBJECT_ASSIGNMENT_UPDATED',
    entityType: 'subjects',
    entityId: id,
    details: { faculty_id },
    ipAddress: req.ip,
  });
  res.json({ message: 'Subject updated.' });
});

apiRouter.delete('/admin/subjects/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  res.json({ message: 'Subject deleted.' });
});

apiRouter.post('/admin/faculty', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const { full_name, email, password, department_id, employee_code, designation, specialization } = req.body ?? {};
  if (!full_name || !email || !password || !department_id || !employee_code) {
    res.status(400).json({ error: 'All faculty fields are required.' });
    return;
  }
  const cleanEmail = String(email).trim().toLowerCase();
  if (String(password).length < 8) {
    res.status(400).json({ error: 'Initial password must be at least 8 characters.' });
    return;
  }

  try {
    const tx = db.transaction(() => {
      const uRes = db
        .prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, 'faculty')`)
        .run(cleanEmail, hashPassword(String(password)), String(full_name).trim());
      const userId = Number(uRes.lastInsertRowid);
      const fRes = db
        .prepare(
          `INSERT INTO faculty (user_id, department_id, employee_code, designation, specialization) VALUES (?, ?, ?, ?, ?)`
        )
        .run(userId, Number(department_id), String(employee_code).trim().toUpperCase(), String(designation || 'Assistant Professor'), String(specialization || ''));
      return Number(fRes.lastInsertRowid);
    });
    const facId = tx();
    logAudit({
      userId: req.user!.sub,
      userEmail: req.user!.email,
      userRole: 'admin',
      action: 'FACULTY_CREATED',
      entityType: 'faculty',
      entityId: facId,
      ipAddress: req.ip,
    });
    res.status(201).json({ id: facId });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Faculty email or employee code already exists.' });
  }
});

apiRouter.put('/admin/users/:id/role', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { role, is_active } = req.body ?? {};
  if (role && ['student', 'faculty', 'admin'].includes(role)) {
    db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(role, id);
  }
  if (typeof is_active === 'boolean' || typeof is_active === 'number') {
    db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(is_active ? 1 : 0, id);
  }
  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'admin',
    action: 'USER_PERMISSIONS_UPDATED',
    entityType: 'users',
    entityId: id,
    details: { role, is_active },
    ipAddress: req.ip,
  });
  res.json({ message: 'User permissions updated.' });
});

apiRouter.post('/admin/academic-years', requireAuth, requireRole('admin'), (req, res) => {
  const { label, start_date, end_date, is_current } = req.body ?? {};
  if (!label || !start_date || !end_date) {
    res.status(400).json({ error: 'Label, start date, and end date required.' });
    return;
  }
  const r = db
    .prepare('INSERT INTO academic_years (label, start_date, end_date, is_current) VALUES (?, ?, ?, ?)')
    .run(String(label).trim(), start_date, end_date, is_current ? 1 : 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

apiRouter.post('/admin/semesters', requireAuth, requireRole('admin'), (req, res) => {
  const { academic_year_id, name, term_order, start_date, end_date, is_current } = req.body ?? {};
  if (!academic_year_id || !name || !start_date || !end_date) {
    res.status(400).json({ error: 'Academic year, semester name, and dates required.' });
    return;
  }
  const r = db
    .prepare('INSERT INTO semesters (academic_year_id, name, term_order, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Number(academic_year_id), String(name).trim(), Number(term_order) || 1, start_date, end_date, is_current ? 1 : 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

apiRouter.post('/admin/notifications', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const { target_role = 'student', title, message, category = 'campaign' } = req.body ?? {};
  if (!title || !message) {
    res.status(400).json({ error: 'Title and message are required.' });
    return;
  }
  const r = db
    .prepare('INSERT INTO notifications (target_role, title, message, category) VALUES (?, ?, ?, ?)')
    .run(target_role, String(title).trim(), String(message).trim(), category);
  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'admin',
    action: 'NOTIFICATION_DISPATCHED',
    entityType: 'notifications',
    entityId: Number(r.lastInsertRowid),
    details: { target_role, title },
    ipAddress: req.ip,
  });
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Notification campaign dispatched.' });
});

// ---------------------------------------------------------------------------
// ANALYTICS (12 REAL CHART.JS DATASETS + 7 DYNAMIC FILTERS)
// ---------------------------------------------------------------------------
function computeFullAnalytics(filters: FilterParams) {
  const { sql, params } = buildSubmissionWhereClause(filters);

  // 1. Overview & Satisfaction Doughnut (Satisfied >=4, Moderate 3-3.99, Needs Attention <3)
  const overview = db
    .prepare(
      `SELECT
         COUNT(*) AS total_submissions,
         ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction,
         SUM(CASE WHEN r.overall_satisfaction >= 4.0 THEN 1 ELSE 0 END) AS high_satisfaction_count,
         SUM(CASE WHEN r.overall_satisfaction >= 3.0 AND r.overall_satisfaction < 4.0 THEN 1 ELSE 0 END) AS moderate_satisfaction_count,
         SUM(CASE WHEN r.overall_satisfaction < 3.0 THEN 1 ELSE 0 END) AS low_satisfaction_count,
         ROUND(AVG(r.teaching_quality), 2) AS avg_teaching_quality,
         ROUND(AVG(r.communication), 2) AS avg_communication,
         ROUND(AVG(r.punctuality), 2) AS avg_punctuality,
         ROUND(AVG(r.subject_knowledge), 2) AS avg_subject_knowledge,
         ROUND(AVG(r.methodology), 2) AS avg_methodology,
         ROUND(AVG(r.classroom_environment), 2) AS avg_classroom_environment,
         ROUND(AVG(r.infrastructure), 2) AS avg_infrastructure
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE ${sql}`
    )
    .get(...params) as Record<string, number | null>;

  // 2 & 11. Sentiment Pie & AI Sentiment Distribution
  const sentimentRows = db
    .prepare(
      `SELECT COALESCE(ai.sentiment, 'Pending Analysis') AS sentiment, COUNT(*) AS count
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       WHERE ${sql}
       GROUP BY COALESCE(ai.sentiment, 'Pending Analysis')`
    )
    .all(...params) as Array<{ sentiment: string; count: number }>;

  // 3. Department-wise satisfaction bar chart
  const departmentRows = db
    .prepare(
      `SELECT d.code, d.name AS department_name,
              ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction,
              ROUND(AVG(r.infrastructure), 2) AS avg_infrastructure,
              COUNT(*) AS submissions
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE ${sql}
       GROUP BY d.id
       ORDER BY avg_satisfaction DESC`
    )
    .all(...params);

  // 4. Teacher-wise performance comparison chart
  const teacherRows = db
    .prepare(
      `SELECT u.full_name AS faculty_name, d.code AS dept_code,
              ROUND(AVG(r.overall_satisfaction), 2) AS avg_overall,
              ROUND(AVG(r.teaching_quality), 2) AS avg_teaching,
              COUNT(*) AS submissions
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN faculty f ON f.id = fs.faculty_id
       JOIN users u ON u.id = f.user_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE ${sql}
       GROUP BY f.id
       ORDER BY avg_overall DESC`
    )
    .all(...params);

  // 5. Subject-wise feedback comparison chart
  const subjectRows = db
    .prepare(
      `SELECT sub.code, sub.name AS subject_name,
              ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction,
              COUNT(*) AS submissions
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE ${sql}
       GROUP BY sub.id
       ORDER BY avg_satisfaction DESC`
    )
    .all(...params);

  // 6. Monthly feedback submission line chart
  const monthlyRows = db
    .prepare(
      `SELECT strftime('%Y-%m', fs.submitted_at) AS month,
              COUNT(*) AS submissions,
              ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE ${sql}
       GROUP BY strftime('%Y-%m', fs.submitted_at)
       ORDER BY month ASC`
    )
    .all(...params);

  // 7 & 12. Semester-wise satisfaction trend & Academic performance improvement indicator
  const semesterRows = db
    .prepare(
      `SELECT sem.name AS semester_name, sem.term_order,
              ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction,
              ROUND(AVG(r.teaching_quality), 2) AS avg_teaching,
              ROUND(AVG(r.infrastructure), 2) AS avg_infrastructure,
              COUNT(*) AS submissions
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN semesters sem ON sem.id = ff.semester_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE ${sql}
       GROUP BY sem.id
       ORDER BY sem.term_order ASC`
    )
    .all(...params) as Array<{ semester_name: string; avg_satisfaction: number; avg_teaching: number }>;

  // 9. Feedback participation percentage chart (by department)
  const participationRows = db
    .prepare(
      `SELECT d.code, d.name AS department_name,
              COUNT(DISTINCT stu.id) AS total_students,
              COUNT(DISTINCT CASE WHEN fs.status = 'submitted' THEN fs.student_id END) AS participating_students,
              ROUND(
                CASE WHEN COUNT(DISTINCT stu.id) = 0 THEN 0
                ELSE COUNT(DISTINCT CASE WHEN fs.status = 'submitted' THEN fs.student_id END) * 100.0 / COUNT(DISTINCT stu.id)
                END, 1
              ) AS participation_pct
       FROM departments d
       LEFT JOIN students stu ON stu.department_id = d.id
       LEFT JOIN feedback_submissions fs ON fs.student_id = stu.id
       GROUP BY d.id
       ORDER BY participation_pct DESC`
    )
    .all();

  // 10. Most frequently reported issues (low rating dimensions or AI negative categories)
  const aiIssueRows = db
    .prepare(
      `SELECT ai.primary_category AS category, COUNT(*) AS count
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       WHERE ${sql} AND (ai.sentiment = 'Negative' OR ai.urgency_level IN ('medium', 'high'))
       GROUP BY ai.primary_category
       ORDER BY count DESC`
    )
    .all() as Array<{ category: string; count: number }>;

  const dimensionIssues = [
    { category: 'Infrastructure', count: Number(overview?.avg_infrastructure ?? 5) < 4 ? Math.round((5 - Number(overview?.avg_infrastructure ?? 4)) * 10) : 2 },
    { category: 'Classroom Environment', count: Number(overview?.avg_classroom_environment ?? 5) < 4 ? Math.round((5 - Number(overview?.avg_classroom_environment ?? 4)) * 10) : 2 },
    { category: 'Methodology', count: Number(overview?.avg_methodology ?? 5) < 4.2 ? Math.round((5 - Number(overview?.avg_methodology ?? 4)) * 10) : 1 },
    { category: 'Communication', count: Number(overview?.avg_communication ?? 5) < 4.2 ? Math.round((5 - Number(overview?.avg_communication ?? 4)) * 10) : 1 },
  ];

  // Improvement indicator delta between latest two semesters
  let improvementDelta = 0;
  if (semesterRows.length >= 2) {
    const prev = semesterRows[semesterRows.length - 2].avg_satisfaction;
    const curr = semesterRows[semesterRows.length - 1].avg_satisfaction;
    improvementDelta = Math.round((curr - prev) * 100) / 100;
  }

  // AI category breakdown across all analyzed submissions
  const aiCategoryRows = db
    .prepare(
      `SELECT ai.primary_category AS category,
              SUM(CASE WHEN ai.sentiment = 'Positive' THEN 1 ELSE 0 END) AS positive,
              SUM(CASE WHEN ai.sentiment = 'Neutral' THEN 1 ELSE 0 END) AS neutral,
              SUM(CASE WHEN ai.sentiment = 'Negative' THEN 1 ELSE 0 END) AS negative
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       WHERE ${sql}
       GROUP BY ai.primary_category`
    )
    .all(...params);

  return {
    overview,
    sentimentRows,
    departmentRows,
    teacherRows,
    subjectRows,
    monthlyRows,
    semesterRows,
    participationRows,
    reportedIssues: aiIssueRows.length > 0 ? aiIssueRows : dimensionIssues,
    aiCategoryRows,
    improvementDelta,
  };
}

apiRouter.get('/analytics/full-suite', requireAuth, (req, res) => {
  const filters = parseFilters(req.query as Record<string, unknown>);
  res.json(computeFullAnalytics(filters));
});

apiRouter.get('/analytics/overview', requireAuth, (req, res) => {
  const data = computeFullAnalytics(parseFilters(req.query as Record<string, unknown>));
  res.json(data.overview);
});

apiRouter.get('/analytics/sentiment', requireAuth, (req, res) => {
  const data = computeFullAnalytics(parseFilters(req.query as Record<string, unknown>));
  res.json({ sentiment: data.sentimentRows, categories: data.aiCategoryRows });
});

apiRouter.get('/analytics/departments', requireAuth, (req, res) => {
  const data = computeFullAnalytics(parseFilters(req.query as Record<string, unknown>));
  res.json({ departments: data.departmentRows, participation: data.participationRows });
});

apiRouter.get('/analytics/teachers', requireAuth, (req, res) => {
  const data = computeFullAnalytics(parseFilters(req.query as Record<string, unknown>));
  res.json({ teachers: data.teacherRows });
});

apiRouter.get('/analytics/trends', requireAuth, (req, res) => {
  const data = computeFullAnalytics(parseFilters(req.query as Record<string, unknown>));
  res.json({ monthly: data.monthlyRows, semesters: data.semesterRows, improvementDelta: data.improvementDelta });
});

apiRouter.get('/analytics/semester-tracking', requireAuth, (_req, res) => {
  res.json(buildDepartmentEightSemesterTracking());
});

// ---------------------------------------------------------------------------
// AI-POWERED FEATURES (GEMINI API)
// ---------------------------------------------------------------------------
apiRouter.post('/ai/analyze-feedback', requireAuth, requireRole('admin', 'faculty'), aiLimiter, async (req: AuthenticatedRequest, res) => {
  const { submission_id, limit = 6 } = req.body ?? {};

  const rows = submission_id
    ? (db
        .prepare(
          `SELECT fs.id, fs.comment_text, sub.name AS subject_name, d.name AS department_name,
                  r.overall_satisfaction, r.infrastructure
           FROM feedback_submissions fs
           JOIN subjects sub ON sub.id = fs.subject_id
           JOIN departments d ON d.id = sub.department_id
           JOIN feedback_ratings r ON r.submission_id = fs.id
           WHERE fs.id = ? AND fs.status = 'submitted'`
        )
        .all(Number(submission_id)) as Array<{
          id: number;
          comment_text: string;
          subject_name: string;
          department_name: string;
          overall_satisfaction: number;
          infrastructure: number;
        }>)
    : (db
        .prepare(
          `SELECT fs.id, fs.comment_text, sub.name AS subject_name, d.name AS department_name,
                  r.overall_satisfaction, r.infrastructure
           FROM feedback_submissions fs
           JOIN subjects sub ON sub.id = fs.subject_id
           JOIN departments d ON d.id = sub.department_id
           JOIN feedback_ratings r ON r.submission_id = fs.id
           LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
           WHERE fs.status = 'submitted' AND ai.id IS NULL
           ORDER BY fs.id DESC LIMIT ?`
        )
        .all(Math.min(12, Math.max(1, Number(limit) || 6))) as Array<{
          id: number;
          comment_text: string;
          subject_name: string;
          department_name: string;
          overall_satisfaction: number;
          infrastructure: number;
        }>);

  if (rows.length === 0) {
    res.json({ analyzed: 0, message: 'All submitted feedback evaluations are already analyzed by Gemini.' });
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO ai_sentiment_analysis (submission_id, sentiment, confidence_score, primary_category, urgency_level, key_phrases_json, model_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(submission_id) DO UPDATE SET sentiment = excluded.sentiment, confidence_score = excluded.confidence_score,
     primary_category = excluded.primary_category, urgency_level = excluded.urgency_level, key_phrases_json = excluded.key_phrases_json,
     model_name = excluded.model_name, updated_at = datetime('now')`
  );

  const results: Array<{ submission_id: number; sentiment: string; primary_category: string }> = [];
  try {
    for (const row of rows) {
      const resAi = await analyzeSubmissionWithGemini({
        commentText: row.comment_text,
        subjectName: row.subject_name,
        departmentName: row.department_name,
        overallSatisfaction: row.overall_satisfaction,
        infrastructureScore: row.infrastructure,
      });
      upsert.run(
        row.id,
        resAi.sentiment,
        resAi.confidence_score,
        resAi.primary_category,
        resAi.urgency_level,
        JSON.stringify(resAi.key_phrases),
        resAi.model_name
      );
      results.push({ submission_id: row.id, sentiment: resAi.sentiment, primary_category: resAi.primary_category });
    }

    logAudit({
      userId: req.user!.sub,
      userEmail: req.user!.email,
      userRole: req.user!.role,
      action: 'AI_SENTIMENT_BATCH_RUN',
      entityType: 'ai_sentiment_analysis',
      details: { analyzed_count: results.length },
      ipAddress: req.ip,
    });

    res.json({ analyzed: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini sentiment analysis failed.';
    res.status(502).json({ error: message });
  }
});

apiRouter.post('/ai/generate-insights', requireAuth, requireRole('admin', 'faculty'), aiLimiter, async (req: AuthenticatedRequest, res) => {
  const { scope_type = 'institutional', department_id } = req.body ?? {};
  const scopeId = department_id ? Number(department_id) : null;

  const querySql = scopeId
    ? `SELECT d.name AS department, sub.name AS subject, fu.full_name AS faculty,
              r.overall_satisfaction AS overall, r.infrastructure, r.teaching_quality AS teaching, fs.comment_text AS comment
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users fu ON fu.id = f.user_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.status = 'submitted' AND sub.department_id = ?
       ORDER BY fs.submitted_at DESC LIMIT 30`
    : `SELECT d.name AS department, sub.name AS subject, fu.full_name AS faculty,
              r.overall_satisfaction AS overall, r.infrastructure, r.teaching_quality AS teaching, fs.comment_text AS comment
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users fu ON fu.id = f.user_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       WHERE fs.status = 'submitted'
       ORDER BY fs.submitted_at DESC LIMIT 30`;

  const submissionsSummary = (scopeId ? db.prepare(querySql).all(scopeId) : db.prepare(querySql).all()) as Array<{
    department: string;
    subject: string;
    faculty: string;
    overall: number;
    infrastructure: number;
    teaching: number;
    comment: string;
  }>;

  if (submissionsSummary.length === 0) {
    res.status(400).json({ error: 'No submitted feedback records found for this scope.' });
    return;
  }

  const scopeLabel = scopeId ? submissionsSummary[0].department : 'Sapthagiri NPS University (All Departments)';

  try {
    const insights = await generateInsightsWithGemini({ scopeLabel, submissionsSummary });

    const sumRes = db
      .prepare(
        `INSERT INTO ai_feedback_summaries (scope_type, scope_id, summary_text, frequent_topics_json, positive_highlights_json, recurring_complaints_json, model_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        scopeId ? 'department' : scope_type === 'faculty' ? 'faculty' : 'institutional',
        scopeId,
        insights.summary_text,
        JSON.stringify(insights.frequent_topics),
        JSON.stringify(insights.positive_highlights),
        JSON.stringify(insights.recurring_complaints),
        insights.model_name
      );

    const insRec = db.prepare(
      `INSERT INTO ai_recommendations (target_type, target_id, recommendation_title, recommendation_body, priority, is_alert, alert_reason, model_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const rec of insights.recommendations) {
      insRec.run(
        rec.target_type,
        scopeId,
        rec.recommendation_title,
        rec.recommendation_body,
        rec.priority,
        rec.is_alert ? 1 : 0,
        rec.alert_reason || null,
        insights.model_name
      );
      if (rec.is_alert) {
        db.prepare(
          `INSERT INTO notifications (target_role, title, message, category) VALUES ('admin', ?, ?, 'alert')`
        ).run(`AI Alert: ${rec.recommendation_title}`, rec.alert_reason || rec.recommendation_body);
      }
    }

    logAudit({
      userId: req.user!.sub,
      userEmail: req.user!.email,
      userRole: req.user!.role,
      action: 'AI_INSIGHTS_GENERATED',
      entityType: 'ai_feedback_summaries',
      entityId: Number(sumRes.lastInsertRowid),
      ipAddress: req.ip,
    });

    res.status(201).json({ summary_id: Number(sumRes.lastInsertRowid), insights });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini insight generation failed.';
    res.status(502).json({ error: message });
  }
});

apiRouter.get('/ai/insights', requireAuth, (_req, res) => {
  const summaries = db.prepare('SELECT * FROM ai_feedback_summaries ORDER BY id DESC LIMIT 10').all();
  const sentimentRecords = db
    .prepare(
      `SELECT ai.*, fs.comment_text, sub.code AS subject_code, sub.name AS subject_name, d.name AS department_name,
              r.overall_satisfaction, fs.submitted_at
       FROM ai_sentiment_analysis ai
       JOIN feedback_submissions fs ON fs.id = ai.submission_id
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       ORDER BY ai.id DESC LIMIT 40`
    )
    .all();

  const unanalyzedCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM feedback_submissions fs
         LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
         WHERE fs.status = 'submitted' AND ai.id IS NULL`
      )
      .get() as { cnt: number }
  ).cnt;

  const alerts = db
    .prepare('SELECT * FROM ai_recommendations WHERE is_alert = 1 ORDER BY id DESC LIMIT 15')
    .all();

  res.json({ summaries, sentimentRecords, unanalyzedCount, alerts });
});

apiRouter.get('/ai/recommendations', requireAuth, (_req, res) => {
  const recommendations = db.prepare('SELECT * FROM ai_recommendations ORDER BY id DESC LIMIT 30').all();
  res.json({ recommendations });
});

apiRouter.patch('/ai/recommendations/:id/review', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE ai_recommendations SET reviewed_by_admin = 1, updated_at = datetime('now') WHERE id = ?`).run(id);
  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: 'admin',
    action: 'AI_RECOMMENDATION_REVIEWED',
    entityType: 'ai_recommendations',
    entityId: id,
    ipAddress: req.ip,
  });
  res.json({ message: 'Recommendation marked as reviewed.' });
});

apiRouter.post('/ai/chat', requireAuth, aiLimiter, async (req: AuthenticatedRequest, res) => {
  const { message, language = 'en' } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Please enter a question.' });
    return;
  }

  const activeCampaigns = db
    .prepare(`SELECT title, open_date, close_date FROM feedback_forms WHERE is_active = 1 ORDER BY close_date ASC`)
    .all() as Array<{ title: string; open_date: string; close_date: string }>;

  try {
    const result = await chatAssistantWithGemini({
      message: message.trim().slice(0, 1000),
      userRole: req.user!.role,
      language,
      activeCampaigns,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI assistant request failed.';
    res.status(502).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// REPORTS & EXPORTS (CSV, PDF, FLASK/MYSQL/VERCEL ZIP)
// ---------------------------------------------------------------------------
apiRouter.get('/reports/export/csv', requireAuth, requireRole('admin', 'faculty'), (req: AuthenticatedRequest, res: Response) => {
  let facultyFilterId: number | null = null;
  if (req.user!.role === 'faculty') {
    const fac = db.prepare('SELECT id FROM faculty WHERE user_id = ?').get(req.user!.sub) as { id: number } | undefined;
    facultyFilterId = fac?.id ?? -1;
  }

  const rows = db
    .prepare(
      `SELECT fs.id AS submission_id, d.name AS department, sub.code AS subject_code, sub.name AS subject_name,
              fu.full_name AS faculty_name, sem.name AS semester,
              r.teaching_quality, r.communication, r.punctuality, r.subject_knowledge,
              r.methodology, r.classroom_environment, r.infrastructure, r.overall_satisfaction,
              COALESCE(ai.sentiment, 'Pending') AS ai_sentiment,
              COALESCE(ai.primary_category, 'Unclassified') AS ai_category,
              fs.is_anonymous, fs.comment_text, fs.submitted_at
       FROM feedback_submissions fs
       JOIN subjects sub ON sub.id = fs.subject_id
       JOIN departments d ON d.id = sub.department_id
       JOIN feedback_forms ff ON ff.id = fs.form_id
       JOIN semesters sem ON sem.id = ff.semester_id
       LEFT JOIN faculty f ON f.id = fs.faculty_id
       LEFT JOIN users fu ON fu.id = f.user_id
       JOIN feedback_ratings r ON r.submission_id = fs.id
       LEFT JOIN ai_sentiment_analysis ai ON ai.submission_id = fs.id
       WHERE fs.status = 'submitted' AND (? IS NULL OR fs.faculty_id = ?)
       ORDER BY fs.submitted_at DESC`
    )
    .all(facultyFilterId, facultyFilterId) as Array<Record<string, unknown>>;

  const headers = [
    'submission_id',
    'department',
    'subject_code',
    'subject_name',
    'faculty_name',
    'semester',
    'teaching_quality',
    'communication',
    'punctuality',
    'subject_knowledge',
    'methodology',
    'classroom_environment',
    'infrastructure',
    'overall_satisfaction',
    'ai_sentiment',
    'ai_category',
    'respondent_privacy',
    'comment_text',
    'submitted_at',
  ];

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.submission_id,
        r.department,
        r.subject_code,
        r.subject_name,
        r.faculty_name,
        r.semester,
        r.teaching_quality,
        r.communication,
        r.punctuality,
        r.subject_knowledge,
        r.methodology,
        r.classroom_environment,
        r.infrastructure,
        r.overall_satisfaction,
        r.ai_sentiment,
        r.ai_category,
        r.is_anonymous ? 'Anonymous Protected' : 'Confidential Verified',
        r.comment_text,
        r.submitted_at,
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'REPORT_CSV_EXPORTED',
    entityType: 'reports',
    details: { row_count: rows.length },
    ipAddress: req.ip,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sapthagiri_feedback_report.csv"');
  res.send(lines.join('\n'));
});

apiRouter.get('/reports/export/pdf', requireAuth, requireRole('admin', 'faculty'), (req: AuthenticatedRequest, res: Response) => {
  const analytics = computeFullAnalytics({});
  const latestSummary = db
    .prepare('SELECT summary_text, frequent_topics_json FROM ai_feedback_summaries ORDER BY id DESC LIMIT 1')
    .get() as { summary_text: string; frequent_topics_json: string } | undefined;

  logAudit({
    userId: req.user!.sub,
    userEmail: req.user!.email,
    userRole: req.user!.role,
    action: 'REPORT_PDF_EXPORTED',
    entityType: 'reports',
    ipAddress: req.ip,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="sapthagiri_institutional_report.pdf"');

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(20).fillColor('#0B192C').text('Sapthagiri NPS University');
  doc.fontSize(13).fillColor('#1E40AF').text('Institutional Student Feedback & AI Quality Report');
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#475569').text(`Generated: ${new Date().toISOString()} · Requested by: ${req.user!.name} (${req.user!.role})`);
  doc.moveDown(1);

  doc.fontSize(12).fillColor('#0B192C').text('1. Executive Telemetry Summary');
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#1E293B').text(
    `Total Submitted Evaluations: ${analytics.overview?.total_submissions ?? 0}   |   Overall Satisfaction: ${analytics.overview?.avg_satisfaction ?? 0} / 5.00   |   Semester Delta: ${analytics.improvementDelta >= 0 ? '+' : ''}${analytics.improvementDelta}`
  );
  doc.moveDown(1);

  doc.fontSize(12).fillColor('#0B192C').text('2. Department Performance Breakdown');
  doc.moveDown(0.3);
  for (const d of analytics.departmentRows as Array<{ department_name: string; avg_satisfaction: number; submissions: number }>) {
    doc.fontSize(10).fillColor('#334155').text(`• ${d.department_name}: ${d.avg_satisfaction} / 5.00 (${d.submissions} evaluations)`);
  }
  doc.moveDown(1);

  doc.fontSize(12).fillColor('#0B192C').text('3. Faculty Satisfaction Snapshot');
  doc.moveDown(0.3);
  for (const t of analytics.teacherRows as Array<{ faculty_name: string; dept_code: string; avg_overall: number; submissions: number }>) {
    doc.fontSize(10).fillColor('#334155').text(`• ${t.faculty_name} (${t.dept_code}): ${t.avg_overall} / 5.00 (${t.submissions} reviews)`);
  }
  doc.moveDown(1);

  doc.fontSize(12).fillColor('#0B192C').text('4. Gemini AI Executive Narrative');
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#334155').text(
    latestSummary?.summary_text || 'Run "Generate Institutional AI Insights" inside the AI Insights dashboard to embed a live Gemini synthesis here.'
  );

  doc.end();
});

apiRouter.get('/export/bundle-files', requireAuth, (_req, res) => {
  res.json({ files: getFlaskMysqlVercelFiles() });
});

apiRouter.get('/export/project-zip', requireAuth, async (_req, res) => {
  const buffer = await buildExportZipBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="sapthagiri-flask-mysql-vercel.zip"');
  res.send(buffer);
});
