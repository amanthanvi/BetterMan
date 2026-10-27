/** Damerau-Levenshtein distance; only small name candidates reach this. */
export function nameEditDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const maximum = a.length + b.length;
  const rows = Array.from({ length: a.length + 2 }, () => Array<number>(b.length + 2).fill(0));
  for (let i = 0; i <= a.length; i += 1) {
    rows[i + 1][0] = maximum;
    rows[i + 1][1] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    rows[0][j + 1] = maximum;
    rows[1][j + 1] = j;
  }
  const lastRow = new Map<string, number>();
  for (let i = 1; i <= a.length; i += 1) {
    let lastColumn = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const previousRow = lastRow.get(b[j - 1]) ?? 0;
      const previousColumn = lastColumn;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      if (cost === 0) lastColumn = j;
      rows[i + 1][j + 1] = Math.min(
        rows[i][j] + cost,
        rows[i + 1][j] + 1,
        rows[i][j + 1] + 1,
        rows[previousRow][previousColumn] + (i - previousRow - 1) + 1 + (j - previousColumn - 1),
      );
    }
    lastRow.set(a[i - 1], i);
  }
  return rows[a.length + 1][b.length + 1];
}
