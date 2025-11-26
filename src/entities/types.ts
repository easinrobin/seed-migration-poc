export type SeedStats = {
  inserted: number;
  updated: number;
  skipped: number;
};

export type ChangeSet = {
  added: Array<{ id: string; data: Record<string, any> }>;
  updated: Array<{
    id: string;
    before: Record<string, any>;
    after: Record<string, any>;
    changedFields: string[];
  }>;
  deleted: Array<{ id: string; data: Record<string, any> }>;
};

export type SeedResult = {
  stats: SeedStats;
  changes: {
    added: Array<{ id: string; data: Record<string, any> }>;
    updated: Array<{
      id: string;
      before: Record<string, any>;
      after: Record<string, any>;
      changedFields: string[];
    }>;
    deleted: Array<{ id: string; data: Record<string, any> }>;
  };
};
