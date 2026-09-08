import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { formatCountdown, splitChange } from '@/src/lib/ai-chat';
import type { DisplayLanguage } from '@/src/lib/display-preferences';

import { ai } from './theme';

// The confirm card under a command, a port of the web's InlineDbConfirmBar:
// a countdown ring on the left, what changes in the middle, confirm / cancel
// on the right. Nothing is written until "ยืนยัน"; the server refuses every
// other command while a card is pending, so it always resolves one way.

export type ConfirmItem = { title: string; change: string; unit?: string; sideEffects?: string[] };
export type ConfirmState = 'pending' | 'confirming' | 'done' | 'cancelled' | 'expired';

const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;

function copyFor(language: DisplayLanguage) {
  return language === 'th'
    ? {
        confirm: 'ยืนยัน',
        cancel: 'ยกเลิก',
        reissue: 'ขอคำสั่งใหม่',
        cancelIn: (t: string) => `กดยืนยันภายใน ${t}`,
        done: 'บันทึกลงระบบแล้ว · มีผลทันที',
        cancelled: 'ยกเลิกแล้ว · ไม่มีการแก้ข้อมูล',
        expired: 'คำสั่งหมดอายุ · ไม่มีการแก้ข้อมูล',
        confirmError: 'ยืนยันไม่สำเร็จ ลองอีกครั้ง',
        more: (n: number) => `+ อีก ${n} รายการ`,
      }
    : {
        confirm: 'Confirm',
        cancel: 'Cancel',
        reissue: 'Re-issue',
        cancelIn: (t: string) => `Confirm within ${t}`,
        done: 'Saved · takes effect now',
        cancelled: 'Cancelled · nothing changed',
        expired: 'Expired · nothing changed',
        confirmError: 'Could not confirm, try again',
        more: (n: number) => `+ ${n} more`,
      };
}

