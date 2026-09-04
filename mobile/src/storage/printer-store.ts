import * as SecureStore from 'expo-secure-store';

import { toBluetoothPrinterAddress, type SavedPrinter } from '@/src/lib/printer';

// The selected printer is per-device, not per-account: a phone sits next to one
// physical printer at the counter, and switching restaurants or staff should not
// make it forget which one that is.
const SELECTED_PRINTER_KEY = 'dishy_selected_printer';

export async function getSelectedPrinter(): Promise<SavedPrinter | null> {
  const raw = await SecureStore.getItemAsync(SELECTED_PRINTER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SavedPrinter>;
    const address = toBluetoothPrinterAddress(parsed?.address);
    if (!address) return null;
    return {
      address,
      name: String(parsed?.name || '').trim() || address,
    };
  } catch {
    return null;
  }
}

export async function setSelectedPrinter(printer: SavedPrinter) {
  const address = toBluetoothPrinterAddress(printer.address);
  if (!address) throw new Error('Invalid printer address');

  await SecureStore.setItemAsync(
    SELECTED_PRINTER_KEY,
    JSON.stringify({ address, name: printer.name }),
  );
}

export async function clearSelectedPrinter() {
  await SecureStore.deleteItemAsync(SELECTED_PRINTER_KEY);
}
