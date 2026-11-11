export type FsEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: string;
  /** ctime — POSIX has no true birth time on every filesystem. Optional so a
   *  cached listing from before this field existed still type-checks. */
  createdAt?: string;
  /** POSIX permission bits as octal, display only. */
  mode?: string;
  isSymlink?: boolean;
};

export type FsRoot = {
  id: string;
  label: string;
};

export const FS_ROOTS: FsRoot[] = [
  { id: "home", label: "Home" },
  { id: "notes", label: "Notes" },
];

/** One row of an archive listing, as the backend validated it. */
export type ArchiveEntry = {
  name: string;
  size: number | null;
  compressedSize: number | null;
  directory: boolean;
  modified: string | null;
  /** The stored name was not valid UTF-8; the extracted name will differ. */
  nameRepaired: boolean;
};

export type ArchiveListing = {
  format: string;
  entries: ArchiveEntry[];
  /** Entries the archive declares that the backend refuses to extract. */
  refused: { name: string; reason: string }[];
  encrypted: boolean;
  truncated: boolean;
};

export type ExtractResult = {
  dest: string;
  entries: number;
  totalBytes: number;
};

export type CompressResult = {
  dest: string;
  entries: number;
  bytes: number;
};

export type ArchiveJob = {
  id: string;
  state: "running" | "done" | "failed";
  percent: number;
  entriesDone: number;
  entriesTotal: number;
  result?: ExtractResult;
  error?: string;
};
