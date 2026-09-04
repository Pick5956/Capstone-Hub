import { forwardRef } from 'react';
import { View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import type { DisplayLanguage } from '@/src/lib/display-preferences';
import { RECEIPT_WIDTH_DOTS_58MM } from '@/src/lib/printer';
import { buildReceiptModel, type ReceiptRestaurant } from '@/src/lib/receipt';
import type { Bill } from '@/src/types/order';

// Thermal paper has exactly two colours, so the slip is drawn in pure black on
// pure white and never borrows the app palette - the dark theme would otherwise
// raster into a solid black block.
const INK = '#000000';
const PAPER = '#FFFFFF';

// A dashed rule survives thresholding better than a hairline, which can fall
// between dots and disappear entirely on some rolls.
function Rule() {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: INK,
        borderStyle: 'dashed',
        marginVertical: 8,
      }}
    />
  );
}

/**
 * The printable receipt, laid out at the exact dot width of a 58 mm head. It is
 * rendered off-screen and captured with react-native-view-shot, then sent to the
 * printer as a bitmap - Thai text is drawn by the phone's font stack instead of
 * relying on a Thai code page the XP-58IIH firmware does not have.
 */
export const ReceiptSlip = forwardRef<View, {
  bill: Bill;
  restaurant?: ReceiptRestaurant;
  language?: DisplayLanguage;
}>(function ReceiptSlip({ bill, restaurant, language = 'th' }, ref) {
  const model = buildReceiptModel(bill, restaurant, language);

  return (
    <View
      // Android's view flattening would otherwise drop this container from the
      // native tree and leave view-shot with nothing to capture.
      collapsable={false}
      ref={ref}
      style={{
        width: RECEIPT_WIDTH_DOTS_58MM,
        backgroundColor: PAPER,
        paddingHorizontal: 16,
        paddingTop: 16,
        // The tail gives the cutter something to bite into, but every blank row
        // is still raster bytes on a link that pushes 512 of them every 35 ms,
        // so it stays as short as the tear bar allows.
        paddingBottom: 24,
      }}
    >
      <View style={{ alignItems: 'center', gap: 2 }}>
        {model.heading.map((line, index) => (
          <Text
            key={line}
            style={{
              color: INK,
              textAlign: 'center',
              fontSize: index === 0 ? 22 : 13,
              lineHeight: index === 0 ? 30 : 19,
              fontWeight: index === 0 ? '700' : '400',
            }}
          >
            {line}
          </Text>
        ))}
        <Text style={{ color: INK, fontSize: 15, lineHeight: 22, fontWeight: '600', marginTop: 6 }}>
          {model.title}
        </Text>
      </View>

      <Rule />

      <View style={{ gap: 3 }}>
        {model.meta.map((entry) => (
          <View key={entry.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ color: INK, fontSize: 13, lineHeight: 20, width: 118 }}>
              {entry.label}
            </Text>
            <Text style={{ color: INK, fontSize: 13, lineHeight: 20, flex: 1, fontWeight: '500' }}>
              {entry.value}
            </Text>
          </View>
        ))}
      </View>

      <Rule />

      <View style={{ gap: 7 }}>
        {model.items.map((item) => (
          <View key={item.key} style={{ gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Text style={{ color: INK, fontSize: 14, lineHeight: 21, fontWeight: '600', minWidth: 26 }}>
                {item.quantity}×
              </Text>
              <Text style={{ color: INK, fontSize: 14, lineHeight: 21, flex: 1 }}>
                {item.name}
              </Text>
              <Text style={{ color: INK, fontSize: 14, lineHeight: 21, fontWeight: '500' }}>
                {item.amount}
              </Text>
            </View>
            {item.options ? (
              <Text style={{ color: INK, fontSize: 12, lineHeight: 18, marginLeft: 32 }}>
                + {item.options}
              </Text>
            ) : null}
            {item.note ? (
              <Text style={{ color: INK, fontSize: 12, lineHeight: 18, marginLeft: 32 }}>
                * {item.note}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Rule />

      <View style={{ gap: 3 }}>
        {model.totals.map((total) => (
          <View
            key={total.key}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
              marginTop: total.emphasis ? 4 : 0,
            }}
          >
            <Text
              style={{
                color: INK,
                flex: 1,
                fontSize: total.emphasis ? 17 : 13,
                lineHeight: total.emphasis ? 25 : 20,
                fontWeight: total.emphasis ? '600' : '400',
              }}
            >
              {total.label}
            </Text>
            <Text
              style={{
                color: INK,
                fontSize: total.emphasis ? 18 : 13,
                lineHeight: total.emphasis ? 26 : 20,
                fontWeight: total.emphasis ? '600' : '500',
              }}
            >
              {total.amount}
            </Text>
          </View>
        ))}
      </View>

      <Text style={{ color: INK, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
        {model.paymentLine}
      </Text>

      <Rule />

      <Text style={{ color: INK, fontSize: 14, lineHeight: 21, textAlign: 'center', fontWeight: '500' }}>
        {model.footer}
      </Text>
    </View>
  );
});
