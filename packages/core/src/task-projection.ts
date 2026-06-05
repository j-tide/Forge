import type { BoardColumn, BoardTask } from '@forge/contracts';

export const boardColumns: readonly BoardColumn[] =
  ['todo', 'development', 'review', 'verify', 'done'];

export interface BoardFilters {
  search: string;
  priority: BoardTask['priority'] | 'all';
  state: BoardColumn | 'all';
  executorId: string | 'all';
}

export function filterBoardTasks(tasks: readonly BoardTask[], filters: BoardFilters): BoardTask[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return tasks.filter((task) =>
    (filters.state === 'all' || task.boardColumn === filters.state) &&
    (filters.priority === 'all' || task.priority === filters.priority) &&
    (filters.executorId === 'all' ||
      (filters.executorId === '' ? task.executorId === null : task.executorId === filters.executorId)) &&
    (!search || task.title.toLocaleLowerCase().includes(search) || task.id.includes(search)))
    .sort((left, right) => left.boardColumn.localeCompare(right.boardColumn) ||
      left.position - right.position || left.id.localeCompare(right.id));
}

export function boardCounts(tasks: readonly BoardTask[]): Record<BoardColumn, number> {
  const counts: Record<BoardColumn, number> = { todo: 0, development: 0, review: 0, verify: 0, done: 0 };
  for (const task of tasks) counts[task.boardColumn] += 1;
  return counts;
}

export interface BoardEventIdentity { eventId: string; seq: number }
export function uniqueBoardEvents<T extends BoardEventIdentity>(events: readonly T[]): T[] {
  const seen = new Set<string>();
  return [...events].sort((a, b) => a.seq - b.seq).filter((event) => {
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });
}
