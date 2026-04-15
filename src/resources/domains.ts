import type { StorageAdapter } from '../storage/adapter.js';
import type { Domain, CreateDomainParams, UpdateDomainParams, ListDomainsParams, ListDomainsResponse } from '../types/domain.js';
import { generateId } from '../util/id.js';

export class DomainsResource {
  constructor(
    private storage: StorageAdapter,
    private podId: string,
  ) {}

  async list(params: ListDomainsParams = {}): Promise<ListDomainsResponse> {
    return this.storage.listDomains(params);
  }

  async get(domainId: string): Promise<Domain> {
    const domain = await this.storage.getDomain(domainId);
    if (!domain) throw new Error(`Domain not found: ${domainId}`);
    return domain;
  }

  async create(params: CreateDomainParams): Promise<Domain> {
    const domainId = generateId('domain');
    return this.storage.createDomain({
      ...params,
      domainId,
      podId: this.podId,
      records: [], // DNS records would be populated by a real domain verification flow
    });
  }

  async update(domainId: string, params: UpdateDomainParams): Promise<Domain> {
    return this.storage.updateDomain(domainId, params);
  }

  async delete(domainId: string): Promise<void> {
    return this.storage.deleteDomain(domainId);
  }
}
