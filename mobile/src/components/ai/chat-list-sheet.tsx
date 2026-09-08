import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput as NativeTextInput, View } from 'react-native';

import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { matchesThreadQuery, threadGroup, threadGroupLabel, threadStamp, type AIThreadGroup } from '@/src/lib/ai-chat';
import type { DisplayLanguage } from '@/src/lib/display-preferences';
import type { AIConversationSummary } from '@/src/types/ai';

import { BottomSheet, GlassButton } from './chrome';
import { ai } from './theme';

// The chat list, the web's AIChatList "sheet" variant: search, a new-chat row,
// then the chats grouped by day. Rename happens on the row itself; the "…"
// menu offers rename and delete (delete moves to the trash the web can restore).

const GROUP_ORDER: AIThreadGroup[] = ['today', 'yesterday', 'week', 'older'];

export function ChatListSheet({
  open,
  onClose,
  conversations,
  loading,
  activeId,
  language,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  conversations: AIConversationSummary[] | null;
  loading: boolean;
  activeId: string | null;
  language: DisplayLanguage;
  onOpen: (conversationId: string) => void;
  onNew: () => void;
  onRename: (conversationId: string, title: string) => Promise<void>;
  onDelete: (conversationId: string) => Promise<void>;
}) {
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const editInput = useRef<NativeTextInput | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setEditing(null);
    }
  }, [open]);

  const groups = useMemo(() => {
    const now = new Date();
    const map = new Map<AIThreadGroup, AIConversationSummary[]>();
    for (const conversation of conversations ?? []) {
      if (!matchesThreadQuery(conversation.title, query)) continue;
      const group = threadGroup(conversation.updated_at, now);
      map.set(group, [...(map.get(group) ?? []), conversation]);
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({ group, rows: map.get(group) ?? [] }));
  }, [conversations, query]);

  const commitRename = async () => {
    const current = editing;
    setEditing(null);
    if (!current) return;
    const title = current.title.trim();
    if (!title) return;
    try {
      await onRename(current.id, title);
    } catch {
      Alert.alert(t('เปลี่ยนชื่อไม่สำเร็จ', 'Could not rename'), t('ลองอีกครั้ง', 'Try again'));
    }
  };

  const openMenu = (conversation: AIConversationSummary) => {
    Alert.alert(conversation.title || t('แชทไม่มีชื่อ', 'Untitled chat'), undefined, [
      {
        text: t('เปลี่ยนชื่อ', 'Rename'),
        onPress: () => {
          setEditing({ id: conversation.id, title: conversation.title });
          setTimeout(() => editInput.current?.focus(), 50);
        },
      },
      {
        text: t('ลบ', 'Delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            t('ลบแชทนี้ไหม?', 'Delete this chat?'),
            t('แชทจะย้ายไปถังขยะ กู้คืนได้ภายใน 7 วันจากตั้งค่าผู้ช่วยบนเว็บ', 'The chat moves to the trash and can be restored within 7 days from the web settings'),
            [
              { text: t('ยกเลิก', 'Cancel'), style: 'cancel' },
              { text: t('ย้ายไปถังขยะ', 'Move to trash'), style: 'destructive', onPress: () => { void onDelete(conversation.id); } },
            ],
          );
        },
      },
      { text: t('ยกเลิก', 'Cancel'), style: 'cancel' },
    ]);
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightFraction={1} label={t('ปิดรายการแชท', 'Close chat list')}>
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 6, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name="chatbubbles-outline" size={16} color={ai.orange} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: ai.ink }}>{t('แชท', 'Chats')}</Text>
          </View>
          <GlassButton icon="close" label={t('ปิด', 'Close')} onPress={onClose} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: ai.surface, borderWidth: 1, borderColor: '#e5e7eb' }}>
          <AppIcon name="search-outline" size={16} color={ai.faded} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('ค้นหาแชท', 'Search chats')}
            placeholderTextColor={ai.faded}
            accessibilityLabel={t('ค้นหาแชท', 'Search chats')}
            style={{ flex: 1, fontSize: 14, color: ai.ink, paddingVertical: 0 }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => { onClose(); onNew(); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 8, borderRadius: 12, backgroundColor: pressed ? 'rgba(255,255,255,0.7)' : 'transparent' })}
        >
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: ai.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
            <AppIcon name="create-outline" size={15} color="#ea580c" />
          </View>
          <Text style={{ fontSize: 13.5, fontWeight: '500', color: ai.ink }}>{t('แชทใหม่', 'New chat')}</Text>
        </Pressable>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {loading && !conversations ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}><ActivityIndicator color={ai.orange} /></View>
          ) : groups.length === 0 ? (
            <Text style={{ fontSize: 13, color: ai.faded, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 16 }}>
              {query.trim()
                ? t('ไม่มีแชทที่ชื่อตรงกับคำค้น', 'No chat matches that search')
                : t('ยังไม่มีแชท ถามอะไรสักอย่างแล้วแชทจะมาอยู่ที่นี่', 'No chats yet. Ask something and it will show up here')}
            </Text>
          ) : (
            groups.map(({ group, rows }) => (
              <View key={group}>
                <Text style={{ fontSize: 10.5, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: ai.faded, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4 }}>
                  {threadGroupLabel(group, language)}
                </Text>
                {rows.map((conversation) => {
                  const active = conversation.id === activeId;
                  const isEditing = editing?.id === conversation.id;
                  return (
                    <Pressable
                      key={conversation.id}
                      accessibilityRole="button"
                      onPress={() => { if (!isEditing) { onClose(); onOpen(conversation.id); } }}
                      onLongPress={() => openMenu(conversation)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: active ? ai.surface : pressed ? 'rgba(255,255,255,0.6)' : 'transparent',
                        borderWidth: 2,
                        borderColor: active ? 'rgba(251,146,60,0.6)' : 'transparent',
                        marginBottom: 2,
                      })}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <TextInput
                            ref={editInput}
                            value={editing.title}
                            onChangeText={(title) => setEditing({ id: conversation.id, title })}
                            onSubmitEditing={() => { void commitRename(); }}
                            onBlur={() => { void commitRename(); }}
                            autoFocus
                            selectTextOnFocus
                            returnKeyType="done"
                            accessibilityLabel={t('ชื่อแชท', 'Chat title')}
                            style={{ fontSize: 13, lineHeight: 18, color: ai.ink, paddingVertical: 0, borderBottomWidth: 1.5, borderBottomColor: ai.orange }}
                          />
                        ) : (
                          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: ai.ink }}>
                            {conversation.title || t('แชทไม่มีชื่อ', 'Untitled chat')}
                          </Text>
                        )}
                        <Text style={{ fontSize: 11, lineHeight: 15, color: ai.faded }}>
                          {isEditing ? t('พิมพ์ชื่อใหม่แล้วกด Done', 'Type a new name, then Done') : threadStamp(conversation.updated_at, language)}
                        </Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('ตัวเลือก', 'Options')} hitSlop={8} onPress={() => openMenu(conversation)} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                        <AppIcon name="ellipsis-horizontal" size={16} color={ai.faded} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
