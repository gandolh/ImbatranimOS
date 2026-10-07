/**
 * What a checkout of a commit would write, counted from
 * `git ls-tree -r -l -z --full-tree <commit>` before the checkout runs (brief
 * 158). A URL check uses it: a pack of a few KB can hold a tree of hundreds of
 * MB (one blob of zeros under many names), so the size of the fetched history
 * says nothing about the size of the working tree.
 *
 * The output streams through {@link TreeTally.push}, which keeps only its
 * running totals, never the listing. Each record is
 * `<mode> SP <type> SP <object> SP+ <size> TAB <path> NUL`; `-z` leaves the
 * path unquoted and ends it with NUL, the one byte a path cannot hold.
 */

/** Longer than any record's head (`100644 blob <64 hex>  <size>`). Past it the output is not ls-tree's. */
const MAX_HEAD = 256;
const TAB = 0x09;
const NUL = 0x00;

export class TreeTally {
  /** Paths in the tree: files, symlinks and submodule links. */
  entries = 0;
  /**
   * The blobs' sizes, a duplicate counted each time it appears: checkout
   * writes every path, however many share a blob.
   */
  bytes = 0;
  /** The output was not ls-tree's: the totals cannot be trusted. */
  malformed = false;

  private head = '';
  private inPath = false;

  /** Count one chunk of output. */
  push(chunk: Buffer): void {
    let i = 0;
    while (i < chunk.length && !this.malformed) {
      if (this.inPath) {
        const end = chunk.indexOf(NUL, i);
        if (end === -1) return;
        this.inPath = false;
        i = end + 1;
        continue;
      }
      const tab = chunk.indexOf(TAB, i);
      this.head += chunk.toString('latin1', i, tab === -1 ? chunk.length : tab);
      if (this.head.length > MAX_HEAD) {
        this.malformed = true;
        return;
      }
      if (tab === -1) return;
      this.count(this.head);
      this.head = '';
      this.inPath = true;
      i = tab + 1;
    }
  }

  /** True when the output stopped mid-record: it was cut short. */
  get partial(): boolean {
    return this.inPath || this.head !== '';
  }

  /** True while both totals are within the limits. */
  within(limits: { bytes: number; entries: number }): boolean {
    return (
      !this.malformed &&
      this.entries <= limits.entries &&
      this.bytes <= limits.bytes
    );
  }

  private count(head: string): void {
    const [mode, type, object, size, ...rest] = head.trim().split(/ +/);
    if (!mode || !type || !object || size === undefined || rest.length > 0) {
      this.malformed = true;
      return;
    }
    this.entries += 1;
    if (type === 'blob') {
      if (!/^\d{1,15}$/.test(size)) {
        this.malformed = true;
        return;
      }
      this.bytes += Number(size);
    }
    // A submodule link (`commit`) has no size ("-"): checkout writes an
    // empty directory for it and fetches nothing.
  }
}
