/** @vitest-environment jsdom */
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';

afterEach(cleanup);

describe('Tooltip overlay boundary', () => {
  it('portals project-tab tooltips outside their clipped header while preserving ref, content and positioning props', async () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <TooltipProvider delayDuration={0}>
        <div data-testid="clipped-project-header" style={{ overflow: 'hidden', height: 48 }}>
          <Tooltip>
            <TooltipTrigger asChild><button type="button">Project tab</button></TooltipTrigger>
            <TooltipContent ref={ref} side="bottom" align="start" sideOffset={8} data-testid="floating-project-tooltip">
              Project path and keyboard shortcut
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Project tab' }));
    const content = await screen.findByTestId('floating-project-tooltip');
    expect(screen.getByTestId('clipped-project-header').contains(content)).toBe(false);
    expect(document.body.contains(content)).toBe(true);
    expect(ref.current).toBe(content);
    expect(content.getAttribute('data-side')).toBe('bottom');
    expect(content.getAttribute('data-align')).toBe('start');
    expect(screen.getByRole('tooltip').textContent).toBe('Project path and keyboard shortcut');
    expect(screen.getByRole('button', { name: 'Project tab' }).getAttribute('aria-describedby')).not.toBeNull();
  });

  it('opens from keyboard focus and closes on Escape after moving to the body portal', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <div style={{ overflowX: 'auto' }}>
          <Tooltip>
            <TooltipTrigger asChild><button type="button">Project settings</button></TooltipTrigger>
            <TooltipContent data-testid="settings-tooltip">Configure this project</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Project settings' }));
    await screen.findByTestId('settings-tooltip');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('settings-tooltip')).toBeNull());
  });
});
