import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  language: 'zh-CN',
  notifications: [] as Array<{ title: string; body: string; silent: boolean }>
}));

vi.mock('./app-language', () => ({ getAppLanguage: () => state.language }));
vi.mock('./project-store', () => ({
  projectStore: { getProjects: () => [] }
}));
vi.mock('electron', () => ({
  Notification: class {
    static isSupported(): boolean { return true; }
    constructor(options: { title: string; body: string; silent: boolean }) {
      state.notifications.push(options);
    }
    on(): void { /* Native event registration is independent of the translated content. */ }
    show(): void { /* The collected options are the notification payload under test. */ }
  },
  shell: { beep: vi.fn() }
}));

import { notificationService } from './notification-service';

describe('localized native notifications', () => {
  beforeEach(() => {
    state.language = 'zh-CN';
    state.notifications.length = 0;
  });

  it('sends Chinese task completion without claiming final acceptance', () => {
    notificationService.notifyTaskComplete('日期筛选', 'project-1', 'task-1');
    expect(state.notifications).toEqual([{
      title: '任务执行完成',
      body: '“日期筛选”已执行完成，等待审查',
      silent: true
    }]);
  });

  it('localizes failure and review notifications', () => {
    notificationService.notifyTaskFailed('日期筛选', 'project-1', 'task-1');
    notificationService.notifyReviewNeeded('日期筛选', 'project-1', 'task-1');
    expect(state.notifications.map(item => item.title)).toEqual(['任务执行失败', '等待审查']);
  });

  it('uses the currently selected language on the next notification', () => {
    notificationService.notifyReviewNeeded('Feature', 'project-1', 'task-1');
    state.language = 'en';
    notificationService.notifyReviewNeeded('Feature', 'project-1', 'task-1');
    expect(state.notifications[0].title).toBe('等待审查');
    expect(state.notifications[1]).toEqual({
      title: 'Review Needed',
      body: '"Feature" is ready for your review',
      silent: true
    });
  });
});
