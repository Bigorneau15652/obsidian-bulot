// Public entry point of the Markdown protection layer.
export { parseDocument, rebuildDocument, validateTranslation, findStructureMismatch } from "./document";
export type { ParsedDocument, ParseOptions, Segment, RebuildResult, RejectedSegment } from "./document";
export { protectInline, restoreInline } from "./inline";
