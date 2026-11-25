export function canViewTeamAttendance(role?: string | null) {
  return role === 'company_admin' || role === 'super_admin' || role === 'manager';
}
