import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECEIPT_MAX_BAND_HEIGHT,
  RECEIPT_WIDTH_DOTS_58MM,
  planReceiptRasterBands,
  describePrinterFailure,
  findSavedPrinter,
  isBluetoothPrinterAddress,
  looksLikeReceiptPrinter,
  mergeScannedPrinters,
  normalizeMacAddress,
  parseScannedDevice,
  parseScannedDeviceList,
  toBluetoothPrinterAddress,
} from './printer.ts';

test('the 58 mm slip is rastered at the printer head width', () => {
  assert.equal(RECEIPT_WIDTH_DOTS_58MM, 384);
});

test('normalizeMacAddress accepts the shapes platforms actually report', () => {
  assert.equal(normalizeMacAddress('aa:bb:cc:dd:ee:ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMacAddress('AA-BB-CC-DD-EE-FF'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMacAddress('aabbccddeeff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMacAddress('  AA:BB:CC:DD:EE:FF  '), 'AA:BB:CC:DD:EE:FF');
});

test('normalizeMacAddress rejects anything that is not a MAC', () => {
  assert.equal(normalizeMacAddress(''), null);
  assert.equal(normalizeMacAddress(null), null);
  assert.equal(normalizeMacAddress(undefined), null);
  assert.equal(normalizeMacAddress('AA:BB:CC:DD:EE'), null);
  assert.equal(normalizeMacAddress('AA:BB:CC:DD:EE:FF:00'), null);
  assert.equal(normalizeMacAddress('ZZ:BB:CC:DD:EE:FF'), null);
  assert.equal(normalizeMacAddress('192.168.1.10'), null);
});

test('toBluetoothPrinterAddress adds the transport prefix exactly once', () => {
  assert.equal(
    toBluetoothPrinterAddress('aa:bb:cc:dd:ee:ff'),
    'bt:AA:BB:CC:DD:EE:FF',
  );
  assert.equal(
    toBluetoothPrinterAddress('bt:aa:bb:cc:dd:ee:ff'),
    'bt:AA:BB:CC:DD:EE:FF',
  );
  assert.equal(
    toBluetoothPrinterAddress('BT:AA:BB:CC:DD:EE:FF'),
    'bt:AA:BB:CC:DD:EE:FF',
  );
  assert.equal(toBluetoothPrinterAddress('not-a-printer'), null);
});

test('isBluetoothPrinterAddress guards a stored selection before dialling it', () => {
  assert.equal(isBluetoothPrinterAddress('bt:AA:BB:CC:DD:EE:FF'), true);
  assert.equal(isBluetoothPrinterAddress('lan:192.168.1.10:9100'), false);
  assert.equal(isBluetoothPrinterAddress(''), false);
});

test('looksLikeReceiptPrinter recognises the usual advertised names', () => {
  assert.equal(looksLikeReceiptPrinter('XP-58IIH'), true);
  assert.equal(looksLikeReceiptPrinter('Xprinter_2D33'), true);
  assert.equal(looksLikeReceiptPrinter('BlueTooth Printer'), true);
  assert.equal(looksLikeReceiptPrinter('RPP02N'), true);
  assert.equal(looksLikeReceiptPrinter('POS-58'), true);
  assert.equal(looksLikeReceiptPrinter('Galaxy Buds'), false);
  assert.equal(looksLikeReceiptPrinter(''), false);
  assert.equal(looksLikeReceiptPrinter(null), false);
});

test('parseScannedDeviceList reads the JSON string the native module emits', () => {
  const devices = parseScannedDeviceList(
    '[{"name":"Printer001","address":"AA:BB:CC:DD:EE:FF","deviceType":"bt"}]',
  );

  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, 'Printer001');
  assert.equal(devices[0].address, 'AA:BB:CC:DD:EE:FF');
});

test('parseScannedDeviceList also accepts an already-parsed array', () => {
  const devices = parseScannedDeviceList([{ name: 'Printer001', address: 'AA:BB:CC:DD:EE:FF' }]);

  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, 'Printer001');
});

