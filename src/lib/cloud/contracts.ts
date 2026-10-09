import type { MindMapDocument } from "@/types/mindmap";

/** The complete owner-only record. The database owner and token hash never leave the server. */
export type CloudDocumentRecord = {
  id: string;
  document: MindMapDocument;
  revision: number;
  updatedAt: string;
  shareEnabled: boolean;
};
export type CloudDocumentSummary = Omit<CloudDocumentRecord, "document"> & {
  title: string;
};
export type CloudDocumentsRequest =
  | { action: "list" }
  | { action: "get"; id: string }
  | { action: "save"; id?: string; expectedRevision?: number; document: unknown }
  | { action: "delete"; id: string; expectedRevision: number };
export type CloudShareRequest = {
  id: string;
  action: "enable" | "rotate" | "revoke";
};
export type CloudShareResponse = { enabled: boolean; token?: string };
export type CloudErrorCode =
  | "CLOUD_UNAVAILABLE"
  | "CLOUD_REQUEST_FAILED"
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_INVALID"
  | "DOCUMENT_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "SHARE_NOT_FOUND";
export type CloudErrorResponse = {
  error: { code: CloudErrorCode; message: string; currentRevision?: number };
};

/** A public capability returns display content only, never an owner record. */
export type SharedCloudDocument = Pick<
  MindMapDocument,
  | "title"
  | "nodes"
  | "edges"
  | "relations"
  | "boardMode"
  | "ink"
  | "appearance"
  | "layoutMode"
  | "viewport"
>;
export type SharedCloudResponse = { document: SharedCloudDocument };
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const CLOUD_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
export const CLOUD_REQUEST_MAX_BYTES = CLOUD_DOCUMENT_MAX_BYTES + 64 * 1024;
