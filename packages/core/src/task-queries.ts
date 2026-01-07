import type { TaskContract } from '@forge/contracts';

/** Enumerate only references belonging to the approved contract, preserving their first occurrence. */
export function taskSourceRefs(contract: TaskContract): string[] {
  return [...new Set([...contract.sourceRefs,
    ...contract.acceptance.flatMap((item) => item.sourceRefs)])];
}
