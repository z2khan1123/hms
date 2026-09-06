/**
 * Compare names the way a ward reads them: GF-9 before GF-10, not after.
 *
 * Plain alphabetical ordering puts GF-10 … GF-14 ahead of GF-9, which looks
 * broken on a bed board where the numbers are physical positions in a room.
 */
const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

export function compareNatural(a: string, b: string): number {
  return collator.compare(a, b);
}

export function byNaturalName<T extends { name: string }>(a: T, b: T): number {
  return compareNatural(a.name, b.name);
}
