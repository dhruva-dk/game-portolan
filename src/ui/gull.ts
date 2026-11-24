import { INK, PLUMAGE, svgNode } from './ink.ts';

export type Jacket = readonly [string, string];

const BOX = 120;

const LINE = 2.3;

function drawing(first: string, second: string) {
  const line = `stroke="${INK.iron}" stroke-width="${LINE}" stroke-linejoin="round" stroke-linecap="round"`;
  const lens = `fill="${PLUMAGE.lens}" stroke="${PLUMAGE.lens}" stroke-width="1.5" stroke-linejoin="round"`;
  return (
    '<g transform="translate(1 -5)">' +
    `<path d="M-6 132V110C6 98 22 92 40 90L74 88C94 90 110 98 126 112V132Z" fill="${first}" ${line}/>` +
    `<path d="M90 92.5C101 96 110 102 118 110L113 132H95C96 114 95 102 90 92.5Z" fill="${second}" ${line}/>` +
    `<path d="M9 105C16 99 23 96 31 93.5L27 132H7Z" fill="${second}" ${line}/>` +
    `<path d="M57 99 60 132" fill="none" ${line}/>` +
    `<path d="M41 94C41 82 39 74 36 64C30 56 30 40 38 31C45 22 60 19 70 24C77 27 82 33 83 41V47L81 59C80 66 73 71 72 79V94Z" fill="${PLUMAGE.white}" ${line}/>` +
    `<path d="M41 94C41 82 39 74 36 64C30 56 30 40 38 31C36 44 40 57 50 65C57 70 65 72 73 71C72 74 72 76 72 79V94Z" fill="${PLUMAGE.shade}" opacity=".8"/>` +
    `<path d="M37 84C48 89 62 88 75 82L78 94C64 101 48 101 35 95Z" fill="${second}" ${line}/>` +
    `<path d="M82 56 105 58.5C104 63 99 66 93 65.5L82 62.5Z" fill="${PLUMAGE.under}" ${line}/>` +
    `<circle cx="97" cy="61.8" r="2.3" fill="${PLUMAGE.spot}"/>` +
    `<path d="M82 44C93 42 105 46 111 54C112.5 58.5 110 62 107 61C105 58 98 56.5 82 56.5Z" fill="${PLUMAGE.beak}" ${line}/>` +
    `<path d="M89 49.5h4" fill="none" stroke="${INK.iron}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M58 38.5 33 41" fill="none" stroke="${PLUMAGE.lens}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M84 35.5 92 37.5C92.5 41 91 43.5 88.5 44.5L84 43Z" ${lens}/>` +
    `<path d="M56 37C56 34.5 58 33 61 33L82 34C85 34.2 86.5 36 86 39L84.5 46C83.5 50.5 80 52.5 75.5 52.5H66C60 52.5 56.5 49.5 56 44Z" ${lens}/>` +
    `<path d="M61.5 37.5 65 37.7M60.5 41.5 70 37.9" fill="none" stroke="${PLUMAGE.glint}" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>` +
    '</g>'
  );
}

export function bust(jacket: Jacket, size: number): Element {
  const svg = svgNode(BOX, BOX, drawing(jacket[0], jacket[1]));
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('overflow', 'hidden');
  return svg;
}
