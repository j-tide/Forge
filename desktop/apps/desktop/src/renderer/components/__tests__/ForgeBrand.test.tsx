/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ForgeBrand, ForgeMark } from '../ForgeBrand';
import { WelcomeScreen } from '../WelcomeScreen';
import { WelcomeStep } from '../onboarding/WelcomeStep';
import { AdvancedSettings } from '../settings/AdvancedSettings';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants/config';

afterEach(cleanup);

describe('Forge visual identity', () => {
  it('names a standalone mark for assistive technology', () => {
    render(<ForgeMark size={24} />);
    const mark = screen.getByRole('img', { name: 'Forge' });
    expect(mark.style.width).toBe('24px');
    expect(mark.style.height).toBe('24px');
    expect(mark.style.getPropertyValue('--forge-mark-image')).toContain('forge-mark.png');
  });

  it('does not announce a decorative mark twice beside the wordmark', () => {
    const { container } = render(<ForgeBrand />);
    expect(screen.getByText('Forge')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.forge-brand-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the collapsed identity accessible without invisible text taking layout space', () => {
    const { container } = render(<ForgeBrand showName={false} size={24} />);
    expect(screen.getByRole('img', { name: 'Forge' })).not.toBeNull();
    expect(container.querySelector('.forge-brand-name')).toBeNull();
  });

  it('uses the same source mark in light and dark modes', () => {
    const { rerender } = render(<ForgeMark />);
    const lightSource = screen.getByRole('img').style.getPropertyValue('--forge-mark-image');
    document.documentElement.classList.add('dark');
    try {
      rerender(<ForgeMark />);
      expect(screen.getByRole('img').style.getPropertyValue('--forge-mark-image')).toBe(lightSource);
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });

  it('keeps the welcome screen focused on working project actions', () => {
    const onOpenProject = vi.fn();
    render(
      <WelcomeScreen projects={[]} onNewProject={vi.fn()} onOpenProject={onOpenProject} onSelectProject={vi.fn()} />
    );
    expect(screen.getByRole('heading', { name: 'Start with a project' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'New Project' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Project' }));
    expect(onOpenProject).toHaveBeenCalledOnce();
  });

  it('brands onboarding while preserving the existing get started action', () => {
    const onGetStarted = vi.fn();
    const { container } = render(<WelcomeStep onGetStarted={onGetStarted} onSkip={vi.fn()} />);
    expect(container.querySelector<HTMLElement>('.forge-brand-mark')?.style.width).toBe('48px');
    fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));
    expect(onGetStarted).toHaveBeenCalledOnce();
  });

  it('keeps version and license information beside the brand in settings', () => {
    const { container } = render(
      <AdvancedSettings settings={DEFAULT_APP_SETTINGS} onSettingsChange={vi.fn()} section="updates" version="0.1.0-preview.2" />
    );
    expect(container.querySelector('.forge-brand-mark')).not.toBeNull();
    expect(screen.getByText('0.1.0-preview.2')).not.toBeNull();
    expect(screen.getByText(/AGPL-3\.0/)).not.toBeNull();
  });
});
