// Pixels a page's content drew, from a canvas's RGBA data: opaque and darker than the white page under it.
export function ink(rgba: ArrayLike<number>) {
  let count = 0
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] && rgba[i] + rgba[i + 1] + rgba[i + 2] < 600) count++
  return count
}
