export type AIResponseSegment = {
  text: string;
  bold: boolean;
};

export type AIResponseBlock = {
  kind: 'heading' | 'bullet' | 'paragraph';
  marker: string;
  segments: AIResponseSegment[];
};

function inlineSegments(value: string): AIResponseSegment[] {
  const readable = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  const segments: AIResponseSegment[] = [];
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let offset = 0;
  for (const match of readable.matchAll(boldPattern)) {
    const index = match.index ?? 0;
    if (index > offset) {
      segments.push({ text: readable.slice(offset, index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    offset = index + match[0].length;
  }
  if (offset < readable.length) {
    segments.push({ text: readable.slice(offset), bold: false });
  }
  return segments.length ? segments : [{ text: readable, bold: false }];
}

export function parseAIResponseBlocks(content: string): AIResponseBlock[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const heading = line.match(/^#{1,3}\s+(.+)$/);
      if (heading) {
        return {
          kind: 'heading' as const,
          marker: '',
          segments: inlineSegments(heading[1]),
        };
      }
      const bullet = line.match(/^[-*•]\s+(.+)$/);
      if (bullet) {
        return {
          kind: 'bullet' as const,
          marker: '•',
          segments: inlineSegments(bullet[1]),
        };
      }
      const numbered = line.match(/^(\d+[.)])\s+(.+)$/);
      if (numbered) {
        return {
          kind: 'bullet' as const,
          marker: numbered[1],
          segments: inlineSegments(numbered[2]),
        };
      }
      return {
        kind: 'paragraph' as const,
        marker: '',
        segments: inlineSegments(line),
      };
    });
}
