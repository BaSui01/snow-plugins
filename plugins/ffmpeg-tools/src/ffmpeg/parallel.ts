/**
 * Runs async work over a list with a fixed number of concurrent lanes. Tools that
 * probe many inputs use it so N ffprobe spawns do not serialize.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const lanes = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  const runners = Array.from({ length: lanes }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}
