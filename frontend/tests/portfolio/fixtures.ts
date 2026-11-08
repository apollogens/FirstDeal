import type { DocumentRecord } from '../../src/lib/documents';

// Full public read DTO; UI-specific fixture metadata is retained by the generic.
export function documentFixture<T extends Partial<DocumentRecord>>(overrides: T) {
  const defaults: DocumentRecord = {
    id: 'fixture-document', user_id: 'fixture-user', scope: 'work', filename: 'demo.pdf',
    file_size: 1024, mime_type: 'application/pdf', status: 'ready', error_message: null,
    pages_count: 1, chunks_count: 1, available_at: null, content_hash: null,
    source_group_id: null, version: 1, supersedes_document_id: null, memory_status: null,
    memory_attempt_count: null, memory_processed_at: null,
    created_at: '2026-11-06T09:00:00Z', updated_at: '2026-11-06T09:00:00Z',
  };
  return { ...defaults, ...overrides };
}
