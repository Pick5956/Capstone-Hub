import { LinearGradient } from 'expo-linear-gradient';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { forwardRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput as NativeTextInput, View } from 'react-native';

import { extractReceipt } from '@/src/api/ai';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { receiptDraftToCommand } from '@/src/lib/ai-chat';

import { GlassSurface } from './chrome';
import type { DisplayLanguage } from '@/src/lib/display-preferences';

import { ai } from './theme';

// The capsule at the bottom: a growing text box on the first row, the tools
// on the second — receipt scan on the left, send on the right. Voice dictation
// from the web is left out: Expo Go has no speech-to-text.

export const Composer = forwardRef<NativeTextInput, {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onInsert: (text: string) => void;
  onNotice: (message: string, tone: 'error' | 'info') => void;
  sending: boolean;
  disabled?: boolean;
  language: DisplayLanguage;
}>(function Composer({ value, onChange, onSend, onInsert, onNotice, sending, disabled, language }, ref) {
  const [scanning, setScanning] = useState(false);
  const [focused, setFocused] = useState(false);
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const canSend = value.trim().length > 0 && !sending && !disabled;

  const scan = async () => {
    if (scanning || disabled) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 1,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      setScanning(true);
      const context = ImageManipulator.manipulate(asset.uri);
      if (asset.width && asset.width > 1280) context.resize({ width: 1280 });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      if (!saved.base64) throw new Error('no image data');
      const { draft } = await extractReceipt(saved.base64, 'image/jpeg');
      onInsert(receiptDraftToCommand(draft, language));
      onNotice(t('อ่านบิลแล้ว ตรวจข้อความแล้วกดส่งเพื่อบันทึก', 'Receipt read. Check the text, then send to record it'), 'info');
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: number }).status) : 0;
      onNotice(
        status === 429
          ? t('โควตาสแกนเต็มชั่วคราว ลองใหม่ในสักครู่', 'Scan quota is full right now, try again shortly')
          : t('อ่านบิลไม่สำเร็จ ลองถ่ายใหม่ให้ชัดขึ้น', 'Could not read the receipt, try a clearer photo'),
        'error',
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <GlassSurface
      style={{ borderRadius: 28, paddingTop: 8, paddingBottom: 8, paddingLeft: 10, paddingRight: 8, gap: 4, overflow: 'hidden' }}
      fallbackStyle={{
        borderWidth: 1,
        borderColor: focused ? '#fdba74' : '#e5e7eb',
        backgroundColor: ai.surface,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      <TextInput
        ref={ref}
        accessibilityLabel={t('คำถามสำหรับผู้ช่วย', 'Question for the assistant')}
        multiline
        maxLength={800}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        placeholder={t('พิมพ์คำถามของคุณที่นี่...', 'Type your question here...')}
        placeholderTextColor={ai.faint}
        style={{
          minHeight: 36,
          maxHeight: 132,
          paddingHorizontal: 8,
          paddingVertical: 6,
          fontSize: 15,
          lineHeight: 22,
          color: ai.ink,
          textAlignVertical: 'top',
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('สแกนใบเสร็จ', 'Scan a receipt')}
          disabled={scanning || disabled}
          onPress={() => { void scan(); }}
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed || scanning ? ai.orangeSoft : 'transparent', opacity: disabled ? 0.5 : 1 })}
        >
          {scanning ? <ActivityIndicator size="small" color={ai.orange} /> : <AppIcon name="scan-outline" size={19} color={scanning ? ai.orange : ai.faint} />}
        </Pressable>
        {scanning ? <Text style={{ fontSize: 12, color: ai.faint }}>{t('กำลังอ่านบิล…', 'Reading the receipt…')}</Text> : null}
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ถาม AI', 'Ask AI')}
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => ({ opacity: !canSend ? 0.5 : pressed ? 0.85 : 1 })}
        >
          <LinearGradient
            colors={[ai.orange, ai.amber]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: ai.orange, shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }}
          >
            {sending ? <ActivityIndicator size="small" color="#ffffff" /> : <AppIcon name="arrow-up" size={20} color="#ffffff" />}
          </LinearGradient>
        </Pressable>
      </View>
    </GlassSurface>
  );
});
