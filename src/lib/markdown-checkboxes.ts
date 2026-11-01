/** Ensure bare `[ ]` lines render as GFM task lists in the viewer. */
export function prepareMarkdownTaskListsForRender(source: string): string {
  return source.replace(
    /^([ \t]*)\[([ xX])\]([ \t]+|\s*$)/gm,
    (match, indent: string, mark: string, rest: string, offset: number) => {
      const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
      const beforeMarker = source.slice(lineStart, offset + indent.length);
      if (/(?:[-*+]|\d+[.)])\s*$/.test(beforeMarker)) return match;
      return `${indent}- [${mark}]${rest}`;
    },
  );
}

export function toggleMarkdownCheckboxAt(
  source: string,
  index: number,
  checked: boolean,
): string {
  let current = 0;
  const nextMark = checked ? "x" : " ";
  const lines = source.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    const listMatch = line.match(/^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\](.*)$/);
    if (listMatch) {
      if (current === index) {
        lines[lineIndex] = `${listMatch[1]}[${nextMark}]${listMatch[3]}`;
        return lines.join("\n");
      }
      current += 1;
      continue;
    }
    const bareMatch = line.match(/^([ \t]*)\[([ xX])\]([ \t]+.*|\s*)$/);
    if (bareMatch) {
      if (current === index) {
        lines[lineIndex] = `${bareMatch[1]}[${nextMark}]${bareMatch[3]}`;
        return lines.join("\n");
      }
      current += 1;
    }
  }
  return source;
}
