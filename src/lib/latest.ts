/**
 * Keeps a value from being overwritten by an older answer.
 *
 * Reads (page loads) take a ticket when they start and may only write if no other write has
 * happened since. A write from a booking always applies, because it is the newest answer.
 * Only successful writes move the version, so a request that fails changes nothing.
 */
export interface LatestGuard {
  /** Call when a read starts. */
  ticket(): number;
  /** Apply a read's result if nothing newer was written since its ticket. Returns whether it applied. */
  applyRead(ticket: number, write: () => void): boolean;
  /** Apply a result that is known to be the newest (e.g. from a booking). */
  applyLatest(write: () => void): void;
}

export function latestGuard(): LatestGuard {
  let version = 0;
  return {
    ticket: () => version,
    applyRead(ticket, write) {
      if (ticket !== version) return false;
      write();
      version++;
      return true;
    },
    applyLatest(write) {
      write();
      version++;
    },
  };
}
