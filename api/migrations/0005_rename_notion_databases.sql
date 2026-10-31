-- =============================================================================
-- Migration 0005 — rename notion_databases to venture_boards
-- "venture_boards" better describes what it is: a named Notion board
-- belonging to a venture, not just a raw database reference.
-- =============================================================================

ALTER TABLE notion_databases RENAME TO venture_boards;
