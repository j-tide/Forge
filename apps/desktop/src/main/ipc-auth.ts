import type { IpcMainInvokeEvent, WebContents } from 'electron';

export function isTrustedHostIpcSender(
  event: IpcMainInvokeEvent,
  trustedContents: WebContents | null,
  trustedUrl: string,
): boolean {
  let sameDocument: boolean;
  try {
    const actual = new URL(event.senderFrame?.url ?? '');
    const expected = new URL(trustedUrl);
    // Hash routes stay in the same loaded Renderer document; path and query remain fixed.
    sameDocument = actual.protocol === expected.protocol && actual.host === expected.host &&
      actual.pathname === expected.pathname && actual.search === expected.search &&
      actual.username === expected.username && actual.password === expected.password;
  } catch { return false; }
  return trustedContents !== null
    && !trustedContents.isDestroyed()
    && event.sender === trustedContents
    && event.senderFrame === trustedContents.mainFrame
    && sameDocument;
}
