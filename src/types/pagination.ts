export interface PaginationParams {
  limit?: number;
  pageToken?: string;
  ascending?: boolean;
}

export interface PaginatedList<T> {
  count: number;
  limit?: number;
  nextPageToken?: string;
  items: T[];
}
