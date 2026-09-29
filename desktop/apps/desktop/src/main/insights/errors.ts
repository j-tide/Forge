import type { InsightsErrorCode } from '../../shared/types';
import { nativeText, type NativeTextKey } from '../localized-text';

const failureKeys: Record<InsightsErrorCode, NativeTextKey> = {
  'auth-required': 'ipc.insightsAuthRequired',
  'request-failed': 'ipc.insightsRequestFailed',
  'invalid-request': 'ipc.insightsInvalidRequest',
  'request-busy': 'ipc.insightsRequestBusy',
  'session-not-found': 'ipc.insightsSessionNotFound',
  'persistence-failed': 'ipc.insightsPersistenceFailed',
  'images-unsupported': 'ipc.insightsImagesUnsupported',
  'image-data-unavailable': 'ipc.insightsImageDataUnavailable',
};

export class InsightsRequestError extends Error {
  constructor(readonly code: InsightsErrorCode) {
    super(nativeText(failureKeys[code]));
    this.name = 'InsightsRequestError';
  }
}

/** Never forward provider response bodies or raw exception messages to the UI/log. */
export function insightsFailure(error: unknown): InsightsRequestError {
  if (error instanceof InsightsRequestError) return error;
  if (error && typeof error === 'object' && 'code' in error && error.code === 'INSIGHTS_AUTH_REQUIRED') {
    return new InsightsRequestError('auth-required');
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'INSIGHTS_IMAGES_UNSUPPORTED') {
    return new InsightsRequestError('images-unsupported');
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'INSIGHTS_IMAGE_DATA_UNAVAILABLE') {
    return new InsightsRequestError('image-data-unavailable');
  }
  return new InsightsRequestError('request-failed');
}
