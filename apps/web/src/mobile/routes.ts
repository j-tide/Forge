export type MobileTab = 'inbox' | 'tasks' | 'messages' | 'account';
export type MobileRoute = { tab: MobileTab; taskId: string | null };

const taskPath = /^#\/(?:m\/)?tasks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parseMobileRoute(hash: string): MobileRoute {
  const task = taskPath.exec(hash);
  if (task) return { tab: 'tasks', taskId: task[1]!.toLowerCase() };
  const route = /^#\/m\/(inbox|tasks|messages|account)$/.exec(hash);
  if (route) return { tab: route[1] as MobileTab, taskId: null };
  return { tab: 'inbox', taskId: null };
}

export function mobileTabHref(tab: MobileTab): string { return `#/m/${tab}`; }
