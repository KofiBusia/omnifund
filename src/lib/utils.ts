import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from '../firebase';

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
  }).format(value);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely parses any date input (string, Date, timestamp object with .seconds, number).
 * Returns null if invalid or empty.
 */
export function safeDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Safely formats date as 'YYYY-MM-DD' without throwing RangeError.
 */
export function safeISODate(val: any, fallback?: string): string {
  const defaultFallback = fallback || new Date().toISOString().split('T')[0];
  const d = safeDate(val);
  if (!d) return defaultFallback;
  try {
    return d.toISOString().split('T')[0];
  } catch {
    return defaultFallback;
  }
}

/**
 * Safely formats date using toLocaleDateString.
 */
export function safeFormatDate(val: any, options?: Intl.DateTimeFormatOptions, fallback: string = 'N/A'): string {
  const d = safeDate(val);
  if (!d) return fallback;
  try {
    return d.toLocaleDateString(undefined, options);
  } catch {
    return fallback;
  }
}

/**
 * Safely gets timestamp milliseconds for sorting or comparisons.
 */
export function safeTimestamp(val: any, fallback: number = 0): number {
  const d = safeDate(val);
  return d ? d.getTime() : fallback;
}

