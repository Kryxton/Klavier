// Lines of a score on sheets of paper: as many as fit, never part of a line. A line taller than
// a sheet still gets one of its own.
export function paginate(heights: number[], firstSheet: number, sheet: number) {
  const sheets: number[][] = [[]];
  let left = firstSheet;
  heights.forEach((height, line) => {
    if (height > left && sheets[sheets.length - 1].length) {
      sheets.push([]);
      left = sheet;
    }
    sheets[sheets.length - 1].push(line);
    left -= height;
  });
  return sheets;
}
