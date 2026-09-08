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

// The chat list as a phone shows a list of sessions: no cards, no dividers, just
// a marker, a name and one grey line under it, grouped by day. The two things
// you actually came to do — start a chat, find one — float at the bottom where a
// thumb reaches, instead of sitting in the header.

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
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const editInput = useRef<NativeTextInput | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSearching(false);
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
    <BottomSheet open={open} onClose={onClose} heightFraction={1} background="#f4f2ee" label={t('ปิดรายการแชท', 'Close chat list')}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6, gap: 8 }}>
          <View style={{ width: 44 }} />
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: ai.ink }}>{t('แชท', 'Chats')}</Text>
          <GlassButton icon="close" label={t('ปิด', 'Close')} onPress={onClose} size={44} />
        </View>

        {searching ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 6, height: 46, paddingHorizontal: 14, borderRadius: 23, backgroundColor: ai.surface }}>
            <AppIcon name="search-outline" size={18} color={ai.faded} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder={t('ค้นหาแชท', 'Search chats')}
              placeholderTextColor={ai.faded}
              accessibilityLabel={t('ค้นหาแชท', 'Search chats')}
              style={{ flex: 1, fontSize: 15, color: ai.ink, paddingVertical: 0 }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={t('ปิดการค้นหา', 'Close search')} hitSlop={8} onPress={() => { setQuery(''); setSearching(false); }}>
              <AppIcon name="close" size={18} color={ai.faded} />
            </Pressable>
          </View>
        ) : null}

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 18 }}>
          {loading && !conversations ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator color={ai.orange} /></View>
          ) : groups.length === 0 ? (
            <Text style={{ fontSize: 14, color: ai.faded, textAlign: 'center', paddingVertical: 30 }}>
              {query.trim()
                ? t('ไม่มีแชทที่ชื่อตรงกับคำค้น', 'No chat matches that search')
                : t('ยังไม่มีแชท ถามอะไรสักอย่างแล้วแชทจะมาอยู่ที่นี่', 'No chats yet. Ask something and it will show up here')}
            </Text>
          ) : (
            groups.map(({ group, rows }) => (
              <View key={group}>
                <Text style={{ fontSize: 15, color: ai.faded, paddingTop: 22, paddingBottom: 6 }}>
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
                        alignItems: 'flex-start',
                        gap: 14,
                        paddingVertical: 13,
                        paddingRight: 4,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 5,
                          marginTop: 8,
                          backgroundColor: active ? ai.orange : '#c9c4bc',
                        }}
                      />
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
                            style={{ fontSize: 18, lineHeight: 25, color: ai.ink, paddingVertical: 0, borderBottomWidth: 1.5, borderBottomColor: ai.orange }}
                          />
                        ) : (
                          <Text numberOfLines={2} style={{ fontSize: 18, lineHeight: 25, fontWeight: '600', color: ai.ink }}>
                            {conversation.title || t('แชทไม่มีชื่อ', 'Untitled chat')}
                          </Text>
                        )}
                        <Text style={{ fontSize: 13.5, lineHeight: 19, color: ai.faded, marginTop: 1 }}>
                          {isEditing
                            ? t('พิมพ์ชื่อใหม่แล้วกด Done', 'Type a new name, then Done')
                            : active
                              ? t(`เปิดอยู่ · ${threadStamp(conversation.updated_at, language)}`, `Open · ${threadStamp(conversation.updated_at, language)}`)
                              : threadStamp(conversation.updated_at, language)}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('ตัวเลือก', 'Options')}
                        hitSlop={10}
                        onPress={() => openMenu(conversation)}
                        style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}
                      >
                        <AppIcon name="ellipsis-horizontal" size={18} color="#c9c4bc" />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>

        {/* The two things this screen is for, within reach of a thumb. */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ค้นหาแชท', 'Search chats')}
            onPress={() => setSearching((current) => !current)}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: ai.surface,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
              shadowColor: '#3d2b1f',
              shadowOpacity: 0.16,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            })}
          >
            <AppIcon name="search-outline" size={22} color={ai.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('แชทใหม่', 'New chat')}
            onPress={() => { onClose(); onNew(); }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 52,
              paddingHorizontal: 22,
              borderRadius: 26,
              backgroundColor: '#1f1a17',
              opacity: pressed ? 0.85 : 1,
              shadowColor: '#3d2b1f',
              shadowOpacity: 0.22,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 5 },
              elevation: 8,
            })}
          >
            <AppIcon name="add" size={22} color="#ffffff" />
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#ffffff' }}>{t('แชทใหม่', 'New chat')}</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
