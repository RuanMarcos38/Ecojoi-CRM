export type Role = 'super_admin' | 'company_admin' | 'manager' | 'user';
export type Permission =
  | 'contacts.view' | 'contacts.create' | 'contacts.update' | 'contacts.delete'
  | 'conversations.view' | 'conversations.send' | 'conversations.manage'
  | 'deals.view' | 'deals.create' | 'deals.update' | 'deals.delete'
  | 'tasks.view' | 'tasks.create' | 'tasks.update' | 'tasks.delete'
  | 'reports.view' | 'team.view' | 'team.manage' | 'settings.view' | 'settings.manage'
  | 'features.manage' | 'audit.view';

const all: Permission[] = [
  'contacts.view','contacts.create','contacts.update','contacts.delete',
  'conversations.view','conversations.send','conversations.manage',
  'deals.view','deals.create','deals.update','deals.delete',
  'tasks.view','tasks.create','tasks.update','tasks.delete',
  'reports.view','team.view','team.manage','settings.view','settings.manage','features.manage','audit.view'
];

export const rolePermissions: Record<Role, Permission[]> = {
  super_admin: all,
  company_admin: all,
  manager: all.filter(p => !['features.manage','settings.manage','team.manage','audit.view'].includes(p)),
  user: ['contacts.view','contacts.create','contacts.update','conversations.view','conversations.send','deals.view','deals.create','deals.update','tasks.view','tasks.create','tasks.update']
};

export function hasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].includes(permission);
}
