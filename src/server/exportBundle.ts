import JSZip from 'jszip';

export interface ExportFileEntry {
  path: string;
  content: string;
  category: 'Database' | 'Backend (Flask)' | 'Frontend (HTML/CSS/JS)' | 'DevOps & Vercel' | 'Tests & Docs';
}

export function getFlaskMysqlVercelFiles(): ExportFileEntry[] {
  const schemaSql = `-- Sapthagiri NPS University: Online Student Feedback Collection System
-- MySQL 8.0+ Normalized Relational Schema (18 Tables)

CREATE DATABASE IF NOT EXISTS student_feedback_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE student_feedback_db;

CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role ENUM('student', 'faculty', 'admin') NOT NULL DEFAULT 'student',
  preferred_language ENUM('en', 'hi', 'kn', 'te') NOT NULL DEFAULT 'en',
  phone VARCHAR(40),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE departments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL UNIQUE,
  head_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE academic_years (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(30) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE semesters (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  academic_year_id BIGINT NOT NULL,
  name VARCHAR(80) NOT NULL,
  term_order INT NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_year_sem (academic_year_id, name),
  CONSTRAINT fk_sem_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE courses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  department_id BIGINT NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  degree_level VARCHAR(60) NOT NULL DEFAULT 'Undergraduate',
  duration_years INT NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE faculty (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  department_id BIGINT NOT NULL,
  employee_code VARCHAR(40) NOT NULL UNIQUE,
  designation VARCHAR(120) NOT NULL DEFAULT 'Assistant Professor',
  specialization VARCHAR(200),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fac_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fac_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE students (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  department_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  academic_year_id BIGINT NOT NULL,
  semester_id BIGINT NOT NULL,
  roll_number VARCHAR(50) NOT NULL UNIQUE,
  batch_year INT NOT NULL DEFAULT 2026,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_stu_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stu_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stu_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stu_sem FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE subjects (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  department_id BIGINT NOT NULL,
  course_id BIGINT NOT NULL,
  semester_id BIGINT NOT NULL,
  faculty_id BIGINT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  short_code VARCHAR(20) NULL,
  elective_group VARCHAR(120) DEFAULT 'Core',
  name VARCHAR(150) NOT NULL,
  credits INT NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_sem FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_fac FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE feedback_forms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  department_id BIGINT NULL,
  course_id BIGINT NULL,
  subject_id BIGINT NULL,
  academic_year_id BIGINT NOT NULL,
  semester_id BIGINT NOT NULL,
  open_date DATE NOT NULL,
  close_date DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  allow_anonymous TINYINT(1) NOT NULL DEFAULT 1,
  qr_token VARCHAR(64) NOT NULL UNIQUE,
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_form_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_form_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  CONSTRAINT fk_form_sub FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  CONSTRAINT fk_form_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_form_sem FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT,
  CONSTRAINT fk_form_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE feedback_questions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  form_id BIGINT NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('star', 'slider', 'radio', 'text') NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Teaching Quality',
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 1,
  options_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_q_form FOREIGN KEY (form_id) REFERENCES feedback_forms(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE feedback_submissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  form_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  faculty_id BIGINT NULL,
  status ENUM('draft', 'submitted') NOT NULL DEFAULT 'submitted',
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  comment_text TEXT NOT NULL,
  receipt_token VARCHAR(64) NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_submission (form_id, student_id, subject_id),
  CONSTRAINT fk_subm_form FOREIGN KEY (form_id) REFERENCES feedback_forms(id) ON DELETE CASCADE,
  CONSTRAINT fk_subm_stu FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_subm_sub FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_subm_fac FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE feedback_ratings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL UNIQUE,
  teaching_quality DECIMAL(3,2) NOT NULL,
  communication DECIMAL(3,2) NOT NULL,
  punctuality DECIMAL(3,2) NOT NULL,
  subject_knowledge DECIMAL(3,2) NOT NULL,
  methodology DECIMAL(3,2) NOT NULL,
  classroom_environment DECIMAL(3,2) NOT NULL,
  infrastructure DECIMAL(3,2) NOT NULL,
  overall_satisfaction DECIMAL(3,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rat_subm FOREIGN KEY (submission_id) REFERENCES feedback_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE feedback_responses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  response_value TEXT NOT NULL,
  numeric_score DECIMAL(4,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_resp (submission_id, question_id),
  CONSTRAINT fk_resp_subm FOREIGN KEY (submission_id) REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_resp_q FOREIGN KEY (question_id) REFERENCES feedback_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ai_sentiment_analysis (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT NOT NULL UNIQUE,
  sentiment ENUM('Positive', 'Negative', 'Neutral') NOT NULL,
  confidence_score DECIMAL(4,3) NOT NULL DEFAULT 0.000,
  primary_category VARCHAR(80) NOT NULL DEFAULT 'Teaching Quality',
  urgency_level ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'low',
  key_phrases_json JSON NOT NULL,
  model_name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_sent_subm FOREIGN KEY (submission_id) REFERENCES feedback_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ai_feedback_summaries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scope_type ENUM('institutional', 'department', 'faculty', 'subject') NOT NULL,
  scope_id BIGINT NULL,
  summary_text TEXT NOT NULL,
  frequent_topics_json JSON NOT NULL,
  positive_highlights_json JSON NOT NULL,
  recurring_complaints_json JSON NOT NULL,
  model_name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE ai_recommendations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  target_type ENUM('faculty', 'department', 'institution') NOT NULL,
  target_id BIGINT NULL,
  recommendation_title VARCHAR(200) NOT NULL,
  recommendation_body TEXT NOT NULL,
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  is_alert TINYINT(1) NOT NULL DEFAULT 0,
  alert_reason TEXT NULL,
  reviewed_by_admin TINYINT(1) NOT NULL DEFAULT 0,
  model_name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  target_role ENUM('all', 'student', 'faculty', 'admin') NOT NULL DEFAULT 'all',
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  category ENUM('campaign', 'deadline', 'alert', 'system') NOT NULL DEFAULT 'campaign',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  user_email VARCHAR(255) NULL,
  user_role VARCHAR(40) NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT NULL,
  details_json JSON NOT NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
`;

  const seedSql = `-- Sapthagiri NPS University Sample Demonstration Seed Data
USE student_feedback_db;

INSERT INTO departments (code, name, head_name) VALUES
('CSE', 'Computer Science & Engineering', 'DR. RAGHAVENDRARAO B'),
('ISE', 'Information Science & Engineering', 'Dr. Claire Bennett'),
('AIML', 'Artificial Intelligence & Machine Learning', 'Preetheshnaatha S R'),
('DS', 'Computer Science (Data Science)', 'Shivakumara B'),
('ECE', 'Electronics & Communication Engineering', 'Dr. Claire Bennett'),
('EEE', 'Electrical & Electronics Engineering', 'Prof. Arvind Krishnan'),
('MECH', 'Mechanical Engineering', 'Prof. Rajesh Naik'),
('CIVIL', 'Civil Engineering', 'Dr. David Okafor'),
('MGMT', 'School of Management', 'Dr. Meera Reddy');

INSERT INTO academic_years (label, start_date, end_date, is_current) VALUES
('2024-2025', '2024-08-01', '2025-05-31', 0),
('2025-2026', '2025-08-01', '2026-05-31', 0),
('2026-2027', '2026-08-01', '2027-05-31', 1),
('2027-2028', '2027-08-01', '2028-05-31', 0);

INSERT INTO semesters (academic_year_id, name, term_order, start_date, end_date, is_current) VALUES
(1, 'Semester 1', 1, '2024-08-01', '2024-12-20', 0),
(1, 'Semester 2', 2, '2025-01-10', '2025-05-30', 0),
(2, 'Semester 3', 3, '2025-08-01', '2025-12-20', 0),
(2, 'Semester 4', 4, '2026-01-10', '2026-05-30', 0),
(3, 'Semester 5', 5, '2026-08-01', '2026-12-22', 1),
(3, 'Semester 6', 6, '2027-01-10', '2027-05-30', 0),
(4, 'Semester 7', 7, '2027-08-01', '2027-12-20', 0),
(4, 'Semester 8', 8, '2028-01-10', '2028-05-30', 0);

INSERT INTO courses (department_id, code, name, degree_level, duration_years) VALUES
(1, '24BECSE', 'B.E. Computer Science & Engineering', 'Undergraduate', 4),
(1, '25BECSE', 'B.E. CSE (Electives & DevOps Track)', 'Undergraduate', 4),
(2, '24BEISE', 'B.E. Information Science & Engineering', 'Undergraduate', 4),
(3, '24BEAIML', 'B.E. AI & Machine Learning', 'Undergraduate', 4),
(4, '24BEDS', 'B.E. CSE (Data Science)', 'Undergraduate', 4),
(5, '24BEECE', 'B.E. Electronics & Communication', 'Undergraduate', 4),
(6, '24BEEEE', 'B.E. Electrical & Electronics', 'Undergraduate', 4),
(7, '24BEMECH', 'B.E. Mechanical Engineering', 'Undergraduate', 4),
(8, '24BECIVIL', 'B.E. Civil Engineering', 'Undergraduate', 4),
(9, '24MBATM', 'MBA Technology Management', 'Postgraduate', 2);

INSERT INTO feedback_forms (title, description, department_id, course_id, academic_year_id, semester_id, open_date, close_date, is_active, allow_anonymous, qr_token) VALUES
('Semester 5 CSE Core & Elective Course Evaluation', 'Structured evaluation of faculty instruction, cloud and data engineering labs, and Semester 5 elective courses.', 1, 1, 3, 5, '2026-10-01', '2026-12-20', 1, 1, 'SNU-SEM5-CSE'),
('Sapthagiri Campus Facilities & Academic Experience Survey', 'University-wide student survey covering smart classrooms, laboratory equipment, library infrastructure, and student support.', NULL, NULL, 3, 5, '2026-10-15', '2026-12-28', 1, 1, 'SNU-SEM5-CAMPUS');
`;

  const configPy = `import os
from urllib.parse import quote_plus


class Config:
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", os.urandom(32).hex())
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", os.urandom(32).hex())
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")

    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "3306")
    DB_NAME = os.environ.get("DB_NAME", "student_feedback_db")
    DB_USER = os.environ.get("DB_USER", "root")
    DB_PASSWORD = quote_plus(os.environ.get("DB_PASSWORD", ""))

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        "pool_size": 5,
        "max_overflow": 10,
    }
`;

  const extensionsPy = `from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
`;

  const appPy = `from flask import Flask, jsonify
from backend.config import Config
from backend.extensions import db, migrate, jwt, cors
from backend.routes.auth import auth_bp
from backend.routes.feedback import feedback_bp
from backend.routes.analytics import analytics_bp
from backend.routes.ai_routes import ai_bp
from backend.routes.admin import admin_bp


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}},
        supports_credentials=True,
    )

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(feedback_bp, url_prefix="/api/feedback")
    app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "Sapthagiri NPS University Feedback API"})

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
`;

  const vercelPy = `from backend.app import app

# Vercel Python Serverless Function Entrypoint
`;

  const geminiPy = `import json
import os
from google import genai
from google.genai import types

MODEL_NAME = "gemini-4-hydrogen"


def _get_client():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return genai.Client(api_key=api_key)


def analyze_feedback_comment(comment_text: str, subject_name: str, overall_rating: float) -> dict:
    client = _get_client()
    prompt = (
        f"Analyze student feedback for {subject_name} (rating {overall_rating}/5): "
        f'"{comment_text}". Return JSON with keys: sentiment (Positive|Negative|Neutral), '
        "confidence_score (0..1), primary_category, urgency_level (low|medium|high)."
    )
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    return json.loads(response.text)
`;

  const authRoutesPy = `from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import text
from backend.extensions import db

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()
    if not email or len(password) < 8 or not full_name:
        return jsonify({"error": "Valid email, full name, and 8+ character password required"}), 400

    pw_hash = generate_password_hash(password)
    db.session.execute(
        text("INSERT INTO users (email, password_hash, full_name, role) VALUES (:e, :p, :n, 'student')"),
        {"e": email, "p": pw_hash, "n": full_name},
    )
    db.session.commit()
    return jsonify({"message": "Student registered successfully"}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    row = db.session.execute(
        text("SELECT id, email, password_hash, full_name, role FROM users WHERE email = :e"),
        {"e": email},
    ).mappings().first()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_access_token(identity=str(row["id"]), additional_claims={"role": row["role"]})
    return jsonify({"access_token": token, "user": {"id": row["id"], "email": row["email"], "full_name": row["full_name"], "role": row["role"]}})


@auth_bp.get("/profile")
@jwt_required()
def profile():
    user_id = get_jwt_identity()
    row = db.session.execute(
        text("SELECT id, email, full_name, role, preferred_language FROM users WHERE id = :id"),
        {"id": user_id},
    ).mappings().first()
    return jsonify(dict(row)) if row else (jsonify({"error": "Not found"}), 404)
`;

  const feedbackRoutesPy = `import hmac
import re
import secrets
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import text
from backend.extensions import db

feedback_bp = Blueprint("feedback", __name__)


@feedback_bp.get("/forms")
def list_forms():
    rows = db.session.execute(
        text("SELECT id, title, description, open_date, close_date, is_active, allow_anonymous, qr_token FROM feedback_forms ORDER BY id DESC")
    ).mappings().all()
    return jsonify([dict(r) for r in rows])


@feedback_bp.post("/submit")
@jwt_required()
def submit_feedback():
    data = request.get_json(silent=True) or {}
    user_id = get_jwt_identity()
    stu = db.session.execute(text("SELECT id FROM students WHERE user_id = :u"), {"u": user_id}).mappings().first()
    if not stu:
        return jsonify({"error": "Student profile required"}), 403

    form_id = data.get("form_id")
    subject_id = data.get("subject_id")
    comment_text = (data.get("comment_text") or "").strip()
    is_anonymous = 1 if data.get("is_anonymous") else 0
    receipt_token = "SNU-" + secrets.token_hex(6).upper()

    db.session.execute(
        text("""
            INSERT INTO feedback_submissions (form_id, student_id, subject_id, status, is_anonymous, comment_text, receipt_token)
            VALUES (:f, :s, :sub, 'submitted', :anon, :c, :tok)
            ON DUPLICATE KEY UPDATE
              comment_text = VALUES(comment_text),
              is_anonymous = VALUES(is_anonymous),
              receipt_token = COALESCE(NULLIF(receipt_token, ''), VALUES(receipt_token))
        """),
        {"f": form_id, "s": stu["id"], "sub": subject_id, "anon": is_anonymous, "c": comment_text, "tok": receipt_token},
    )
    db.session.commit()
    return jsonify({"message": "Feedback saved permanently in MySQL", "receipt_token": receipt_token}), 201


@feedback_bp.get("/receipt/verify")
def verify_receipt():
    raw_receipt = (request.args.get("receipt") or "").strip()
    token = (request.args.get("token") or "").strip()
    match = re.match(r"^(?:SNU-REC-)?0*(\\d+)$", raw_receipt, re.IGNORECASE)
    if not match or not token:
        return jsonify({"error": "Valid receipt and token query parameters are required"}), 400

    sub_id = int(match.group(1))
    row = db.session.execute(
        text("""
            SELECT fs.id, fs.status, fs.is_anonymous, fs.comment_text, fs.receipt_token, fs.submitted_at,
                   ff.title AS form_title, sub.code AS subject_code, sub.name AS subject_name,
                   stu.roll_number, u.full_name AS student_name
            FROM feedback_submissions fs
            JOIN feedback_forms ff ON ff.id = fs.form_id
            JOIN subjects sub ON sub.id = fs.subject_id
            JOIN students stu ON stu.id = fs.student_id
            JOIN users u ON u.id = stu.user_id
            WHERE fs.id = :id
        """),
        {"id": sub_id},
    ).mappings().first()

    if not row:
        return jsonify({"error": "Receipt not found"}), 404
    stored = row["receipt_token"] or ""
    if not stored or not hmac.compare_digest(stored, token):
        return jsonify({"error": "Invalid verification token"}), 403

    is_anon = int(row["is_anonymous"]) == 1
    return jsonify({
        "receipt": {
            "receiptNumber": f"SNU-REC-{sub_id:05d}",
            "status": row["status"],
            "is_anonymous": is_anon,
            "student_name": "Anonymous Respondent" if is_anon else row["student_name"],
            "roll_number": "CONFIDENTIAL (Anonymous)" if is_anon else row["roll_number"],
            "subject_code": row["subject_code"],
            "subject_name": row["subject_name"],
            "form_title": row["form_title"],
            "comment_text": row["comment_text"],
            "submitted_at": str(row["submitted_at"]),
        }
    })
`;

  const analyticsRoutesPy = `from flask import Blueprint, jsonify
from sqlalchemy import text
from backend.extensions import db

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.get("/overview")
def overview():
    row = db.session.execute(
        text("""
            SELECT COUNT(*) AS total_submissions,
                   ROUND(AVG(r.overall_satisfaction), 2) AS avg_satisfaction
            FROM feedback_submissions s
            JOIN feedback_ratings r ON r.submission_id = s.id
            WHERE s.status = 'submitted'
        """)
    ).mappings().first()
    return jsonify(dict(row) if row else {"total_submissions": 0, "avg_satisfaction": 0})
`;

  const aiRoutesPy = `from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from backend.ai.gemini_service import analyze_feedback_comment

ai_bp = Blueprint("ai", __name__)


@ai_bp.post("/analyze-feedback")
@jwt_required()
def analyze_feedback():
    data = request.get_json(silent=True) or {}
    result = analyze_feedback_comment(
        comment_text=data.get("comment_text", ""),
        subject_name=data.get("subject_name", "General Course"),
        overall_rating=float(data.get("overall_satisfaction", 4.0)),
    )
    return jsonify(result)
`;

  const adminRoutesPy = `from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import text
from backend.extensions import db

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/dashboard")
@jwt_required()
def dashboard():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Administrator access required"}), 403
    logs = db.session.execute(
        text("SELECT id, user_email, action, entity_type, created_at FROM audit_logs ORDER BY id DESC LIMIT 20")
    ).mappings().all()
    return jsonify({"audit_logs": [dict(r) for r in logs]})
`;

  const requirementsTxt = `Flask==3.1.0
Flask-SQLAlchemy==3.1.1
Flask-Migrate==4.0.7
Flask-JWT-Extended==4.7.1
Flask-CORS==5.0.0
PyMySQL==1.1.1
cryptography==44.0.0
google-genai==1.10.0
gunicorn==23.0.0
pytest==8.3.4
flake8==7.1.1
`;

  const dockerfile = `FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "backend.app:app"]
`;

  const dockerCompose = `services:
  mysql:
    image: mysql:8.0
    container_name: sapthagiri_mysql
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: \${DB_NAME:-student_feedback_db}
      MYSQL_USER: \${DB_USER:-feedback_user}
      MYSQL_PASSWORD: \${DB_PASSWORD:-feedback_pass}
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD:-root_pass}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01_schema.sql:ro
      - ./database/seed.sql:/docker-entrypoint-initdb.d/02_seed.sql:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: .
    container_name: sapthagiri_flask_api
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      FLASK_SECRET_KEY: \${FLASK_SECRET_KEY}
      JWT_SECRET_KEY: \${JWT_SECRET_KEY}
      DB_HOST: mysql
      DB_PORT: 3306
      DB_NAME: \${DB_NAME:-student_feedback_db}
      DB_USER: \${DB_USER:-feedback_user}
      DB_PASSWORD: \${DB_PASSWORD:-feedback_pass}
      GEMINI_API_KEY: \${GEMINI_API_KEY}
      FRONTEND_ORIGIN: \${FRONTEND_ORIGIN:-http://localhost:8080}
    ports:
      - "5000:5000"

volumes:
  mysql_data:
`;

  const vercelJson = `{
  "version": 2,
  "builds": [
    { "src": "api/index.py", "use": "@vercel/python" },
    { "src": "frontend/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.py" },
    { "src": "/(.*)", "dest": "/frontend/$1" }
  ]
}
`;

  const ciYml = `name: Sapthagiri NPS University Feedback CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install Python dependencies
        run: pip install -r requirements.txt
      - name: Lint Python with flake8
        run: flake8 backend tests --max-line-length=120
      - name: Validate vercel.json
        run: python -c "import json; json.load(open('vercel.json'))"
      - name: Run Backend Unit Tests
        run: pytest -q
`;

  const frontendIndex = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sapthagiri NPS University — Student Feedback Portal</title>
  <link rel="stylesheet" href="css/styles.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="index.html">Sapthagiri NPS University</a>
    <nav class="nav">
      <a href="analytics.html">Analytics</a>
      <a href="feedback.html">Submit Feedback</a>
      <a href="login.html">Portal Login</a>
    </nav>
  </header>
  <main class="container">
    <h1>Online Student Feedback Collection System</h1>
    <p>Evaluations, AI sentiment categorization, and live department analytics backed by Flask + MySQL.</p>
    <canvas id="overviewChart" height="120"></canvas>
  </main>
  <script src="js/api.js"></script>
  <script src="js/charts.js"></script>
</body>
</html>
`;

  const frontendCss = `:root {
  --navy: #0B192C;
  --cobalt: #1E40AF;
  --surface: #FFFFFF;
  --bg: #F8FAFC;
}
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--navy); }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; background: var(--surface); border-bottom: 1px solid #E2E8F0; }
.brand { font-weight: 700; text-decoration: none; color: var(--navy); }
.nav { display: flex; gap: 20px; }
.nav a { text-decoration: none; color: #334155; font-weight: 500; }
.container { max-width: 1120px; margin: 40px auto; padding: 0 24px; }
`;

  const frontendJs = `const API_BASE = window.location.origin + "/api";

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}
`;

  const frontendChartsJs = `document.addEventListener("DOMContentLoaded", async () => {
  const el = document.getElementById("overviewChart");
  if (!el || typeof Chart === "undefined") return;
  try {
    const data = await apiFetch("/analytics/overview");
    new Chart(el, {
      type: "bar",
      data: {
        labels: ["Total Submissions", "Average Satisfaction"],
        datasets: [{ label: "Live MySQL Telemetry", data: [data.total_submissions || 0, data.avg_satisfaction || 0], backgroundColor: ["#1E40AF", "#0B192C"] }]
      }
    });
  } catch (err) {
    console.error("Chart load failed", err);
  }
});
`;

  const testAuthPy = `def test_health_endpoint():
    from backend.app import create_app
    app = create_app()
    client = app.test_client()
    res = client.get("/api/health")
    assert res.status_code == 200
