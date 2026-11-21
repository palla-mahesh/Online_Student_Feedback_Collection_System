import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'sapthagiri-feedback-data')
  : path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'student_feedback_db.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'faculty', 'admin')),
      preferred_language TEXT NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en', 'hi', 'kn', 'te')),
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      head_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      term_order INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(academic_year_id, name)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      degree_level TEXT NOT NULL DEFAULT 'Undergraduate',
      duration_years INTEGER NOT NULL DEFAULT 4,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS faculty (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      employee_code TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL DEFAULT 'Assistant Professor',
      specialization TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
      roll_number TEXT NOT NULL UNIQUE,
      batch_year INTEGER NOT NULL DEFAULT 2025,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
      faculty_id INTEGER REFERENCES faculty(id) ON DELETE SET NULL,
      code TEXT NOT NULL UNIQUE,
      short_code TEXT,
      elective_group TEXT DEFAULT 'Core',
      name TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 4,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
      open_date TEXT NOT NULL,
      close_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      allow_anonymous INTEGER NOT NULL DEFAULT 1,
      qr_token TEXT NOT NULL UNIQUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK(question_type IN ('star', 'slider', 'radio', 'text')),
      category TEXT NOT NULL DEFAULT 'Teaching Quality',
      is_required INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1,
      options_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      faculty_id INTEGER REFERENCES faculty(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft', 'submitted')),
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      comment_text TEXT NOT NULL DEFAULT '',
      receipt_token TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(form_id, student_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS feedback_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL UNIQUE REFERENCES feedback_submissions(id) ON DELETE CASCADE,
      teaching_quality REAL NOT NULL CHECK(teaching_quality BETWEEN 1 AND 5),
      communication REAL NOT NULL CHECK(communication BETWEEN 1 AND 5),
      punctuality REAL NOT NULL CHECK(punctuality BETWEEN 1 AND 5),
      subject_knowledge REAL NOT NULL CHECK(subject_knowledge BETWEEN 1 AND 5),
      methodology REAL NOT NULL CHECK(methodology BETWEEN 1 AND 5),
      classroom_environment REAL NOT NULL CHECK(classroom_environment BETWEEN 1 AND 5),
      infrastructure REAL NOT NULL CHECK(infrastructure BETWEEN 1 AND 5),
      overall_satisfaction REAL NOT NULL CHECK(overall_satisfaction BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES feedback_questions(id) ON DELETE CASCADE,
      response_value TEXT NOT NULL,
      numeric_score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(submission_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS ai_sentiment_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL UNIQUE REFERENCES feedback_submissions(id) ON DELETE CASCADE,
      sentiment TEXT NOT NULL CHECK(sentiment IN ('Positive', 'Negative', 'Neutral')),
      confidence_score REAL NOT NULL DEFAULT 0.0,
      primary_category TEXT NOT NULL DEFAULT 'Teaching Quality',
      urgency_level TEXT NOT NULL DEFAULT 'low' CHECK(urgency_level IN ('low', 'medium', 'high')),
      key_phrases_json TEXT NOT NULL DEFAULT '[]',
      model_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_feedback_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('institutional', 'department', 'faculty', 'subject')),
      scope_id INTEGER,
      summary_text TEXT NOT NULL,
      frequent_topics_json TEXT NOT NULL DEFAULT '[]',
      positive_highlights_json TEXT NOT NULL DEFAULT '[]',
      recurring_complaints_json TEXT NOT NULL DEFAULT '[]',
      model_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK(target_type IN ('faculty', 'department', 'institution')),
      target_id INTEGER,
      recommendation_title TEXT NOT NULL,
      recommendation_body TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      is_alert INTEGER NOT NULL DEFAULT 0,
      alert_reason TEXT,
      reviewed_by_admin INTEGER NOT NULL DEFAULT 0,
      model_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      target_role TEXT NOT NULL DEFAULT 'all' CHECK(target_role IN ('all', 'student', 'faculty', 'admin')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'campaign' CHECK(category IN ('campaign', 'deadline', 'alert', 'system')),
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_form ON feedback_submissions(form_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_student ON feedback_submissions(student_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_subject ON feedback_submissions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_faculty ON feedback_submissions(faculty_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_dept ON subjects(department_id);
    CREATE INDEX IF NOT EXISTS idx_ai_sentiment_cat ON ai_sentiment_analysis(primary_category);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Idempotent column migrations for pre-existing SQLite files
  const subjectCols = db.prepare(`PRAGMA table_info(subjects)`).all() as Array<{ name: string }>;
  const colNames = new Set(subjectCols.map((c) => c.name));
  if (!colNames.has('short_code')) {
    db.exec(`ALTER TABLE subjects ADD COLUMN short_code TEXT;`);
  }
  if (!colNames.has('elective_group')) {
    db.exec(`ALTER TABLE subjects ADD COLUMN elective_group TEXT DEFAULT 'Core';`);
  }

  const submissionCols = db.prepare(`PRAGMA table_info(feedback_submissions)`).all() as Array<{ name: string }>;
  const submissionColNames = new Set(submissionCols.map((c) => c.name));
  if (!submissionColNames.has('receipt_token')) {
    db.exec(`ALTER TABLE feedback_submissions ADD COLUMN receipt_token TEXT;`);
  }
}

function ensureSapthagiriCurriculumSynced(): void {
  const syncTx = db.transaction(() => {
    const demoPass = hashPassword('Meridian@2026');

    // 1. Ensure existing seeded admin reflects Dr. H. Ramakrishna
    db.prepare(
      `UPDATE users SET full_name = 'Dr. H. Ramakrishna' WHERE email = 'admin@meridian.edu' AND full_name = 'Dr. Eleanor Vance'`
    ).run();

    // 2. Migrate existing MSU and 24SOU roll numbers to 24SUUBECS001 format
    const rollMigrations: Array<[string, string]> = [
      ['MSU2026CS001', '24SUUBECS001'],
      ['24SOUBECS001', '24SUUBECS001'],
      ['MSU2026CS002', '24SUUBECS002'],
      ['24SOUBECS002', '24SUUBECS002'],
      ['MSU2026EC014', '24SUUBEEC014'],
      ['24SOUBEEC014', '24SUUBEEC014'],
      ['MSU2026ME008', '24SUUBEME008'],
      ['24SOUBEME008', '24SUUBEME008'],
      ['MSU2026MB011', '24SUUMBTM011'],
      ['24SOUBEMB011', '24SUUMBTM011'],
      ['MSU2026CS019', '24SUUBECS019'],
      ['24SOUBECS019', '24SUUBECS019'],
    ];
    for (const [oldRoll, newRoll] of rollMigrations) {
      const hasNew = db.prepare('SELECT id FROM students WHERE roll_number = ?').get(newRoll);
      if (!hasNew) {
        db.prepare('UPDATE students SET roll_number = ?, batch_year = 2024 WHERE roll_number = ?').run(newRoll, oldRoll);
      }
    }
    // Upgrade any remaining 24SOU* custom registered roll numbers to 24SUU*
    const legacySouRows = db
      .prepare(`SELECT id, roll_number FROM students WHERE roll_number LIKE '24SOU%'`)
      .all() as Array<{ id: number; roll_number: string }>;
    for (const row of legacySouRows) {
      const upgraded = row.roll_number.replace(/^24SOU/, '24SUU');
      const dup = db.prepare('SELECT id FROM students WHERE roll_number = ?').get(upgraded);
      if (!dup) {
        db.prepare('UPDATE students SET roll_number = ? WHERE id = ?').run(upgraded, row.id);
      }
    }

    // 3. Ensure Academic Years (2024-2025 through 2027-2028)
    const upsertYear = db.prepare(
      `INSERT INTO academic_years (label, start_date, end_date, is_current)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(label) DO UPDATE SET is_current = excluded.is_current`
    );
    upsertYear.run('2024-2025', '2024-08-01', '2025-05-31', 0);
    upsertYear.run('2025-2026', '2025-08-01', '2026-05-31', 0);
    upsertYear.run('2026-2027', '2026-08-01', '2027-05-31', 1);
    upsertYear.run('2027-2028', '2027-08-01', '2028-05-31', 0);

    const getYearId = (label: string) =>
      (db.prepare('SELECT id FROM academic_years WHERE label = ?').get(label) as { id: number }).id;

    const yr2024 = getYearId('2024-2025');
    const yr2025 = getYearId('2025-2026');
    const yr2026 = getYearId('2026-2027');
    const yr2027 = getYearId('2027-2028');

    // 4. Normalize existing semester labels to Semester 1..8 cleanly
    const legacyRenames: Array<[string, string, number]> = [
      ['Fall 2025', 'Semester 3', 3],
      ['Spring 2026', 'Semester 4', 4],
      ['Fall 2026', 'Semester 5', 5],
      ['Spring 2027', 'Semester 6', 6],
    ];
    for (const [legacyName, semName, order] of legacyRenames) {
      const legacyRow = db.prepare('SELECT id, academic_year_id FROM semesters WHERE name = ?').get(legacyName) as
        | { id: number; academic_year_id: number }
        | undefined;
      if (legacyRow) {
        const targetExists = db.prepare('SELECT id FROM semesters WHERE name = ?').get(semName);
        if (!targetExists) {
          db.prepare('UPDATE semesters SET name = ?, term_order = ? WHERE id = ?').run(semName, order, legacyRow.id);
        }
      }
    }

    const semesterSpecs: Array<{
      yearId: number;
      name: string;
      order: number;
      start: string;
      end: string;
      isCurrent: number;
    }> = [
      { yearId: yr2024, name: 'Semester 1', order: 1, start: '2024-08-01', end: '2024-12-20', isCurrent: 0 },
      { yearId: yr2024, name: 'Semester 2', order: 2, start: '2025-01-10', end: '2025-05-30', isCurrent: 0 },
      { yearId: yr2025, name: 'Semester 3', order: 3, start: '2025-08-01', end: '2025-12-20', isCurrent: 0 },
      { yearId: yr2025, name: 'Semester 4', order: 4, start: '2026-01-10', end: '2026-05-30', isCurrent: 0 },
      { yearId: yr2026, name: 'Semester 5', order: 5, start: '2026-08-01', end: '2026-12-22', isCurrent: 1 },
      { yearId: yr2026, name: 'Semester 6', order: 6, start: '2027-01-10', end: '2027-05-30', isCurrent: 0 },
      { yearId: yr2027, name: 'Semester 7', order: 7, start: '2027-08-01', end: '2027-12-20', isCurrent: 0 },
      { yearId: yr2027, name: 'Semester 8', order: 8, start: '2028-01-10', end: '2028-05-30', isCurrent: 0 },
    ];

    for (const sem of semesterSpecs) {
      const existing = db.prepare('SELECT id FROM semesters WHERE name = ?').get(sem.name) as { id: number } | undefined;
      if (existing) {
        db.prepare(
          'UPDATE semesters SET academic_year_id = ?, term_order = ?, start_date = ?, end_date = ?, is_current = ? WHERE id = ?'
        ).run(sem.yearId, sem.order, sem.start, sem.end, sem.isCurrent, existing.id);
      } else {
        db.prepare(
          'INSERT INTO semesters (academic_year_id, name, term_order, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(sem.yearId, sem.name, sem.order, sem.start, sem.end, sem.isCurrent);
      }
    }

    const getSemId = (name: string) =>
      (db.prepare('SELECT id FROM semesters WHERE name = ?').get(name) as { id: number }).id;
    const sem1Id = getSemId('Semester 1');
    const sem2Id = getSemId('Semester 2');
    const sem3Id = getSemId('Semester 3');
    const sem4Id = getSemId('Semester 4');
    const sem5Id = getSemId('Semester 5');
    const sem6Id = getSemId('Semester 6');
    const sem7Id = getSemId('Semester 7');
    const sem8Id = getSemId('Semester 8');

    // 5. Ensure all 9 university departments exist
    const deptSpecs: Array<[string, string, string]> = [
      ['CSE', 'Computer Science & Engineering', 'DR. RAGHAVENDRARAO B'],
      ['ISE', 'Information Science & Engineering', 'Dr. Claire Bennett'],
      ['AIML', 'Artificial Intelligence & Machine Learning', 'Preetheshnaatha S R'],
      ['DS', 'Computer Science (Data Science)', 'Shivakumara B'],
      ['ECE', 'Electronics & Communication Engineering', 'Dr. Claire Bennett'],
      ['EEE', 'Electrical & Electronics Engineering', 'Prof. Arvind Krishnan'],
      ['MECH', 'Mechanical Engineering', 'Prof. Rajesh Naik'],
      ['CIVIL', 'Civil Engineering', 'Dr. David Okafor'],
      ['MGMT', 'School of Management', 'Dr. Meera Reddy'],
    ];

    for (const [code, name, head] of deptSpecs) {
      const byCode = db.prepare('SELECT id FROM departments WHERE code = ?').get(code) as { id: number } | undefined;
      if (byCode) {
        db.prepare('UPDATE departments SET name = ?, head_name = ? WHERE id = ?').run(name, head, byCode.id);
      } else {
        db.prepare('INSERT INTO departments (code, name, head_name) VALUES (?, ?, ?)').run(code, name, head);
      }
    }

    const getDeptId = (code: string) =>
      (db.prepare('SELECT id FROM departments WHERE code = ?').get(code) as { id: number }).id;

    // 6. Ensure all program codes exist (matching image codes 24BECSE, 25BECSE + additional programs)
    const legacyCourseRenames: Array<[string, string, string]> = [
      ['BTECH-CSE', '24BECSE', 'B.E. Computer Science & Engineering'],
      ['BTECH-ECE', '24BEECE', 'B.E. Electronics & Communication'],
      ['BTECH-MECH', '24BEMECH', 'B.E. Mechanical Engineering'],
      ['MBA-TECH', '24MBATM', 'MBA Technology Management'],
    ];
    for (const [oldCode, newCode, newName] of legacyCourseRenames) {
      const oldRow = db.prepare('SELECT id FROM courses WHERE code = ?').get(oldCode) as { id: number } | undefined;
      const newRow = db.prepare('SELECT id FROM courses WHERE code = ?').get(newCode) as { id: number } | undefined;
      if (oldRow && !newRow) {
        db.prepare('UPDATE courses SET code = ?, name = ? WHERE id = ?').run(newCode, newName, oldRow.id);
      }
    }

    const courseSpecs: Array<[string, string, string, string, number]> = [
      ['CSE', '24BECSE', 'B.E. Computer Science & Engineering', 'Undergraduate', 4],
      ['CSE', '25BECSE', 'B.E. CSE (Electives & DevOps Track)', 'Undergraduate', 4],
      ['ISE', '24BEISE', 'B.E. Information Science & Engineering', 'Undergraduate', 4],
      ['AIML', '24BEAIML', 'B.E. AI & Machine Learning', 'Undergraduate', 4],
      ['DS', '24BEDS', 'B.E. CSE (Data Science)', 'Undergraduate', 4],
      ['ECE', '24BEECE', 'B.E. Electronics & Communication', 'Undergraduate', 4],
      ['EEE', '24BEEEE', 'B.E. Electrical & Electronics', 'Undergraduate', 4],
      ['MECH', '24BEMECH', 'B.E. Mechanical Engineering', 'Undergraduate', 4],
      ['CIVIL', '24BECIVIL', 'B.E. Civil Engineering', 'Undergraduate', 4],
      ['MGMT', '24MBATM', 'MBA Technology Management', 'Postgraduate', 2],
    ];
    for (const [deptCode, code, name, level, years] of courseSpecs) {
      const dId = getDeptId(deptCode);
      const exists = db.prepare('SELECT id FROM courses WHERE code = ?').get(code) as { id: number } | undefined;
      if (!exists) {
        db.prepare(
          'INSERT INTO courses (department_id, code, name, degree_level, duration_years) VALUES (?, ?, ?, ?, ?)'
        ).run(dId, code, name, level, years);
      }
    }

    const getCourseId = (code: string) =>
      (db.prepare('SELECT id FROM courses WHERE code = ?').get(code) as { id: number }).id;

    // Ensure main demo student (24SUUBECS001) points to 24BECSE & Semester 5
    db.prepare(
      `UPDATE students SET department_id = ?, course_id = ?, academic_year_id = ?, semester_id = ?
       WHERE roll_number IN ('24SUUBECS001', '24SUUBECS002', '24SUUBECS019')`
    ).run(getDeptId('CSE'), getCourseId('24BECSE'), yr2026, sem5Id);

    // Ensure active campaigns point to Semester 5 and carry clear Sapthagiri names & QR tokens
    db.prepare(`UPDATE feedback_forms SET semester_id = ? WHERE is_active = 1`).run(sem5Id);

    const legacyCseForm = db
      .prepare(
        `SELECT id FROM feedback_forms WHERE qr_token IN ('MSU-FALL26-CSE', 'SNU-SEM5-CSE') OR title = 'Fall 2026 Mid-Semester Teaching & Lab Evaluation' LIMIT 1`
      )
      .get() as { id: number } | undefined;
    if (legacyCseForm) {
      const tokenConflict = db
        .prepare(`SELECT id FROM feedback_forms WHERE qr_token = 'SNU-SEM5-CSE' AND id != ?`)
        .get(legacyCseForm.id);
      if (!tokenConflict) {
        db.prepare(
          `UPDATE feedback_forms
           SET title = 'Semester 5 CSE Core & Elective Course Evaluation',
               description = 'Structured evaluation of faculty instruction, cloud and data engineering labs, and Semester 5 elective courses at Sapthagiri NPS University.',
               qr_token = 'SNU-SEM5-CSE',
               is_active = 1,
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(legacyCseForm.id);
      }
    }

    const legacyCampusForm = db
      .prepare(
        `SELECT id FROM feedback_forms WHERE qr_token IN ('MSU-FALL26-ALL', 'SNU-SEM5-CAMPUS') OR title = 'University-Wide Campus, Laboratory & Course Feedback (Fall 2026)' LIMIT 1`
      )
      .get() as { id: number } | undefined;
    if (legacyCampusForm) {
      const tokenConflict = db
        .prepare(`SELECT id FROM feedback_forms WHERE qr_token = 'SNU-SEM5-CAMPUS' AND id != ?`)
        .get(legacyCampusForm.id);
      if (!tokenConflict) {
        db.prepare(
          `UPDATE feedback_forms
           SET title = 'Sapthagiri Campus Facilities & Academic Experience Survey',
               description = 'University-wide student survey covering smart classrooms, laboratory equipment, library infrastructure, examination clarity, and support services.',
               qr_token = 'SNU-SEM5-CAMPUS',
               is_active = 1,
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(legacyCampusForm.id);
      }
    }

    // Backfill receipt_token for any existing submissions so every submission QR works via Google Scan
    const missingTokenRows = db
      .prepare(`SELECT id FROM feedback_submissions WHERE receipt_token IS NULL OR receipt_token = ''`)
      .all() as Array<{ id: number }>;
    const updateReceiptToken = db.prepare(`UPDATE feedback_submissions SET receipt_token = ? WHERE id = ?`);
    for (const row of missingTokenRows) {
      const token = `SNU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      updateReceiptToken.run(token, row.id);
    }

    // 7. Ensure all 9 faculty members from the uploaded timetable image exist
    const imageFacultySpecs: Array<{
      email: string;
      name: string;
      deptCode: string;
      empCode: string;
      designation: string;
      spec: string;
    }> = [
      {
        email: 'lokesh.hd@sapthagiri.edu',
        name: 'LOKESH HD',
        deptCode: 'CSE',
        empCode: 'FAC-201',
        designation: 'Associate Professor',
        spec: 'Cloud Computing & Distributed Systems',
      },
      {
        email: 'raghavendrarao.b@sapthagiri.edu',
        name: 'DR. RAGHAVENDRARAO B',
        deptCode: 'CSE',
        empCode: 'FAC-202',
        designation: 'Professor & HOD',
        spec: 'Big Data Analytics & Data Engineering',
      },
      {
        email: 'preetheshnaatha.sr@sapthagiri.edu',
        name: 'Preetheshnaatha S R',
        deptCode: 'AIML',
        empCode: 'FAC-203',
        designation: 'Assistant Professor',
        spec: 'Machine Learning & Neural Networks',
      },
      {
        email: 'deepashree.hl@sapthagiri.edu',
        name: 'Deepashree H L',
        deptCode: 'CSE',
        empCode: 'FAC-204',
        designation: 'Assistant Professor',
        spec: 'Automata Theory & Compiler Design',
      },
      {
        email: 'bhavya.a@sapthagiri.edu',
        name: 'Bhavya A',
        deptCode: 'MGMT',
        empCode: 'FAC-205',
        designation: 'Assistant Professor',
        spec: 'Digital Marketing & E-Commerce',
      },
      {
        email: 'nikitha.k@sapthagiri.edu',
        name: 'Nikitha K',
        deptCode: 'CSE',
        empCode: 'FAC-206',
        designation: 'Assistant Professor',
        spec: 'Professional Ethics & Human Values',
      },
      {
        email: 'shivakumara.b@sapthagiri.edu',
        name: 'Shivakumara B',
        deptCode: 'DS',
        empCode: 'FAC-207',
        designation: 'Associate Professor',
        spec: 'Data Mining & Data Wrangling',
      },
      {
        email: 'vijayalakshmi.hr@sapthagiri.edu',
        name: 'Vijayalakshmi H R',
        deptCode: 'ISE',
        empCode: 'FAC-208',
        designation: 'Assistant Professor',
        spec: 'Software Testing & Quality Assurance',
      },
      {
        email: 'shruthi@sapthagiri.edu',
        name: 'Shruthi',
        deptCode: 'CSE',
        empCode: 'FAC-209',
        designation: 'Assistant Professor',
        spec: 'DevOps & Cloud Automation',
      },
    ];

    const facMap = new Map<string, number>();
    for (const f of imageFacultySpecs) {
      let userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(f.email) as { id: number } | undefined;
      if (!userRow) {
        const res = db
          .prepare(`INSERT INTO users (email, password_hash, full_name, role, preferred_language) VALUES (?, ?, ?, 'faculty', 'en')`)
          .run(f.email, demoPass, f.name);
        userRow = { id: Number(res.lastInsertRowid) };
      }
      let facRow = db.prepare('SELECT id FROM faculty WHERE user_id = ?').get(userRow.id) as { id: number } | undefined;
      if (!facRow) {
        const fRes = db
          .prepare(`INSERT INTO faculty (user_id, department_id, employee_code, designation, specialization) VALUES (?, ?, ?, ?, ?)`)
          .run(userRow.id, getDeptId(f.deptCode), f.empCode, f.designation, f.spec);
        facRow = { id: Number(fRes.lastInsertRowid) };
      }
      facMap.set(f.empCode, facRow.id);
    }

    // 8. Ensure all 9 subjects from the uploaded image + multi-semester / multi-dept subjects exist
    const subjectSpecs: Array<{
      deptCode: string;
      courseCode: string;
      semId: number;
      empCode: string;
      code: string;
      shortCode: string;
      electiveGroup: string;
      name: string;
      credits: number;
    }> = [
      // Exact 9 subjects from uploaded table (Semester 5)
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem5Id, empCode: 'FAC-201', code: '24BECSE501', shortCode: 'CCT', electiveGroup: 'Core', name: 'Cloud Computing Technology', credits: 4 },
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem5Id, empCode: 'FAC-202', code: '24BECSE502', shortCode: 'BDT', electiveGroup: 'Core', name: 'Big Data Tools and Techniques', credits: 4 },
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem5Id, empCode: 'FAC-203', code: '24BECSE503', shortCode: 'ML', electiveGroup: 'Core', name: 'Machine Learning', credits: 4 },
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem5Id, empCode: 'FAC-204', code: '24BECSE504', shortCode: 'FLAT', electiveGroup: 'Core', name: 'Formal Languages and Automata Theory', credits: 4 },
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem5Id, empCode: 'FAC-205', code: '24BECSE505', shortCode: 'DM', electiveGroup: 'Core', name: 'Digital Marketing', credits: 3 },
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem5Id, empCode: 'FAC-206', code: '24BECSE506', shortCode: 'PEHV', electiveGroup: 'Core', name: 'Professional Ethics and Human Values', credits: 2 },
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem5Id, empCode: 'FAC-207', code: '24BECSE521', shortCode: 'DWM', electiveGroup: 'Professional Elective II (24BECSE52X)', name: 'Data Mining and Wrangling', credits: 3 },
      { deptCode: 'CSE', courseCode: '25BECSE', semId: sem5Id, empCode: 'FAC-208', code: '25BECSE522', shortCode: 'ST', electiveGroup: 'Professional Elective II (24BECSE52X)', name: 'Software Testing', credits: 3 },
      { deptCode: 'CSE', courseCode: '25BECSE', semId: sem5Id, empCode: 'FAC-209', code: '25BECSE533', shortCode: 'FOD', electiveGroup: 'Professional Elective III (24BECSE53X)', name: 'Foundations of DevOps', credits: 3 },
      // Additional subjects covering Semesters 1..8 & Additional Departments
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem1Id, empCode: 'FAC-204', code: '24BECSE101', shortCode: 'PSP', electiveGroup: 'Core', name: 'Problem Solving with Python', credits: 4 },
      { deptCode: 'ISE', courseCode: '24BEISE', semId: sem2Id, empCode: 'FAC-208', code: '24BEISE201', shortCode: 'DSA', electiveGroup: 'Core', name: 'Data Structures & Applications', credits: 4 },
      { deptCode: 'AIML', courseCode: '24BEAIML', semId: sem3Id, empCode: 'FAC-203', code: '24BEAIML301', shortCode: 'FAI', electiveGroup: 'Core', name: 'Foundations of Artificial Intelligence', credits: 4 },
      { deptCode: 'DS', courseCode: '24BEDS', semId: sem4Id, empCode: 'FAC-207', code: '24BEDS401', shortCode: 'PDS', electiveGroup: 'Core', name: 'Probability & Data Science', credits: 4 },
      { deptCode: 'EEE', courseCode: '24BEEEE', semId: sem6Id, empCode: 'FAC-201', code: '24BEEEE601', shortCode: 'PSG', electiveGroup: 'Core', name: 'Power Systems & Smart Grids', credits: 4 },
      { deptCode: 'CIVIL', courseCode: '24BECIVIL', semId: sem7Id, empCode: 'FAC-202', code: '24BECIV701', shortCode: 'SA', electiveGroup: 'Core', name: 'Structural Analysis & Geotech', credits: 4 },
      { deptCode: 'CSE', courseCode: '24BECSE', semId: sem8Id, empCode: 'FAC-209', code: '24BECSE801', shortCode: 'CAP', electiveGroup: 'Project', name: 'Major Capstone Project & Viva', credits: 8 },
    ];

    for (const s of subjectSpecs) {
      const facId = facMap.get(s.empCode) ?? null;
      const existingSub = db.prepare('SELECT id FROM subjects WHERE code = ?').get(s.code) as { id: number } | undefined;
      if (existingSub) {
        db.prepare(
          `UPDATE subjects SET department_id = ?, course_id = ?, semester_id = ?, faculty_id = ?, short_code = ?, elective_group = ?, name = ?, credits = ? WHERE id = ?`
        ).run(getDeptId(s.deptCode), getCourseId(s.courseCode), s.semId, facId, s.shortCode, s.electiveGroup, s.name, s.credits, existingSub.id);
      } else {
        db.prepare(
          `INSERT INTO subjects (department_id, course_id, semester_id, faculty_id, code, short_code, elective_group, name, credits)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(getDeptId(s.deptCode), getCourseId(s.courseCode), s.semId, facId, s.code, s.shortCode, s.electiveGroup, s.name, s.credits);
      }
    }

    // 9. Ensure sample feedback submissions exist for 24SUUBECS001 and image subjects
    const primaryForm = db
      .prepare(`SELECT id FROM feedback_forms WHERE is_active = 1 ORDER BY id ASC LIMIT 1`)
      .get() as { id: number } | undefined;
    const secondaryForm = db
      .prepare(`SELECT id FROM feedback_forms WHERE is_active = 1 ORDER BY id DESC LIMIT 1`)
      .get() as { id: number } | undefined;
    const primaryStudent = db
      .prepare(`SELECT id FROM students WHERE roll_number = '24SUUBECS001' LIMIT 1`)
      .get() as { id: number } | undefined;
    const peerStudent = db
      .prepare(`SELECT id FROM students WHERE roll_number = '24SUUBECS002' LIMIT 1`)
      .get() as { id: number } | undefined;

    if (primaryForm && primaryStudent) {
      const sampleImageFeedbacks: Array<{
        formId: number;
        stuId: number;
        subCode: string;
        anon: number;
        comment: string;
        ratings: [number, number, number, number, number, number, number, number];
      }> = [
        {
          formId: primaryForm.id,
          stuId: primaryStudent.id,
          subCode: '24BECSE501',
          anon: 1,
          comment: 'LOKESH HD demonstrates AWS/GCP virtualization labs clearly. Cloud lab bandwidth is solid in morning sessions.',
          ratings: [4.8, 4.7, 4.9, 4.9, 4.7, 4.4, 4.2, 4.8],
        },
        {
          formId: primaryForm.id,
          stuId: primaryStudent.id,
          subCode: '24BECSE502',
          anon: 0,
          comment: 'DR. RAGHAVENDRARAO B covers Hadoop, Spark, and real streaming pipelines thoroughly with hands-on datasets.',
          ratings: [4.9, 4.8, 5.0, 5.0, 4.8, 4.5, 4.3, 4.9],
        },
        {
          formId: primaryForm.id,
          stuId: primaryStudent.id,
          subCode: '24BECSE503',
          anon: 1,
          comment: 'Preetheshnaatha S R connects gradient descent and SVM math clearly to Python notebooks.',
          ratings: [4.7, 4.6, 4.8, 4.9, 4.6, 4.3, 4.1, 4.7],
        },
        {
          formId: secondaryForm?.id ?? primaryForm.id,
          stuId: peerStudent?.id ?? primaryStudent.id,
          subCode: '24BECSE521',
          anon: 1,
          comment: 'Shivakumara B explains ETL wrangling and clustering well. Extra GPU lab workstations would be helpful.',
          ratings: [4.6, 4.5, 4.7, 4.8, 4.4, 4.0, 3.5, 4.5],
        },
        {
          formId: secondaryForm?.id ?? primaryForm.id,
          stuId: peerStudent?.id ?? primaryStudent.id,
          subCode: '25BECSE522',
          anon: 0,
          comment: 'Vijayalakshmi H R covers automated test suites, Selenium, and boundary value testing systematically.',
          ratings: [4.7, 4.7, 4.8, 4.8, 4.6, 4.4, 4.2, 4.7],
        },
        {
          formId: secondaryForm?.id ?? primaryForm.id,
          stuId: peerStudent?.id ?? primaryStudent.id,
          subCode: '25BECSE533',
          anon: 1,
          comment: 'Shruthi walks through Docker containers, CI/CD pipelines, and Kubernetes manifests step-by-step.',
          ratings: [4.8, 4.7, 4.9, 4.8, 4.7, 4.3, 4.1, 4.8],
        },
      ];

      for (const item of sampleImageFeedbacks) {
        const subRow = db
          .prepare('SELECT id, faculty_id FROM subjects WHERE code = ?')
          .get(item.subCode) as { id: number; faculty_id: number | null } | undefined;
        if (!subRow) continue;

        const dup = db
          .prepare('SELECT id FROM feedback_submissions WHERE form_id = ? AND student_id = ? AND subject_id = ?')
          .get(item.formId, item.stuId, subRow.id);
        if (dup) continue;

        const receiptToken = `SNU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const subRes = db
          .prepare(
            `INSERT INTO feedback_submissions (form_id, student_id, subject_id, faculty_id, status, is_anonymous, comment_text, receipt_token)
             VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?)`
          )
          .run(item.formId, item.stuId, subRow.id, subRow.faculty_id, item.anon, item.comment, receiptToken);
        const subId = Number(subRes.lastInsertRowid);
        db.prepare(
          `INSERT INTO feedback_ratings (submission_id, teaching_quality, communication, punctuality, subject_knowledge, methodology, classroom_environment, infrastructure, overall_satisfaction)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(subId, ...item.ratings);
      }
    }
  });

  syncTx();
}

export function seedDatabase(): void {
  const existingUsers = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  if (existingUsers.cnt > 0) {
    ensureSapthagiriCurriculumSynced();
    return;
  }

  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, full_name, role, preferred_language, phone) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertDept = db.prepare(
    `INSERT INTO departments (code, name, head_name) VALUES (?, ?, ?)`
  );
  const insertYear = db.prepare(
    `INSERT INTO academic_years (label, start_date, end_date, is_current) VALUES (?, ?, ?, ?)`
  );
  const insertSem = db.prepare(
    `INSERT INTO semesters (academic_year_id, name, term_order, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertCourse = db.prepare(
    `INSERT INTO courses (department_id, code, name, degree_level, duration_years) VALUES (?, ?, ?, ?, ?)`
  );
  const insertFaculty = db.prepare(
    `INSERT INTO faculty (user_id, department_id, employee_code, designation, specialization) VALUES (?, ?, ?, ?, ?)`
  );
  const insertStudent = db.prepare(
    `INSERT INTO students (user_id, department_id, course_id, academic_year_id, semester_id, roll_number, batch_year) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSubject = db.prepare(
    `INSERT INTO subjects (department_id, course_id, semester_id, faculty_id, code, name, credits) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertForm = db.prepare(
    `INSERT INTO feedback_forms (title, description, department_id, course_id, subject_id, academic_year_id, semester_id, open_date, close_date, is_active, allow_anonymous, qr_token, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertQuestion = db.prepare(
    `INSERT INTO feedback_questions (form_id, question_text, question_type, category, is_required, sort_order, options_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSubmission = db.prepare(
    `INSERT INTO feedback_submissions (form_id, student_id, subject_id, faculty_id, status, is_anonymous, comment_text, receipt_token, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertRating = db.prepare(
    `INSERT INTO feedback_ratings (submission_id, teaching_quality, communication, punctuality, subject_knowledge, methodology, classroom_environment, infrastructure, overall_satisfaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertResponse = db.prepare(
    `INSERT INTO feedback_responses (submission_id, question_id, response_value, numeric_score) VALUES (?, ?, ?, ?)`
  );
  const insertNotification = db.prepare(
    `INSERT INTO notifications (user_id, target_role, title, message, category) VALUES (?, ?, ?, ?, ?)`
  );
  const insertAudit = db.prepare(
    `INSERT INTO audit_logs (user_id, user_email, user_role, action, entity_type, entity_id, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const runSeed = db.transaction(() => {
    const demoPass = hashPassword('Meridian@2026');

    // Admin (Principal)
    const adminId = Number(
      insertUser.run('admin@meridian.edu', demoPass, 'Dr. H. Ramakrishna', 'admin', 'en', '+1-555-0100').lastInsertRowid
    );

    // Faculty users
    const facUserIds = [
      Number(insertUser.run('faculty@meridian.edu', demoPass, 'Prof. Arvind Krishnan', 'faculty', 'en', '+1-555-0101').lastInsertRowid),
      Number(insertUser.run('claire.bennett@meridian.edu', demoPass, 'Dr. Claire Bennett', 'faculty', 'en', '+1-555-0102').lastInsertRowid),
      Number(insertUser.run('rajesh.naik@meridian.edu', demoPass, 'Prof. Rajesh Naik', 'faculty', 'kn', '+1-555-0103').lastInsertRowid),
      Number(insertUser.run('meera.reddy@meridian.edu', demoPass, 'Dr. Meera Reddy', 'faculty', 'te', '+1-555-0104').lastInsertRowid),
      Number(insertUser.run('david.okafor@meridian.edu', demoPass, 'Dr. David Okafor', 'faculty', 'en', '+1-555-0105').lastInsertRowid),
    ];

    // Student users
    const stuUserIds = [
      Number(insertUser.run('student@meridian.edu', demoPass, 'Aarav Sharma', 'student', 'en', '+1-555-0201').lastInsertRowid),
      Number(insertUser.run('ananya.rao@meridian.edu', demoPass, 'Ananya Rao', 'student', 'kn', '+1-555-0202').lastInsertRowid),
      Number(insertUser.run('vikram.desai@meridian.edu', demoPass, 'Vikram Desai', 'student', 'hi', '+1-555-0203').lastInsertRowid),
      Number(insertUser.run('sreya.nair@meridian.edu', demoPass, 'Sreya Nair', 'student', 'te', '+1-555-0204').lastInsertRowid),
      Number(insertUser.run('lucas.meyer@meridian.edu', demoPass, 'Lucas Meyer', 'student', 'en', '+1-555-0205').lastInsertRowid),
      Number(insertUser.run('priya.kulkarni@meridian.edu', demoPass, 'Priya Kulkarni', 'student', 'kn', '+1-555-0206').lastInsertRowid),
    ];

    // Departments (initial 4; ensureSapthagiriCurriculumSynced expands to all 9 + programs + semesters 1-8)
    const deptIds = [
      Number(insertDept.run('CSE', 'Computer Science & Engineering', 'DR. RAGHAVENDRARAO B').lastInsertRowid),
      Number(insertDept.run('ECE', 'Electronics & Communication Engineering', 'Dr. Claire Bennett').lastInsertRowid),
      Number(insertDept.run('MECH', 'Mechanical Engineering', 'Prof. Rajesh Naik').lastInsertRowid),
      Number(insertDept.run('MGMT', 'School of Management', 'Dr. Meera Reddy').lastInsertRowid),
    ];

    // Academic Years
    const yr2025 = Number(insertYear.run('2025-2026', '2025-08-01', '2026-05-31', 0).lastInsertRowid);
    const yr2026 = Number(insertYear.run('2026-2027', '2026-08-01', '2027-05-31', 1).lastInsertRowid);

    // Semesters
    const sem1 = Number(insertSem.run(yr2025, 'Semester 3', 3, '2025-08-01', '2025-12-20', 0).lastInsertRowid);
    const sem2 = Number(insertSem.run(yr2025, 'Semester 4', 4, '2026-01-10', '2026-05-30', 0).lastInsertRowid);
    const sem3 = Number(insertSem.run(yr2026, 'Semester 5', 5, '2026-08-01', '2026-12-22', 1).lastInsertRowid);
    const sem4 = Number(insertSem.run(yr2026, 'Semester 6', 6, '2027-01-10', '2027-05-30', 0).lastInsertRowid);

    // Courses
    const courseIds = [
      Number(insertCourse.run(deptIds[0], '24BECSE', 'B.E. Computer Science & Engineering', 'Undergraduate', 4).lastInsertRowid),
      Number(insertCourse.run(deptIds[1], '24BEECE', 'B.E. Electronics & Communication', 'Undergraduate', 4).lastInsertRowid),
      Number(insertCourse.run(deptIds[2], '24BEMECH', 'B.E. Mechanical Engineering', 'Undergraduate', 4).lastInsertRowid),
      Number(insertCourse.run(deptIds[3], '24MBATM', 'MBA Technology Management', 'Postgraduate', 2).lastInsertRowid),
    ];

    // Faculty rows
    const facultyIds = [
      Number(insertFaculty.run(facUserIds[0], deptIds[0], 'FAC-101', 'Professor & Chair', 'Distributed Systems & AI').lastInsertRowid),
      Number(insertFaculty.run(facUserIds[1], deptIds[1], 'FAC-102', 'Associate Professor', 'VLSI & Embedded Systems').lastInsertRowid),
      Number(insertFaculty.run(facUserIds[2], deptIds[2], 'FAC-103', 'Professor', 'Thermodynamics & Robotics').lastInsertRowid),
      Number(insertFaculty.run(facUserIds[3], deptIds[3], 'FAC-104', 'Associate Professor', 'Quantitative Operations').lastInsertRowid),
      Number(insertFaculty.run(facUserIds[4], deptIds[0], 'FAC-105', 'Assistant Professor', 'Database Systems & Cloud').lastInsertRowid),
    ];

    // Student rows (24SUUBECS001 format)
    const studentIds = [
      Number(insertStudent.run(stuUserIds[0], deptIds[0], courseIds[0], yr2026, sem3, '24SUUBECS001', 2024).lastInsertRowid),
      Number(insertStudent.run(stuUserIds[1], deptIds[0], courseIds[0], yr2026, sem3, '24SUUBECS002', 2024).lastInsertRowid),
      Number(insertStudent.run(stuUserIds[2], deptIds[1], courseIds[1], yr2026, sem3, '24SUUBEEC014', 2024).lastInsertRowid),
      Number(insertStudent.run(stuUserIds[3], deptIds[2], courseIds[2], yr2026, sem3, '24SUUBEME008', 2024).lastInsertRowid),
      Number(insertStudent.run(stuUserIds[4], deptIds[3], courseIds[3], yr2026, sem3, '24SUUMBTM011', 2024).lastInsertRowid),
      Number(insertStudent.run(stuUserIds[5], deptIds[0], courseIds[0], yr2026, sem3, '24SUUBECS019', 2024).lastInsertRowid),
    ];

    // Core legacy subjects across semesters
    const subjIds = [
      Number(insertSubject.run(deptIds[0], courseIds[0], sem3, facultyIds[0], 'CS301', 'Distributed Systems Architecture', 4).lastInsertRowid),
      Number(insertSubject.run(deptIds[0], courseIds[0], sem3, facultyIds[4], 'CS304', 'Database Management Systems', 4).lastInsertRowid),
      Number(insertSubject.run(deptIds[1], courseIds[1], sem3, facultyIds[1], 'EC205', 'Embedded Microcontrollers Lab', 3).lastInsertRowid),
      Number(insertSubject.run(deptIds[2], courseIds[2], sem3, facultyIds[2], 'ME210', 'Applied Thermodynamics', 4).lastInsertRowid),
      Number(insertSubject.run(deptIds[3], courseIds[3], sem3, facultyIds[3], 'MG402', 'Enterprise Analytics & Strategy', 3).lastInsertRowid),
      Number(insertSubject.run(deptIds[0], courseIds[0], sem2, facultyIds[0], 'CS202', 'Algorithms & Complexity', 4).lastInsertRowid),
      Number(insertSubject.run(deptIds[1], courseIds[1], sem1, facultyIds[1], 'EC104', 'Digital Signal Processing', 4).lastInsertRowid),
    ];

    // Feedback Forms (2 active for Semester 5, 1 historical, 1 upcoming)
    const formFallCSE = Number(
      insertForm.run(
        'Semester 5 CSE Core & Elective Course Evaluation',
        'Structured evaluation of faculty instruction, cloud and data engineering labs, and Semester 5 elective courses at Sapthagiri NPS University.',
        deptIds[0],
        courseIds[0],
        null,
        yr2026,
        sem3,
        '2026-10-01',
        '2026-12-20',
        1,
        1,
        'SNU-SEM5-CSE',
        adminId
      ).lastInsertRowid
    );

    const formFallAll = Number(
      insertForm.run(
        'Sapthagiri Campus Facilities & Academic Experience Survey',
        'University-wide student survey covering smart classrooms, laboratory equipment, library infrastructure, examination clarity, and support services.',
        null,
        null,
        null,
        yr2026,
        sem3,
        '2026-10-15',
        '2026-12-28',
        1,
        1,
        'SNU-SEM5-CAMPUS',
        adminId
      ).lastInsertRowid
    );

    const formSpringPrev = Number(
      insertForm.run(
        'Spring 2026 End-Term Academic Review',
        'Archived end-semester evaluation used for longitudinal semester-over-semester satisfaction comparisons.',
        null,
        null,
        null,
        yr2025,
        sem2,
        '2026-04-01',
        '2026-05-25',
        0,
        1,
        'MSU-SPR26-END',
        adminId
      ).lastInsertRowid
    );

    insertForm.run(
      'Spring 2027 Pre-Term Curriculum Readiness Survey',
      'Scheduled evaluation campaign opening in January 2027 for Spring courses.',
      null,
      null,
      null,
      yr2026,
      sem4,
      '2027-01-15',
      '2027-03-15',
      0,
      1,
      'MSU-SPR27-PRE',
      adminId
    );

    // Custom questions for active forms
    const q1 = Number(
      insertQuestion.run(formFallCSE, 'How effectively does the instructor explain complex theoretical concepts?', 'star', 'Teaching Quality', 1, 1, null).lastInsertRowid
    );
    const q2 = Number(
      insertQuestion.run(formFallCSE, 'Rate the adequacy and working condition of laboratory workstations and software.', 'slider', 'Laboratory Facilities', 1, 2, null).lastInsertRowid
    );
    const q3 = Number(
      insertQuestion.run(formFallCSE, 'Was assessment grading transparent and returned within the promised timeline?', 'radio', 'Examination and Evaluation', 1, 3, JSON.stringify(['Always timely & clear', 'Mostly timely', 'Delayed feedback', 'Needs major improvement'])).lastInsertRowid
    );
    const q4 = Number(
      insertQuestion.run(formFallCSE, 'Share specific strengths or constructive suggestions for course improvement.', 'text', 'Other', 0, 4, null).lastInsertRowid
    );

    const qAll1 = Number(
      insertQuestion.run(formFallAll, 'How clearly are learning objectives and weekly schedules communicated?', 'star', 'Communication', 1, 1, null).lastInsertRowid
    );
    const qAll2 = Number(
      insertQuestion.run(formFallAll, 'Rate classroom projection, Wi-Fi reliability, and seating comfort.', 'slider', 'Infrastructure', 1, 2, null).lastInsertRowid
    );
    const qAll3 = Number(
      insertQuestion.run(formFallAll, 'How helpful are the prescribed digital textbooks and lecture notes?', 'radio', 'Learning Resources', 1, 3, JSON.stringify(['Highly supportive', 'Adequate', 'Limited', 'Outdated'])).lastInsertRowid
    );

    // Historical & current submissions (realistic ratings across semesters/departments/teachers)
    const sampleSubmissions: Array<{
      formId: number;
      studentId: number;
      subjectId: number;
      facultyId: number;
      anon: number;
      comment: string;
      date: string;
      ratings: [number, number, number, number, number, number, number, number];
    }> = [
      {
        formId: formFallAll,
        studentId: studentIds[1],
        subjectId: subjIds[1],
        facultyId: facultyIds[4],
        anon: 0,
        comment: 'Dr. Okafor explains query optimization and indexing with live PostgreSQL benchmarks. However, two lab machines in Room 302 frequently freeze during Docker builds.',
        date: '2026-10-20 10:15:00',
        ratings: [4.7, 4.6, 4.8, 4.9, 4.5, 4.1, 3.1, 4.4],
      },
      {
        formId: formFallAll,
        studentId: studentIds[2],
        subjectId: subjIds[2],
        facultyId: facultyIds[1],
        anon: 1,
        comment: 'Oscilloscopes in the Embedded Lab need recalibration and more FPGA boards are required for teams. Dr. Bennett is very approachable during office hours.',
        date: '2026-10-24 14:30:00',
        ratings: [4.5, 4.6, 4.7, 4.8, 4.3, 3.8, 2.7, 4.1],
      },
      {
        formId: formFallAll,
        studentId: studentIds[3],
        subjectId: subjIds[3],
        facultyId: facultyIds[2],
        anon: 1,
        comment: 'Lectures move too fast through entropy derivation without worked numericals. Classroom AC in Hall B2 has been non-functional for two weeks.',
        date: '2026-11-02 09:45:00',
        ratings: [2.8, 2.9, 3.6, 4.2, 2.5, 2.2, 2.4, 2.7],
      },
      {
        formId: formFallAll,
        studentId: studentIds[4],
        subjectId: subjIds[4],
        facultyId: facultyIds[3],
        anon: 0,
        comment: 'Case studies from Indian and global supply chains made Enterprise Analytics genuinely engaging. Midterm rubric feedback arrived promptly.',
        date: '2026-11-06 16:20:00',
        ratings: [4.9, 4.8, 4.9, 4.9, 4.8, 4.6, 4.5, 4.8],
      },
      {
        formId: formFallCSE,
        studentId: studentIds[5],
        subjectId: subjIds[0],
        facultyId: facultyIds[0],
        anon: 1,
        comment: 'Prof. Krishnan connects Raft consensus theory directly to real cloud failure modes. Would appreciate extra practice problems before the end-term exam.',
        date: '2026-11-10 11:05:00',
        ratings: [4.8, 4.7, 4.9, 5.0, 4.6, 4.4, 4.2, 4.7],
      },
      {
        formId: formFallCSE,
        studentId: studentIds[1],
        subjectId: subjIds[0],
        facultyId: facultyIds[0],
        anon: 0,
        comment: 'Clear slides, structured weekly lab sheets, and responsive Q&A on the course forum. Wi-Fi bandwidth drops occasionally during afternoon labs.',
        date: '2026-11-12 15:40:00',
        ratings: [4.7, 4.8, 4.8, 4.9, 4.7, 4.2, 3.4, 4.6],
      },
      {
        formId: formSpringPrev,
        studentId: studentIds[0],
        subjectId: subjIds[5],
        facultyId: facultyIds[0],
        anon: 0,
        comment: 'Algorithms & Complexity was rigorous and well-paced. Weekly coding clinics helped bridge graph theory proofs.',
        date: '2026-05-10 13:00:00',
        ratings: [4.6, 4.5, 4.7, 4.8, 4.5, 4.2, 4.0, 4.5],
      },
      {
        formId: formSpringPrev,
        studentId: studentIds[1],
        subjectId: subjIds[5],
        facultyId: facultyIds[0],
        anon: 1,
        comment: 'Good conceptual coverage, though assignment grading took nearly three weeks during mid-semester.',
        date: '2026-05-12 17:15:00',
        ratings: [4.3, 4.2, 4.4, 4.7, 4.1, 4.0, 3.9, 4.1],
      },
      {
        formId: formSpringPrev,
        studentId: studentIds[2],
        subjectId: subjIds[6],
        facultyId: facultyIds[1],
        anon: 0,
        comment: 'Digital Signal Processing labs with MATLAB live scripts clarified Fourier transforms clearly.',
        date: '2026-05-14 11:30:00',
        ratings: [4.4, 4.5, 4.6, 4.7, 4.4, 4.1, 3.8, 4.4],
      },
      {
        formId: formSpringPrev,
        studentId: studentIds[3],
        subjectId: subjIds[3],
        facultyId: facultyIds[2],
        anon: 1,
        comment: 'Need more real engine teardown demonstrations and clearer exam blueprint before finals.',
        date: '2026-05-16 12:10:00',
        ratings: [3.2, 3.1, 3.8, 4.1, 3.0, 3.0, 2.9, 3.1],
      },
      {
        formId: formSpringPrev,
        studentId: studentIds[4],
        subjectId: subjIds[4],
        facultyId: facultyIds[3],
        anon: 0,
        comment: 'Excellent quantitative modeling workshops and constructive project review sessions.',
        date: '2026-05-18 16:45:00',
        ratings: [4.7, 4.8, 4.7, 4.8, 4.7, 4.5, 4.4, 4.7],
      },
      {
        formId: formSpringPrev,
        studentId: studentIds[5],
        subjectId: subjIds[1],
        facultyId: facultyIds[4],
        anon: 1,
        comment: 'Strong database normalization lectures, but lab systems need SSD upgrades for large datasets.',
        date: '2026-05-20 10:05:00',
        ratings: [4.5, 4.4, 4.6, 4.8, 4.4, 3.9, 3.0, 4.2],
      },
    ];

    for (const s of sampleSubmissions) {
      const receiptToken = `SNU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const subId = Number(
        insertSubmission.run(s.formId, s.studentId, s.subjectId, s.facultyId, 'submitted', s.anon, s.comment, receiptToken, s.date).lastInsertRowid
      );
      insertRating.run(subId, ...s.ratings);

      if (s.formId === formFallCSE) {
        insertResponse.run(subId, q1, String(s.ratings[0]), s.ratings[0]);
        insertResponse.run(subId, q2, String(s.ratings[6]), s.ratings[6]);
        insertResponse.run(subId, q3, 'Always timely & clear', null);
        insertResponse.run(subId, q4, s.comment, null);
      } else if (s.formId === formFallAll) {
        insertResponse.run(subId, qAll1, String(s.ratings[1]), s.ratings[1]);
        insertResponse.run(subId, qAll2, String(s.ratings[6]), s.ratings[6]);
        insertResponse.run(subId, qAll3, 'Highly supportive', null);
      }
    }

    // Notifications
    insertNotification.run(
      null,
      'student',
      'Fall 2026 Feedback Window Active',
      'Please submit your course and laboratory evaluations before December 20, 2026 to help improve campus resources.',
      'campaign'
    );
    insertNotification.run(
      null,
      'student',
      'Upcoming Deadline Reminder',
      'Mid-Semester Teaching & Lab Evaluation closes in 29 days. Drafts can be edited until the closing deadline.',
      'deadline'
    );
    insertNotification.run(
      null,
      'admin',
      'Mechanical Engineering Infrastructure Flag',
      'Recent submissions report ventilation issues in Hall B2 and pacing concerns in Applied Thermodynamics.',
      'alert'
    );

    // Initial Audit Logs
    insertAudit.run(adminId, 'admin@meridian.edu', 'admin', 'SYSTEM_INITIALIZED', 'database', 1, JSON.stringify({ tables: 18 }), '127.0.0.1');
    insertAudit.run(adminId, 'admin@meridian.edu', 'admin', 'CAMPAIGN_ACTIVATED', 'feedback_forms', formFallCSE, JSON.stringify({ title: 'Semester 5 CSE Core & Elective Course Evaluation' }), '127.0.0.1');
  });

  runSeed();
  ensureSapthagiriCurriculumSynced();
}
