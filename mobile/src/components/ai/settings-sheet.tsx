import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';

import { getAISettings, updateAISettings } from '@/src/api/ai';
import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { readFollowUpsEnabled, writeCachedOwnerTitle, writeFollowUpsEnabled } from '@/src/lib/ai-prefs';
import type { DisplayLanguage } from '@/src/lib/display-preferences';
import { AI_ACTION_TYPES, type AIActionType, type AIInsightKind, type AISettingsPatch, type AISettingsView } from '@/src/types/ai';

import { BottomSheet, GlassButton } from './chrome';
import { ai } from './theme';

// Settings the way a phone does them: a short list of subjects, each opening its
// own page, rather than every switch in the product on one scroll. Switches save
// as they are flipped; there is no save button to forget.
//
// The trash and chat recovery stay on the web, where there is room to show what
// is in it.

type Page = 'root' | 'title' | 'actions' | 'notifications';

const ACTION_LABELS: Record<AIActionType, { th: string; en: string }> = {
  set_menu_availability: { th: 'เปิด/ปิดขายเมนู', en: 'Menu availability' },
  set_menu_price: { th: 'เปลี่ยนราคาเมนู', en: 'Menu price' },
  create_menu_item: { th: 'เพิ่มเมนูใหม่', en: 'Create menu item' },
  adjust_ingredient_stock: { th: 'ปรับจำนวนสต๊อก', en: 'Adjust stock' },
  set_ingredient_min_stock: { th: 'ตั้งขั้นต่ำวัตถุดิบ', en: 'Minimum stock' },
  set_ingredient_cost: { th: 'เปลี่ยนต้นทุนวัตถุดิบ', en: 'Ingredient cost' },
  create_ingredient: { th: 'เพิ่มวัตถุดิบใหม่', en: 'Create ingredient' },
  create_expense: { th: 'บันทึกรายจ่าย', en: 'Record expense' },
};

const INSIGHT_ROWS: { key: AIInsightKind; pair?: AIInsightKind; th: string; en: string }[] = [
  { key: 'ingredient_low', th: 'ของใกล้หมด', en: 'Low stock' },
  { key: 'dead_stock', th: 'ของค้างสต๊อก', en: 'Dead stock' },
  { key: 'sales_drop', pair: 'sales_up', th: 'ยอดขายผิดปกติ', en: 'Unusual sales' },
  { key: 'plowhorse', th: 'เมนูขายดีแต่กำไรต่ำ', en: 'Popular but low margin' },
];

function GroupLabel({ text }: { text: string }) {
  return (
    <Text style={{ fontSize: 13, color: ai.faded, paddingHorizontal: 18, paddingBottom: 7, paddingTop: 20 }}>{text}</Text>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: ai.surface, borderRadius: 18, overflow: 'hidden', marginHorizontal: 12 }}>
      {children}
    </View>
  );
}

/** One line in a group: taps through to a page, or carries its own switch. */
function Row({
  icon,
  label,
  detail,
  value,
  onPress,
  toggle,
  disabled,
  first,
}: {
  icon?: AppIconName;
  label: string;
  detail?: string;
  /** Shown greyed on the right, the way a settings list shows current state. */
  value?: string;
  onPress?: () => void;
  toggle?: { on: boolean; onChange: (next: boolean) => void };
  disabled?: boolean;
  first?: boolean;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 56,
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon ? <AppIcon name={icon} size={22} color={ai.body} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: ai.ink }}>{label}</Text>
        {detail ? <Text style={{ fontSize: 12.5, color: ai.faded, marginTop: 1 }}>{detail}</Text> : null}
      </View>
      {value ? <Text style={{ fontSize: 15, color: ai.faded, maxWidth: 150 }} numberOfLines={1}>{value}</Text> : null}
      {toggle ? (
        <Switch
          value={toggle.on}
          onValueChange={toggle.onChange}
          disabled={disabled}
          trackColor={{ true: '#fb923c', false: '#e5e7eb' }}
          thumbColor="#ffffff"
        />
      ) : null}
      {onPress ? <AppIcon name="chevron-forward" size={18} color={ai.ghost} /> : null}
    </View>
  );
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: '#f1f0ee' }}>
      {onPress ? (
        <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? '#f6f4f0' : 'transparent' })}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
}