test('parseScannedDeviceList survives every malformed payload', () => {
  assert.deepEqual(parseScannedDeviceList('[]'), []);
  assert.deepEqual(parseScannedDeviceList('not json'), []);
  assert.deepEqual(parseScannedDeviceList('{"paired":1}'), []);
  assert.deepEqual(parseScannedDeviceList(undefined), []);
  assert.deepEqual(parseScannedDeviceList(null), []);
  assert.deepEqual(parseScannedDeviceList(42), []);
  assert.deepEqual(parseScannedDeviceList('[null,3,"x"]'), []);
});

test('parseScannedDevice reads a single device event payload', () => {
  const device = parseScannedDevice('{"name":"Printer001","address":"AA:BB:CC:DD:EE:FF"}');

  assert.equal(device?.address, 'AA:BB:CC:DD:EE:FF');
  assert.equal(parseScannedDevice('[]'), null);
  assert.equal(parseScannedDevice('nope'), null);
  assert.equal(parseScannedDevice(null), null);
  assert.equal(parseScannedDevice(7), null);
});

test('a paired-devices event feeds straight into the printer list', () => {
  const printers = mergeScannedPrinters(
    parseScannedDeviceList(
      '[{"name":"Printer001","address":"AA:BB:CC:DD:EE:FF","deviceType":"bt"},{"name":"Monster Airmars XKT08","address":"11:22:33:44:55:66","deviceType":"bt"}]',
    ),
    [],
  );

  assert.deepEqual(
    printers.map((printer) => printer.name),
    ['Printer001', 'Monster Airmars XKT08'],
  );
  assert.equal(printers[0].address, 'bt:AA:BB:CC:DD:EE:FF');
  assert.equal(printers[0].paired, true);
});

test('mergeScannedPrinters keeps paired devices first, then likely printers', () => {
  const merged = mergeScannedPrinters(
    [{ name: 'Galaxy Buds', address: '11:22:33:44:55:66' }],
    [
      { name: 'Car Audio', address: '77:88:99:AA:BB:CC' },
      { name: 'XP-58IIH', address: 'aa:bb:cc:dd:ee:ff' },
    ],
  );

  assert.deepEqual(
    merged.map((printer) => printer.name),
    ['Galaxy Buds', 'XP-58IIH', 'Car Audio'],
  );
  assert.deepEqual(
    merged.map((printer) => printer.paired),
    [true, false, false],
  );
});

test('mergeScannedPrinters deduplicates a device seen in both lists', () => {
  const merged = mergeScannedPrinters(
    [{ name: 'XP-58IIH', address: 'AA:BB:CC:DD:EE:FF' }],
    [{ name: 'XP-58IIH', address: 'aa:bb:cc:dd:ee:ff' }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].address, 'bt:AA:BB:CC:DD:EE:FF');
  assert.equal(merged[0].paired, true);
});

