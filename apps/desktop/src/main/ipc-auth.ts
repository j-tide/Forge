import type { IpcMainInvokeEvent, WebContents } from 'electron';

export function isTrustedHostIpcSender(
  event: IpcMainInvokeEvent,
  trustedContents: WebContents | null,
  trustedUrl: string,
): boolean {
  return trustedContents !== null
    && !trustedContents.isDestroyed()
    && event.sender === trustedContents
    && event.senderFrame === trustedContents.mainFrame
    && event.senderFrame?.url === trustedUrl;
}
