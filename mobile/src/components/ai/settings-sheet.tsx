import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';

import { getAISettings, updateAISettings } from '@/src/api/ai';
import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { readFollowUpsEnabled, writeCachedOwnerTitle, writeFollowUpsEnabled } from '@/src/lib/ai-prefs';
import type { DisplayLanguage } from '@/src/lib/display-preferences';
import { AI_ACTION_TYPES, type AIActionType, type AIInsightKind, type AISettingsPatch, type AISettingsView } from '@/src/types/ai';

import { BottomSheet, GlassButton } from './chrome';
import { ai } from './theme';

// "ตั้งค่าผู้ช่วย": the three sections of the web's settings modal that make
// sense on the phone — general (what the assistant calls you, follow-ups),
// what it may change (the eight switches), and the bell's notifications.
// The trash stays on the web. Every switch saves as it is flipped.

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

function Section({ icon, title, detail, children }: { icon: AppIconName; title: string; detail?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: ai.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <AppIcon name={icon} size={16} color={ai.deep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: ai.ink }}>{title}</Text>
          {detail ? <Text style={{ fontSize: 11.5, color: ai.faded }}>{detail}</Text> : null}
        </View>
      </View>
      <View style={{ backgroundColor: ai.surface, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, detail, value, onChange, disabled, first }: { label: string; detail?: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean; first?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: first ? 0 : 1, borderTopColor: '#f3f4f6', opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: ai.ink }}>{label}</Text>
        {detail ? <Text style={{ fontSize: 11.5, color: ai.faded }}>{detail}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: '#fb923c', false: '#e5e7eb' }} thumbColor="#ffffff" />
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
  const [settings, setSettings] = useState<AISettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState(true);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
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

  return (
    <BottomSheet open={open} onClose={onClose} heightFraction={1} label={t('ปิดตั้งค่า', 'Close settings')}>
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 6, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name="settings-outline" size={16} color={ai.orange} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: ai.ink }}>{t('ตั้งค่าผู้ช่วย', 'Assistant settings')}</Text>
          </View>
          <GlassButton icon="close" label={t('ปิด', 'Close')} onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18, paddingTop: 4, paddingBottom: 32 }}>
          {error ? <Text style={{ fontSize: 12.5, color: '#dc2626', paddingHorizontal: 4 }}>{error}</Text> : null}
          <Section icon="options-outline" title={t('ทั่วไป', 'General')} detail={t('ชื่อที่เรียกคุณ · คำถามแนะนำ', 'What it calls you · suggestions')}>
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '500', color: ai.faint }}>{t('ให้ผู้ช่วยเรียกคุณว่า', 'The assistant calls you')}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onBlur={commitTitle}
                onSubmitEditing={commitTitle}
                editable={Boolean(settings)}
                maxLength={40}
                returnKeyType="done"
                placeholder={t('คุณผู้จัดการ', 'Manager')}
                placeholderTextColor={ai.faded}
                accessibilityLabel={t('ชื่อที่เรียกคุณ', 'What it calls you')}
                style={{ minHeight: 44, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, fontSize: 15, color: ai.ink, backgroundColor: ai.canvas }}
              />
            </View>
            <Row
              label={t('คำถามแนะนำใต้คำตอบ', 'Suggested questions under answers')}
              detail={t('ปิดได้ถ้าไม่อยากเห็นชิปถามต่อ', 'Turn off to hide the follow-up chips')}
              value={followUps}
              onChange={(next) => { setFollowUps(next); void writeFollowUpsEnabled(next); onFollowUps(next); }}
            />
          </Section>

          <Section icon="flash-outline" title={t('สิ่งที่ทำแทนคุณได้', 'What it may change')} detail={t('เลือกได้ทีละอย่างว่าให้แก้อะไรได้บ้าง ทุกอย่างยังต้องกดยืนยัน', 'Pick what it may edit. Everything still needs your confirmation')}>
            {!settings ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}><ActivityIndicator color={ai.orange} /></View>
            ) : (
              <>
                <Row first label={t('ให้ผู้ช่วยแก้ข้อมูลได้', 'Allow changes')} value={settings.actions_enabled} onChange={(next) => { void patch({ actions_enabled: next }); }} disabled={!settings.feature_available} />
                {AI_ACTION_TYPES.map((type) => (
                  <Row
                    key={type}
                    label={language === 'th' ? ACTION_LABELS[type].th : ACTION_LABELS[type].en}
                    value={Boolean(settings.action_types?.[type])}
                    onChange={(next) => { void patch({ action_types: { [type]: next } }); }}
                    disabled={!settings.actions_enabled || !settings.feature_available}
                  />
                ))}
              </>
            )}
          </Section>

          <Section icon="notifications-outline" title={t('การแจ้งเตือน', 'Notifications')} detail={t('เรื่องที่ขึ้นใน "ควรรู้วันนี้"', 'What shows under "Today\'s insights"')}>
            {!settings ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}><ActivityIndicator color={ai.orange} /></View>
            ) : (
              INSIGHT_ROWS.map((row, index) => (
                <Row
                  key={row.key}
                  first={index === 0}
                  label={language === 'th' ? row.th : row.en}
                  value={Boolean(settings.insight_kinds?.[row.key])}
                  onChange={(next) => {
                    const change: Partial<Record<AIInsightKind, boolean>> = { [row.key]: next };
                    if (row.pair) change[row.pair] = next;
                    void patch({ insight_kinds: change });
                  }}
                />
              ))
            )}
          </Section>
          <Text style={{ fontSize: 11.5, color: ai.faded, paddingHorizontal: 6 }}>
            {t('ถังขยะและการกู้คืนแชทอยู่ในตั้งค่าผู้ช่วยบนเว็บ', 'The trash and chat recovery live in the web settings')}
          </Text>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