export function ConfirmCard({
  summary,
  items,
  warnings,
  detail,
  expiresAt,
  onConfirm,
  onCancel,
  onReissue,
  onResolved,
  initialState = 'pending',
  language,
}: {
  summary: string;
  items: ConfirmItem[];
  warnings?: string[];
  detail: string;
  expiresAt: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onReissue?: () => void;
  onResolved?: (state: ConfirmState) => void;
  initialState?: ConfirmState;
  language: DisplayLanguage;
}) {
  const copy = copyFor(language);
  const [state, setState] = useState<ConfirmState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef(Date.now());
  const expiry = new Date(expiresAt).getTime();
  const totalMs = Math.max(1000, expiry - startedAt.current);
  const remainingMs = Math.max(0, expiry - now);

  useEffect(() => {
    if (state !== 'pending') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state === 'pending' && Number.isFinite(expiry) && remainingMs <= 0) {
      setState('expired');
      onResolved?.('expired');
    }
  }, [expiry, onResolved, remainingMs, state]);

  const confirm = async () => {
    if (state !== 'pending') return;
    setState('confirming');
    setError(null);
    onResolved?.('confirming');
    try {
      await onConfirm();
      setState('done');
      onResolved?.('done');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : copy.confirmError);
      setState('pending');
    }
  };

  const cancel = () => {
    if (state !== 'pending') return;
    setState('cancelled');
    onCancel();
    onResolved?.('cancelled');
  };

  const progress = Math.min(1, Math.max(0, remainingMs / totalMs));
  const urgent = remainingMs < 10_000;
  const ringColour = state === 'done' ? ai.greenIcon : state === 'cancelled' || state === 'expired' ? ai.danger : urgent ? '#d97706' : ai.orange;
  const single = items.length === 1 ? splitChange(items[0].change) : null;
  const statusText = state === 'done' ? copy.done : state === 'cancelled' ? copy.cancelled : state === 'expired' ? copy.expired : null;
  const statusColour = state === 'done' ? ai.green : ai.faint;

  return (
    <View
      style={{
        marginTop: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: state === 'pending' || state === 'confirming' ? ai.orangeLine : '#e5e7eb',
        backgroundColor: ai.surface,
        borderRadius: 22,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={40} height={40} style={{ position: 'absolute' }}>
          <Circle cx={20} cy={20} r={RING_R} stroke="#e5e7eb" strokeWidth={4} fill="none" />
          <Circle
            cx={20}
            cy={20}
            r={RING_R}
            stroke={ringColour}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_C}`}
            strokeDashoffset={state === 'pending' || state === 'confirming' ? RING_C * (1 - progress) : 0}
            transform="rotate(-90 20 20)"
          />
        </Svg>
        {state === 'confirming' ? (
          <ActivityIndicator size="small" color={ai.orange} />
        ) : state === 'done' ? (
          <AppIcon name="checkmark" size={20} color={ai.greenIcon} />
        ) : state === 'cancelled' || state === 'expired' ? (
          <AppIcon name="close" size={20} color={ai.danger} />
        ) : (
          <Text style={{ fontSize: 12, fontWeight: '600', color: ai.ink, fontVariant: ['tabular-nums'] }}>{formatCountdown(remainingMs)}</Text>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: ai.ink }}>
          {items.length === 1 ? items[0].title : summary}
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: ai.faint, marginTop: 2 }}>
          {statusText ?? `${detail} · ${copy.cancelIn(formatCountdown(remainingMs))}`}
        </Text>
        {single ? (
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#f3f4f6', borderRadius: 999, padding: 2, marginTop: 6 }}>
            <Text style={{ paddingHorizontal: 11, paddingVertical: 3, fontSize: 12.5, fontWeight: '600', color: ai.faint, fontVariant: ['tabular-nums'] }}>
              {single.from}{items[0].unit ? ` ${items[0].unit}` : ''}
            </Text>
            <Text
              style={{
                paddingHorizontal: 11,
                paddingVertical: 3,
                fontSize: 12.5,
                fontWeight: '600',
                color: ai.deep,
                backgroundColor: ai.surface,
                borderRadius: 999,
                fontVariant: ['tabular-nums'],
              }}
            >
              {single.to}{items[0].unit ? ` ${items[0].unit}` : ''}
            </Text>
          </View>
        ) : items.length === 1 ? (
          <Text style={{ fontSize: 13, color: ai.faint, marginTop: 4, fontVariant: ['tabular-nums'] }}>
            {items[0].change}{items[0].unit ? ` ${items[0].unit}` : ''}
          </Text>
        ) : (
          <View style={{ marginTop: 4, gap: 2 }}>
            {items.slice(0, 3).map((item, index) => (
              <Text key={`${item.title}-${index}`} numberOfLines={1} style={{ fontSize: 13, color: ai.faint }}>
                <Text style={{ fontWeight: '500', color: ai.body }}>{item.title}</Text>
                {'  '}
                <Text style={{ fontVariant: ['tabular-nums'] }}>{item.change}{item.unit ? ` ${item.unit}` : ''}</Text>
              </Text>
            ))}
            {items.length > 3 ? <Text style={{ fontSize: 12, color: ai.faded }}>{copy.more(items.length - 3)}</Text> : null}
          </View>
        )}
        {items.flatMap((item) => item.sideEffects ?? []).slice(0, 2).map((effect) => (
          <Text key={effect} style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>{effect}</Text>
        ))}
        {(warnings ?? []).slice(0, 2).map((warning) => (
          <Text key={warning} style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>{warning}</Text>
        ))}
        {error ? <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>{error}</Text> : null}
      </View>

      <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
        {state === 'pending' || state === 'confirming' ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={state === 'confirming'}
              onPress={cancel}
              style={({ pressed }) => ({ minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: pressed ? '#f3f4f6' : 'transparent' })}
            >
              <Text style={{ fontSize: 14, fontWeight: '500', color: ai.muted }}>{copy.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={state === 'confirming'}
              onPress={() => { void confirm(); }}
              style={({ pressed }) => ({
                minHeight: 36,
                justifyContent: 'center',
                paddingHorizontal: 16,
                borderRadius: 999,
                backgroundColor: ai.deep,
                opacity: state === 'confirming' ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: '#ffffff' }}>{copy.confirm}</Text>
            </Pressable>
          </>
        ) : state !== 'done' && onReissue ? (
          <Pressable accessibilityRole="button" onPress={onReissue} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '500', color: ai.faint, textDecorationLine: 'underline' }}>{copy.reissue}</Text>
          </Pressable>
        ) : statusText ? (
          <Text style={{ fontSize: 12.5, fontWeight: '500', color: statusColour }}>{statusText}</Text>
        ) : null}
      </View>
    </View>
  );
}
