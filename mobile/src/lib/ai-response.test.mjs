import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAIResponseBlocks } from './ai-response.ts';

test('AI markdown is converted into native heading, list, and paragraph blocks', () => {
  assert.deepEqual(parseAIResponseBlocks([
    '## สรุปวันนี้',
    '',
    '- **สต็อกต่ำ** 2 รายการ',
    '1. เติมของก่อนเปิดร้าน',
    'ยอดขายปกติ',
  ].join('\n')), [
    {
      kind: 'heading',
      marker: '',
      segments: [{ text: 'สรุปวันนี้', bold: false }],
    },
    {
      kind: 'bullet',
      marker: '•',
      segments: [
        { text: 'สต็อกต่ำ', bold: true },
        { text: ' 2 รายการ', bold: false },
      ],
    },
    {
      kind: 'bullet',
      marker: '1.',
      segments: [{ text: 'เติมของก่อนเปิดร้าน', bold: false }],
    },
    {
      kind: 'paragraph',
      marker: '',
      segments: [{ text: 'ยอดขายปกติ', bold: false }],
    },
  ]);
});

test('AI response parser keeps malformed markdown readable', () => {
  assert.deepEqual(parseAIResponseBlocks('**ยังไม่ปิด'), [{
    kind: 'paragraph',
    marker: '',
    segments: [{ text: '**ยังไม่ปิด', bold: false }],
  }]);
  assert.deepEqual(parseAIResponseBlocks('   \n'), []);
});
