import type { PaginationParams } from './pagination.js';

export type VerificationStatus = 'NOT_STARTED' | 'PENDING' | 'INVALID' | 'FAILED' | 'VERIFYING' | 'VERIFIED';

export type RecordType = string;
export type RecordStatus = string;

export interface VerificationRecord {
  type: RecordType;
  name: string;
  value: string;
  status: RecordStatus;
  priority?: number;
}

export interface Domain {
  podId?: string;
  domainId: string;
  domain: string;
  status: VerificationStatus;
  feedbackEnabled: boolean;
  records: VerificationRecord[];
  clientId?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface CreateDomainParams {
  domain: string;
  feedbackEnabled?: boolean;
}

export interface UpdateDomainParams {
  feedbackEnabled?: boolean;
}

export interface ListDomainsParams extends PaginationParams {}

export interface ListDomainsResponse {
  count: number;
  limit?: number;
  nextPageToken?: string;
  domains: Domain[];
}
