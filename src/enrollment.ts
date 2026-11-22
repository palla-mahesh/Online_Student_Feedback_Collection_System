export const ENROLLMENT_FORMAT_REGEX = /^\d{2}SUU[A-Z]{2,6}\d{4}$/;

export const DEPT_PROGRAM_INFIX: Record<string, string> = {
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

export function getSuggestedEnrollmentPrefix(deptCode?: string, batchYear = 2024): string {
  const yy = String(batchYear).slice(-2).padStart(2, '0');
  const clean = (deptCode || 'CSE').trim().toUpperCase();
  const infix = DEPT_PROGRAM_INFIX[clean] || `BE${clean.slice(0, 2).padEnd(2, 'X')}`;
  return `${yy}SUU${infix}`;
}

export function isValidEnrollmentFormat(value: string): boolean {
  return ENROLLMENT_FORMAT_REGEX.test(value.trim().toUpperCase());
}