test('mergeScannedPrinters recovers a name from whichever list carried one', () => {
  const merged = mergeScannedPrinters(
    [{ name: '', address: 'AA:BB:CC:DD:EE:FF' }],
    [{ name: 'XP-58IIH', address: 'AA:BB:CC:DD:EE:FF' }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'XP-58IIH');
  assert.equal(merged[0].paired, true);
});

test('mergeScannedPrinters falls back to the MAC when a device has no name', () => {
  const merged = mergeScannedPrinters([{ address: 'AA:BB:CC:DD:EE:FF' }], []);

  assert.equal(merged[0].name, 'AA:BB:CC:DD:EE:FF');
});

test('mergeScannedPrinters drops entries without a usable address', () => {
  const merged = mergeScannedPrinters(
    [{ name: 'Ghost', address: null }, { name: 'Broken', address: 'nope' }],
    [{ name: 'Nameless', address: undefined }],
  );

  assert.deepEqual(merged, []);
});

test('mergeScannedPrinters handles an empty scan', () => {
  assert.deepEqual(mergeScannedPrinters(), []);
  assert.deepEqual(mergeScannedPrinters([], []), []);
});

test('findSavedPrinter matches a stored selection regardless of casing', () => {
  const printers = mergeScannedPrinters(
    [{ name: 'XP-58IIH', address: 'AA:BB:CC:DD:EE:FF' }],
    [],
  );

  assert.equal(
    findSavedPrinter(printers, { address: 'bt:aa:bb:cc:dd:ee:ff', name: 'XP-58IIH' })?.name,
    'XP-58IIH',
  );
  assert.equal(findSavedPrinter(printers, null), null);
  assert.equal(
    findSavedPrinter(printers, { address: 'bt:00:00:00:00:00:00', name: 'Other' }),
    null,
  );
  assert.equal(findSavedPrinter(printers, { address: 'garbage', name: 'Other' }), null);
});

test('describePrinterFailure translates the codes a waiter can act on', () => {
  assert.match(describePrinterFailure('BLUETOOTH_NOT_ENABLED', 'th'), /บลูทูธปิดอยู่/);
  assert.match(describePrinterFailure('BLUETOOTH_NOT_ENABLED', 'en'), /Bluetooth is off/);
  assert.match(describePrinterFailure('NO_PRINTER_SELECTED', 'th'), /ยังไม่ได้เลือกเครื่องพิมพ์/);
  assert.match(describePrinterFailure('UNSUPPORTED_PLATFORM', 'en'), /Android only/);
});

test('describePrinterFailure surfaces an unknown code instead of swallowing it', () => {
  assert.equal(
    describePrinterFailure('SOME_NEW_FIRMWARE_CODE', 'th', 'Printer said no'),
    'Printer said no',
  );
  assert.equal(describePrinterFailure(null, 'th'), 'พิมพ์ใบเสร็จไม่สำเร็จ');
  assert.equal(describePrinterFailure(undefined, 'en'), 'Could not print the receipt.');
  assert.equal(describePrinterFailure('', 'en', '   '), 'Could not print the receipt.');
});

test('a short receipt stays a single band, exactly as before banding existed', () => {
  assert.deepEqual(planReceiptRasterBands(500), [{ originY: 0, height: 500 }]);
  assert.deepEqual(
    planReceiptRasterBands(RECEIPT_MAX_BAND_HEIGHT),
    [{ originY: 0, height: RECEIPT_MAX_BAND_HEIGHT }],
  );
});

test('a tall receipt is split into bands that never exceed the limit', () => {
  const bands = planReceiptRasterBands(1500, 600);

  assert.equal(bands.length, 3);
  bands.forEach((band) => assert.ok(band.height <= 600, `${band.height} <= 600`));
});

test('bands tile the receipt with no gap and no overlap', () => {
  for (const total of [601, 1000, 1500, 1801, 2345, 5000]) {
    const bands = planReceiptRasterBands(total, 600);

    assert.equal(bands[0].originY, 0, `first band starts at 0 for ${total}`);
    bands.forEach((band, index) => {
      if (index === 0) return;
      const previous = bands[index - 1];
      assert.equal(
        band.originY,
        previous.originY + previous.height,
        `band ${index} continues the previous one for ${total}`,
      );
    });

    const covered = bands.reduce((sum, band) => sum + band.height, 0);
    assert.equal(covered, total, `bands cover the whole slip for ${total}`);
  }
});

test('bands are divided evenly so the last one is never a sliver', () => {
  // 1210 over a 600 limit would leave a 10 dot tail if it packed full bands
  // first; splitting evenly gives three usable bands instead.
  const bands = planReceiptRasterBands(1210, 600);

  assert.equal(bands.length, 3);
  assert.deepEqual(bands.map((band) => band.height), [404, 403, 403]);
});

test('planReceiptRasterBands rejects heights that cannot be printed', () => {
  assert.deepEqual(planReceiptRasterBands(0), []);
  assert.deepEqual(planReceiptRasterBands(-100), []);
  assert.deepEqual(planReceiptRasterBands(Number.NaN), []);
});

test('an unusable band limit falls back to sending the slip whole', () => {
  assert.deepEqual(planReceiptRasterBands(1500, 0), [{ originY: 0, height: 1500 }]);
  assert.deepEqual(planReceiptRasterBands(1500, -10), [{ originY: 0, height: 1500 }]);
});
