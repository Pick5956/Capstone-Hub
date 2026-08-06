const PRINT_ROOT_ATTRIBUTE = "data-thermal-print-root";

const thermalPrintCss = `
  @media print {
    @page { size: 58mm 210mm; margin: 0; }

    html,
    body {
      width: 58mm !important;
      min-width: 58mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: #fff !important;
    }

    body > *:not([${PRINT_ROOT_ATTRIBUTE}]) {
      display: none !important;
    }

    [${PRINT_ROOT_ATTRIBUTE}] {
      position: static !important;
      display: block !important;
      width: 58mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      color: #000 !important;
      background: #fff !important;
    }

    [${PRINT_ROOT_ATTRIBUTE}] > * {
      width: 48mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 auto !important;
      overflow: visible !important;
    }
  }
`;

// A4 keeps the on-screen receipt layout instead of the 48mm strip: the browser
// paginates it, so nothing here fixes a width or a page count.
const a4PrintCss = `
  @media print {
    @page { size: A4; margin: 14mm; }

    html,
    body {
      width: auto !important;
      min-width: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: #fff !important;
    }

    body > *:not([${PRINT_ROOT_ATTRIBUTE}]) {
      display: none !important;
    }

    [${PRINT_ROOT_ATTRIBUTE}],
    [${PRINT_ROOT_ATTRIBUTE}] > * {
      position: static !important;
      display: block !important;
      width: auto !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      color: #111827 !important;
      background: #fff !important;
    }

    /* The clone still sits under <html class="dark">, so every dark: colour
       would follow it onto the page — white text on white paper. Paper is
       monochrome anyway, so flatten the whole subtree instead of chasing
       each dark: utility one at a time. */
    [${PRINT_ROOT_ATTRIBUTE}] * {
      color: #111827 !important;
      background: transparent !important;
      border-color: #d1d5db !important;
    }
  }
`;

function printClone(elementId: string, css: string) {
  const source = document.getElementById(elementId);
  if (!source) return false;

  document.querySelector(`[${PRINT_ROOT_ATTRIBUTE}]`)?.remove();
  document.querySelector("style[data-thermal-print-style]")?.remove();

  const printRoot = document.createElement("div");
  printRoot.setAttribute(PRINT_ROOT_ATTRIBUTE, "");
  printRoot.setAttribute("aria-hidden", "true");
  printRoot.append(source.cloneNode(true));

  const style = document.createElement("style");
  style.setAttribute("data-thermal-print-style", "");
  style.textContent = css;

  document.head.append(style);
  document.body.append(printRoot);

  const cleanup = () => {
    printRoot.remove();
    style.remove();
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();

  return true;
}

export const printThermalReceipt = (elementId: string) => printClone(elementId, thermalPrintCss);

export const printA4 = (elementId: string) => printClone(elementId, a4PrintCss);
