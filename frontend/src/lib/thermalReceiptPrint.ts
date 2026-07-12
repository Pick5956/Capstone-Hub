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

export function printThermalReceipt(elementId: string) {
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
  style.textContent = thermalPrintCss;

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