export function SettingsSheet({
  open,
  onClose,
  language,
  onOwnerTitle,
  onFollowUps,
}: {
  open: boolean;
  onClose: () => void;
  language: DisplayLanguage;
  onOwnerTitle: (title: string) => void;
  onFollowUps: (enabled: boolean) => void;
}) {
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const [page, setPage] = useState<Page>('root');
  const [settings, setSettings] = useState<AISettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState(true);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setPage('root');
    setError(null);
    void readFollowUpsEnabled().then((enabled) => { if (active) setFollowUps(enabled); });
    getAISettings()
      .then((view) => {
        if (!active) return;
        setSettings(view);
        setTitle(view.owner_title ?? '');
      })
      .catch(() => { if (active) setError(t('โหลดการตั้งค่าไม่สำเร็จ', 'Could not load settings')); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = async (change: AISettingsPatch) => {
    if (!settings) return;
    const previous = settings;
    setSettings({
      ...settings,
      ...(change.actions_enabled !== undefined ? { actions_enabled: change.actions_enabled } : {}),
      action_types: { ...settings.action_types, ...(change.action_types ?? {}) },
      insight_kinds: { ...settings.insight_kinds, ...(change.insight_kinds ?? {}) },
      ...(change.owner_title !== undefined ? { owner_title: change.owner_title } : {}),
    });
    try {
      const saved = await updateAISettings(change);
      setSettings(saved);
      if (change.owner_title !== undefined) {
        await writeCachedOwnerTitle(saved.owner_title ?? '');
        onOwnerTitle(saved.owner_title ?? '');
      }
    } catch {
      setSettings(previous);
      setError(t('บันทึกไม่สำเร็จ ลองอีกครั้ง', 'Could not save, try again'));
    }
  };

  const commitTitle = () => {
    const next = title.trim();
    if (!settings || next === (settings.owner_title ?? '')) return;
    void patch({ owner_title: next });
  };

  const actionsOnCount = settings
    ? AI_ACTION_TYPES.filter((type) => settings.action_types?.[type]).length
    : 0;
  const insightsOnCount = settings
    ? INSIGHT_ROWS.filter((row) => settings.insight_kinds?.[row.key]).length
    : 0;

  const heading = page === 'root'
    ? t('การตั้งค่า', 'Settings')
    : page === 'title'
      ? t('ชื่อที่เรียกคุณ', 'What it calls you')
      : page === 'actions'
        ? t('สิ่งที่ทำแทนคุณได้', 'What it may change')
        : t('การแจ้งเตือน', 'Notifications');

  const loading = !settings ? (
    <View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator color={ai.orange} /></View>
  ) : null;

  return (
    <BottomSheet open={open} onClose={onClose} heightFraction={1} background="#f4f2ee" label={t('ปิดตั้งค่า', 'Close settings')}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10, gap: 8 }}>
          {/* Back sits where a back button belongs; close sits under the thumb
              that opened the sheet. Each side keeps a slot so the title stays centred. */}
          {page === 'root' ? (
            <View style={{ width: 44 }} />
          ) : (
            <GlassButton icon="chevron-back" label={t('ย้อนกลับ', 'Back')} onPress={() => setPage('root')} size={44} />
          )}
          <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: ai.ink }}>{heading}</Text>
          {page === 'root' ? (
            <GlassButton icon="close" label={t('ปิด', 'Close')} onPress={onClose} size={44} />
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          {error ? (
            <Text style={{ fontSize: 13, color: '#dc2626', paddingHorizontal: 18, paddingBottom: 8 }}>{error}</Text>
          ) : null}

          {page === 'root' ? (
            <>
              <GroupLabel text={t('ผู้ช่วย', 'Assistant')} />
              <Group>
                <Row
                  first
                  icon="person-circle-outline"
                  label={t('ชื่อที่เรียกคุณ', 'What it calls you')}
                  value={settings?.owner_title?.trim() || t('คุณผู้จัดการ', 'Manager')}
                  onPress={() => setPage('title')}
                />
                <Row
                  icon="sparkles-outline"
                  label={t('คำถามแนะนำ', 'Suggested questions')}
                  detail={t('ชิปถามต่อใต้คำตอบ', 'Follow-up chips under answers')}
                  toggle={{ on: followUps, onChange: (next) => { setFollowUps(next); void writeFollowUpsEnabled(next); onFollowUps(next); } }}
                />
              </Group>

              <GroupLabel text={t('สิ่งที่ผู้ช่วยทำได้', 'What it can do')} />
              <Group>
                <Row
                  first
                  icon="flash-outline"
                  label={t('สิ่งที่ทำแทนคุณได้', 'What it may change')}
                  value={settings ? (settings.actions_enabled ? t(`เปิด ${actionsOnCount} อย่าง`, `${actionsOnCount} on`) : t('ปิดอยู่', 'Off')) : undefined}
                  onPress={() => setPage('actions')}
                />
                <Row
                  icon="notifications-outline"
                  label={t('การแจ้งเตือน', 'Notifications')}
                  value={settings ? t(`เปิด ${insightsOnCount} อย่าง`, `${insightsOnCount} on`) : undefined}
                  onPress={() => setPage('notifications')}
                />
              </Group>

              <GroupLabel text={t('แชท', 'Chats')} />
              <Group>
                <Row
                  first
                  icon="trash-outline"
                  label={t('ถังขยะและการกู้คืนแชท', 'Trash and chat recovery')}
                  detail={t('อยู่ในตั้งค่าผู้ช่วยบนเว็บ', 'Lives in the web settings')}
                />
              </Group>
            </>
          ) : null}

          {page === 'title' ? (
            <>
              <GroupLabel text={t('ผู้ช่วยจะเรียกคุณแบบนี้ตอนทักทาย', 'The assistant greets you by this')} />
              <Group>
                <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    onBlur={commitTitle}
                    onSubmitEditing={commitTitle}
                    editable={Boolean(settings)}
                    maxLength={40}
                    returnKeyType="done"
                    autoFocus
                    placeholder={t('คุณผู้จัดการ', 'Manager')}
                    placeholderTextColor={ai.faded}
                    accessibilityLabel={t('ชื่อที่เรียกคุณ', 'What it calls you')}
                    style={{ minHeight: 44, fontSize: 17, color: ai.ink, paddingVertical: 0 }}
                  />
                </View>
              </Group>
              <Text style={{ fontSize: 12.5, color: ai.faded, paddingHorizontal: 18, paddingTop: 10 }}>
                {t('เว้นว่างไว้ก็ได้ ผู้ช่วยจะเรียกว่าคุณผู้จัดการ', 'Leave it empty and it says "Manager"')}
              </Text>
            </>
          ) : null}

          {page === 'actions' ? (
            <>
              <GroupLabel text={t('ทุกอย่างยังต้องกดยืนยันก่อนบันทึกเสมอ', 'Everything still needs your confirmation')} />
              {loading ?? (
                <>
                  <Group>
                    <Row
                      first
                      label={t('ให้ผู้ช่วยแก้ข้อมูลได้', 'Allow changes')}
                      toggle={{ on: settings!.actions_enabled, onChange: (next) => { void patch({ actions_enabled: next }); } }}
                      disabled={!settings!.feature_available}
                    />
                  </Group>
                  <GroupLabel text={t('เลือกทีละอย่าง', 'Pick them one by one')} />
                  <Group>
                    {AI_ACTION_TYPES.map((type, index) => (
                      <Row
                        key={type}
                        first={index === 0}
                        label={language === 'th' ? ACTION_LABELS[type].th : ACTION_LABELS[type].en}
                        toggle={{ on: Boolean(settings!.action_types?.[type]), onChange: (next) => { void patch({ action_types: { [type]: next } }); } }}
                        disabled={!settings!.actions_enabled || !settings!.feature_available}
                      />
                    ))}
                  </Group>
                </>
              )}
            </>
          ) : null}

          {page === 'notifications' ? (
            <>
              <GroupLabel text={t('เรื่องที่ขึ้นใน "ควรรู้วันนี้"', 'What shows under "Today\'s insights"')} />
              {loading ?? (
                <Group>
                  {INSIGHT_ROWS.map((row, index) => (
                    <Row
                      key={row.key}
                      first={index === 0}
                      label={language === 'th' ? row.th : row.en}
                      toggle={{
                        on: Boolean(settings!.insight_kinds?.[row.key]),
                        onChange: (next) => {
                          const change: Partial<Record<AIInsightKind, boolean>> = { [row.key]: next };
                          if (row.pair) change[row.pair] = next;
                          void patch({ insight_kinds: change });
                        },
                      }}
                    />
                  ))}
                </Group>
              )}
            </>
          ) : null}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
