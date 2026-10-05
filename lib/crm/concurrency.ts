export function canChangeAttendance(input: { role: string; userId: string; assignedTo: string | null; state: string; status: string }) {
  if (input.status === 'closed') return false;
  return input.state !== 'in_service' || !input.assignedTo || input.assignedTo === input.userId
    || ['manager', 'company_admin', 'super_admin'].includes(input.role);
}
export function canSendHumanMessage(input: {userId:string;assignedTo:string|null;state:string;status:string}) {
  return input.status !== 'closed' && input.state === 'in_service' && input.assignedTo === input.userId;
}

