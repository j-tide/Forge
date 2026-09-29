/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '../dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../dialog';

afterEach(cleanup);

describe('Shared overlay boundaries', () => {
  it('portals a submenu outside the clipped parent menu', async () => {
    render(
      <div data-testid="clipped-header" style={{ overflow: 'hidden', height: 48 }}>
        <DropdownMenu defaultOpen modal={false}>
          <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
          <DropdownMenuContent data-testid="parent-menu">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger>
              <DropdownMenuSubContent data-testid="child-menu">
                <DropdownMenuItem>Inspect configuration</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
    const subtrigger = await screen.findByRole('menuitem', { name: 'More actions' });
    subtrigger.focus();
    fireEvent.keyDown(subtrigger, { key: 'ArrowRight' });
    const submenu = await screen.findByTestId('child-menu');
    expect(document.body.contains(submenu)).toBe(true);
    expect(screen.getByTestId('clipped-header').contains(submenu)).toBe(false);
    expect(screen.getByTestId('parent-menu').contains(submenu)).toBe(false);
    expect(screen.getByRole('menuitem', { name: 'Inspect configuration' })).toBeTruthy();
  });

  it('retains keyboard submenu navigation after moving content to a portal', async () => {
    render(
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Inspect configuration</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const subtrigger = await screen.findByRole('menuitem', { name: 'More actions' });
    subtrigger.focus();
    fireEvent.keyDown(subtrigger, { key: 'ArrowRight' });
    await screen.findByRole('menuitem', { name: 'Inspect configuration' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Inspect configuration' })).toBeNull());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'More actions' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('portals popovers outside the header and restores focus after Escape', async () => {
    render(
      <div data-testid="clipped-header" style={{ overflow: 'hidden', height: 48 }}>
        <Popover>
          <PopoverTrigger>Usage details</PopoverTrigger>
          <PopoverContent aria-label="Account usage" data-testid="usage-popover">
            <button type="button">Manage accounts</button>
          </PopoverContent>
        </Popover>
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Usage details' });
    trigger.focus();
    fireEvent.click(trigger);
    const content = await screen.findByTestId('usage-popover');
    expect(screen.getByTestId('clipped-header').contains(content)).toBe(false);
    expect(document.body.contains(content)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('usage-popover')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('dismisses only the top popover before a containing modal and preserves both focus restoration steps', async () => {
    render(<Dialog>
      <DialogTrigger>Edit profile</DialogTrigger>
      <DialogContent>
        <DialogTitle>Profile editor</DialogTitle>
        <DialogDescription>Configure this profile.</DialogDescription>
        <Popover>
          <PopoverTrigger>Choose model</PopoverTrigger>
          <PopoverContent data-testid="nested-picker"><button type="button">Model option</button></PopoverContent>
        </Popover>
      </DialogContent>
    </Dialog>);
    const editorTrigger = screen.getByRole('button', { name: 'Edit profile' });
    editorTrigger.focus();
    fireEvent.click(editorTrigger);
    const pickerTrigger = await screen.findByRole('button', { name: 'Choose model' });
    fireEvent.click(pickerTrigger);
    await screen.findByTestId('nested-picker');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('nested-picker')).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Profile editor' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(pickerTrigger));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile editor' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(editorTrigger));
  });
});
