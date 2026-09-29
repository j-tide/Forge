
import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { normalizeCapturedImage } from '../../lib/captured-image';
import type { ImageAttachment } from '../../../shared/types';

interface ImagePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: ImageAttachment | null;
}

export function ImagePreviewModal({ open, onOpenChange, image }: ImagePreviewModalProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  if (!image) return null;

  // Determine the image source - prefer full-resolution data for enlarged preview, fall back to thumbnail
  // Older screenshot callbacks saved Main's complete PNG URL in the data field.
  const captured = image.mimeType === 'image/png' && image.data ? normalizeCapturedImage(image.data) : null;
  const imageSrc = image.data ? captured?.dataUrl ?? `data:${image.mimeType};base64,${image.data}` : image.thumbnail || null;
  const isThumbnailFallback = !image.data && image.thumbnail;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay with dark background and backdrop blur */}
        <DialogPrimitive.Overlay
          className={cn(
            'forge-glass-task-overlay fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />

        {/* Content container */}
        <DialogPrimitive.Content
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef.current?.isConnected) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
          className={cn(
            'forge-glass-task-modal fixed left-1/2 top-1/2 z-50 flex flex-col',
            '-translate-x-1/2 -translate-y-1/2 w-[calc(100vw-80px)] max-w-5xl h-[min(800px,calc(100dvh-80px))]',
            'overflow-hidden rounded-2xl border border-border bg-card shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'duration-150 motion-reduce:animate-none'
          )}
        >
          {/* Header with title and close button */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
            <DialogPrimitive.Title className="text-sm font-medium text-foreground truncate">
              {image.filename}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className={cn(
                'rounded-[10px] p-2',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-muted transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:pointer-events-none'
              )}
              aria-label={t('tasks:imagePreview.close')}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">{t('tasks:imagePreview.close')}</span>
            </DialogPrimitive.Close>
          </div>

          {/* Image display */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-muted/30 p-6 gap-3">
            {imageSrc ? (
              <>
                <img
                  src={imageSrc}
                  alt={image.filename}
                  className="min-h-0 max-w-full max-h-full object-contain rounded-lg"
                />
                {/* Show indicator when displaying thumbnail fallback */}
                {isThumbnailFallback && (
                  <div className="shrink-0 rounded-lg border border-border bg-card px-3 py-1">
                    <p className="text-xs text-muted-foreground">{t('tasks:imagePreview.lowResolution')}</p>
                  </div>
                )}
              </>
            ) : (
              // Fallback when no image data is available
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-3" />
                <p className="text-sm">{t('tasks:imagePreview.unavailable')}</p>
              </div>
            )}
          </div>

          {/* Hidden description for accessibility */}
          <DialogPrimitive.Description className="sr-only">
            {t('tasks:imagePreview.description', { filename: image.filename })}
          </DialogPrimitive.Description>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
