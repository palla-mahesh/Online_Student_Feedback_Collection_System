export type UserRole = 'student' | 'faculty' | 'admin';
export type LanguageCode = 'en' | 'hi' | 'kn' | 'te';

export type PageId =
  | 'landing'
  | 'register'
  | 'student-login'
  | 'admin-login'
  | 'student-dashboard'
  | 'feedback-submit'
  | 'feedback-history'
  | 'faculty-dashboard'
  | 'admin-dashboard'
  | 'analytics'
  | 'ai-insights'
  | 'courses-subjects'
  | 'teachers'
  | 'students'
  | 'reports'
  | 'settings'
  | 'help'
  | 'receipt-verify';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  preferred_language: LanguageCode;
  phone?: string | null;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  head_name: string;
}

export interface AcademicYear {
  id: number;
  label: string;
  start_date: string;
  end_date: string;
  is_current: number;
}

export interface Semester {
  id: number;
  academic_year_id: number;
  academic_year_label: string;
  name: string;
  term_order: number;
  start_date: string;
  end_date: string;
  is_current: number;
}

export interface Course {
  id: number;
  department_id: number;
  department_name: string;
  code: string;
  name: string;
  degree_level: string;
  duration_years: number;
}

export interface Subject {
  id: number;
  department_id: number;
  department_name: string;
  course_id: number;
  course_code?: string;
  course_name: string;
  semester_id: number;
  semester_name: string;
  faculty_id: number | null;
  faculty_name: string | null;
  code: string;
  short_code?: string | null;
  elective_group?: string | null;
  name: string;
  credits: number;
}

export interface TeacherSummary {
  id: number;
  user_id: number;
  full_name: string;
  email?: string;
  is_active?: number;
  department_id: number;
  department_name: string;
  employee_code: string;
  designation: string;
  specialization: string | null;
  subject_count?: number;
  avg_rating?: number | null;
  feedback_count?: number;
}

export interface FeedbackQuestion {
  id: number;
  form_id: number;
  question_text: string;
  question_type: 'star' | 'slider' | 'radio' | 'text';
  category: string;
  is_required: number;
  sort_order: number;
  options_json: string | null;
}

export interface FeedbackFormItem {
  id: number;
  title: string;
  description: string;
  department_id: number | null;
  department_name?: string | null;
  course_id: number | null;
  course_name?: string | null;
  subject_id: number | null;
  academic_year_id: number;
  academic_year_label?: string;
  semester_id: number;
  semester_name?: string;
  open_date: string;
  close_date: string;
  is_active: number;
  allow_anonymous: number;
  qr_token: string;
  questions: FeedbackQuestion[];
  existingSubmissions?: Array<{ id: number; subject_id: number; status: string }>;
}

export interface CatalogData {
  departments: Department[];
  academicYears: AcademicYear[];
  semesters: Semester[];
  courses: Course[];
  subjects: Subject[];
  teachers: TeacherSummary[];
}

export interface SemesterTrackingItem {
  semester_id: number;
  semester_name: string;
  term_order: number;
  academic_year_label: string;
  start_date: string;
  end_date: string;
  is_enrolled_semester: boolean;
  department_subjects: number;
  submitted_count: number;
  draft_count: number;
  avg_satisfaction: number | null;
  status: 'Completed' | 'Current' | 'Upcoming';
}

export interface StudentProfileRecord {
  id: number;
  user_id: number;
  department_id: number;
  course_id: number;
  academic_year_id: number;
  semester_id: number;
  proctor_faculty_id?: number | null;
  proctor_name?: string | null;
  proctor_employee_code?: string | null;
  roll_number: string;
  batch_year: number;
  email: string;
  full_name: string;
  preferred_language: LanguageCode;
  phone: string | null;
  department_code: string;
  department_name: string;
  course_code: string;
  course_name: string;
  semester_name: string;
  term_order: number;
  academic_year_label: string;
}

export interface DepartmentSemesterCell {
  semester_id: number;
  semester_name: string;
  term_order: number;
  enrolled_students: number;
  subjects_count: number;
  submitted_feedbacks: number;
  avg_satisfaction: number | null;
}

export interface DepartmentSemesterRow {
  department_id: number;
  department_code: string;
  department_name: string;
  head_name: string;
  program_prefix: string;
  total_students: number;
  total_subjects: number;
  total_submissions: number;
  semesters: DepartmentSemesterCell[];
}

export interface DepartmentSemesterTrackingResponse {
  semesters: Semester[];
  departments: DepartmentSemesterRow[];
}

export interface SubjectPollOption {
  label: string;
  count: number;
  percentage: number;
}

export interface SubjectPollItem {
  question_id: number;
  form_id: number;
  form_title: string;
  question_text: string;
  question_type: 'star' | 'slider' | 'radio' | 'text';
  category: string;
  total_votes: number;
  avg_score: number | null;
  options: SubjectPollOption[];
}

export interface ProctorMenteeRecord {
  student_id: number;
  user_id: number;
  roll_number: string;
  full_name: string;
  email: string;
  department_code: string;
  department_name: string;
  course_code: string;
  semester_name: string;
  term_order: number;
  requests_given: number;
  feedbacks_completed: number;
  feedbacks_pending: number;
  in_progress_count: number;
  last_activity_at: string | null;
}

export interface ProctorSubjectAnalysisRow {
  subject_id: number;
  subject_code: string;
  short_code?: string | null;
  subject_name: string;
  semester_name: string;
  instructor_name: string | null;
  requests_count: number;
  reviews_count: number;
  avg_teaching: number | null;
  avg_communication: number | null;
  avg_infrastructure: number | null;
  avg_overall: number | null;
}

export interface FacultyRequestAnalyticsRow {
  faculty_id: number;
  faculty_name: string;
  employee_code: string;
  dept_code: string;
  assigned_subjects: number;
  total_requests: number;
  completed_feedbacks: number;
  in_progress_requests: number;
  pending_requests: number;
  response_rate_pct: number;
  avg_overall: number | null;
}

export interface VerifiedReceiptData {
  receiptNumber: string;
  id: number;
  status: 'draft' | 'submitted';
  is_anonymous: boolean;
  submitted_at: string;
  updated_at: string;
  student_name: string;
  roll_number: string;
  department_name: string;
  course_code: string;
  course_name: string;
  semester_name: string;
  subject_code: string;
  short_code?: string | null;
  elective_group?: string | null;
  subject_name: string;
  faculty_name: string;
  form_title: string;
  close_date: string;
  comment_text: string;
  sentiment: string | null;
  primary_category: string | null;
  ratings: {
    teaching_quality: number;
    communication: number;
    punctuality: number;
    subject_knowledge: number;
    methodology: number;
    classroom_environment: number;
    infrastructure: number;
    overall_satisfaction: number;
  };
}