`;

  const readmeMd = `# Sapthagiri NPS University — Online Student Feedback Collection System

## Local Development with Docker Compose (Flask + MySQL)

1. Copy \`.env.example\` to \`.env\` and fill \`FLASK_SECRET_KEY\`, \`JWT_SECRET_KEY\`, \`DB_PASSWORD\`, and \`GEMINI_API_KEY\`.
2. Start MySQL 8 and the Flask API:
   \`\`\`bash
   docker compose up --build
   \`\`\`
3. Stop services:
   \`\`\`bash
   docker compose down
   \`\`\`

## Compulsory Vercel Production Deployment

1. Push this directory to a GitHub repository:
   \`\`\`bash
   git init && git add . && git commit -m "Initial Sapthagiri NPS University Feedback System"
   git branch -M main
   git remote add origin https://github.com/<your-org>/sapthagiri-student-feedback.git
   git push -u origin main
   \`\`\`
2. Provision an external managed MySQL database (e.g. PlanetScale, Aiven MySQL, AWS RDS, or DigitalOcean Managed MySQL) and run \`database/schema.sql\` followed by \`database/seed.sql\`.
3. Import the GitHub repository into **Vercel**.
4. Configure Environment Variables in **Vercel Project Settings -> Environment Variables**:
   - \`FLASK_SECRET_KEY\`
   - \`JWT_SECRET_KEY\`
   - \`DB_HOST\`
   - \`DB_PORT\` (3306)
   - \`DB_NAME\` (student_feedback_db)
   - \`DB_USER\`
   - \`DB_PASSWORD\`
   - \`GEMINI_API_KEY\`
   - \`FRONTEND_ORIGIN\` (your Vercel production URL)
5. Click **Deploy** and verify \`https://<your-app>.vercel.app/api/health\`.
`;

  const envExample = `FLASK_SECRET_KEY=
JWT_SECRET_KEY=
DB_HOST=
DB_PORT=3306
DB_NAME=student_feedback_db
DB_USER=
DB_PASSWORD=
GEMINI_API_KEY=
FRONTEND_ORIGIN=
`;

  const gitignore = `.env
__pycache__/
*.pyc
.pytest_cache/
instance/
.vercel
`;

  return [
    { path: 'database/schema.sql', content: schemaSql, category: 'Database' },
    { path: 'database/seed.sql', content: seedSql, category: 'Database' },
    { path: 'backend/__init__.py', content: '', category: 'Backend (Flask)' },
    { path: 'backend/config.py', content: configPy, category: 'Backend (Flask)' },
    { path: 'backend/extensions.py', content: extensionsPy, category: 'Backend (Flask)' },
    { path: 'backend/app.py', content: appPy, category: 'Backend (Flask)' },
    { path: 'backend/ai/__init__.py', content: '', category: 'Backend (Flask)' },
    { path: 'backend/ai/gemini_service.py', content: geminiPy, category: 'Backend (Flask)' },
    { path: 'backend/routes/__init__.py', content: '', category: 'Backend (Flask)' },
    { path: 'backend/routes/auth.py', content: authRoutesPy, category: 'Backend (Flask)' },
    { path: 'backend/routes/feedback.py', content: feedbackRoutesPy, category: 'Backend (Flask)' },
    { path: 'backend/routes/analytics.py', content: analyticsRoutesPy, category: 'Backend (Flask)' },
    { path: 'backend/routes/ai_routes.py', content: aiRoutesPy, category: 'Backend (Flask)' },
    { path: 'backend/routes/admin.py', content: adminRoutesPy, category: 'Backend (Flask)' },
    { path: 'api/index.py', content: vercelPy, category: 'Backend (Flask)' },
    { path: 'frontend/index.html', content: frontendIndex, category: 'Frontend (HTML/CSS/JS)' },
    { path: 'frontend/css/styles.css', content: frontendCss, category: 'Frontend (HTML/CSS/JS)' },
    { path: 'frontend/js/api.js', content: frontendJs, category: 'Frontend (HTML/CSS/JS)' },
    { path: 'frontend/js/charts.js', content: frontendChartsJs, category: 'Frontend (HTML/CSS/JS)' },
    { path: 'requirements.txt', content: requirementsTxt, category: 'DevOps & Vercel' },
    { path: 'Dockerfile', content: dockerfile, category: 'DevOps & Vercel' },
    { path: 'docker-compose.yml', content: dockerCompose, category: 'DevOps & Vercel' },
    { path: 'vercel.json', content: vercelJson, category: 'DevOps & Vercel' },
    { path: '.github/workflows/ci.yml', content: ciYml, category: 'DevOps & Vercel' },
    { path: '.env.example', content: envExample, category: 'DevOps & Vercel' },
    { path: '.gitignore', content: gitignore, category: 'DevOps & Vercel' },
    { path: 'tests/test_auth.py', content: testAuthPy, category: 'Tests & Docs' },
    { path: 'README.md', content: readmeMd, category: 'Tests & Docs' },
  ];
}

export async function buildExportZipBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of getFlaskMysqlVercelFiles()) {
    zip.file(file.path, file.content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}
