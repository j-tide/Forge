import { describe, expect, it } from 'vitest';
import { mobileTabHref, parseMobileRoute } from './routes';

describe('mobile route boundary', () => {
  it('opens Inbox first and preserves only a valid Task ID', () => {
    expect(parseMobileRoute('')).toEqual({ tab: 'inbox', taskId: null });
    expect(parseMobileRoute('#/m/tasks')).toEqual({ tab: 'tasks', taskId: null });
    expect(parseMobileRoute('#/tasks/../../../secret')).toEqual({ tab: 'inbox', taskId: null });
    expect(parseMobileRoute('#/m/tasks/40aeb789-5011-40d1-a61c-748f661bcc5a'))
      .toEqual({ tab: 'tasks', taskId: '40aeb789-5011-40d1-a61c-748f661bcc5a' });
  });

  it('uses fixed navigation targets', () => {
    expect(mobileTabHref('inbox')).toBe('#/m/inbox');
    expect(mobileTabHref('tasks')).toBe('#/m/tasks');
  });
});
