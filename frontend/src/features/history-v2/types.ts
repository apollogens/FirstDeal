export type HistoryFilter = "all" | "pinned" | "important" | "context" | "archived";

export type HistorySort = "updated-desc" | "updated-asc" | "created-desc" | "title";

export type ContextSource = {
  id: string;
  title: string;
  kind?: string;
};

export type HistoryTag = {
  id: string;
  label: string;
};

export type HistoryCapabilities = {
  persistentRename: boolean;
  persistentPin: boolean;
  persistentImportant: boolean;
  persistentArchive: boolean;
  persistentDelete: boolean;
  context: boolean;
  summary: boolean;
  activity: boolean;
};

export const currentHistoryCapabilities: HistoryCapabilities = {
  persistentRename: false,
  persistentPin: false,
  persistentImportant: false,
  persistentArchive: false,
  persistentDelete: false,
  context: false,
  summary: false,
  activity: false,
};

export type HistoryChat = {
  id: string;
  title: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  important: boolean;
  archived: boolean;
  context?: {
    available: boolean;
    sources?: ContextSource[];
  };
  tags?: HistoryTag[];
  attachmentsCount?: number;
  capability: {
    contextAvailable: boolean;
    backendPersistence: boolean;
  };
};

export type HistoryOverlayEntry = {
  titleOverride?: string;
  pinned?: boolean;
  important?: boolean;
  archived?: boolean;
  locallyDeleted?: boolean;
};

export type HistoryOverlay = Record<string, HistoryOverlayEntry>;

export type HistoryGroupKey = "today" | "yesterday" | "week" | "earlier";

export type HistoryGroupModel = {
  key: HistoryGroupKey;
  label: string;
  chats: HistoryChat[];
};

export type MutationStatus = "idle" | "pending" | "error";
