import type { StorageAdapter } from '../storage/adapter.js';
import type { Thread, ThreadItem, ListThreadsParams, ListThreadsResponse, UpdateThreadParams } from '../types/thread.js';

export class InboxThreadsResource {
  constructor(private storage: StorageAdapter) {}

  async list(inboxId: string, params: ListThreadsParams = {}): Promise<ListThreadsResponse> {
    return this.storage.listThreads({ ...params, inboxId });
  }
}

export class ThreadsResource {
  constructor(private storage: StorageAdapter) {}

  async list(params: ListThreadsParams = {}): Promise<ListThreadsResponse> {
    return this.storage.listThreads(params);
  }

  async get(threadId: string): Promise<Thread> {
    const thread = await this.storage.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    return thread;
  }

  async update(threadId: string, params: UpdateThreadParams): Promise<ThreadItem> {
    return this.storage.updateThread(threadId, params);
  }

  async delete(threadId: string): Promise<void> {
    return this.storage.deleteThread(threadId);
  }
}
