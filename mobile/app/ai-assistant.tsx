import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { askOperationsAI, getOperationsSnapshot } from '@/src/api/ai';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Feedback, SectionHeader, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { AIConversationMessage, AISnapshot } from '@/src/types/ai';

const prompts = ['เมนูไหนกำไรต่ำที่สุด', 'วัตถุดิบอะไรต้องเติมก่อน', 'สรุปยอดขายช่วงนี้', 'แนะนำสิ่งที่ควรทำวันนี้'];

export default function AIAssistantScreen() {
  const [snapshot, setSnapshot] = useState<AISnapshot | null>(null);
  const [history, setHistory] = useState<AIConversationMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getOperationsSnapshot().then(setSnapshot).catch((err) => setError(err instanceof Error ? err.message : 'โหลดข้อมูลวิเคราะห์ไม่สำเร็จ')); }, []);
  const canRecommend = snapshot?.analysis_readiness.can_recommend_business_actions;
  const latestAnswer = useMemo(() => [...history].reverse().find((item) => item.role === 'assistant')?.content, [history]);

  async function ask(value = question) {
    const trimmed = value.trim(); if (!trimmed || loading) return;
    const nextHistory: AIConversationMessage[] = [...history, { role: 'user', content: trimmed }];
    setHistory(nextHistory); setQuestion(''); setLoading(true); setError(null);
    try {
      const response = await askOperationsAI(trimmed, history.slice(-8));
      setHistory([...nextHistory, { role: 'assistant', content: response.answer }]);
      setSnapshot(response.snapshot);
    } catch (err) { setError(err instanceof Error ? err.message : 'ผู้ช่วยวิเคราะห์ตอบไม่ได้ในขณะนี้'); }
    finally { setLoading(false); }
  }

  return (
    <AppScreen title="ผู้ช่วยวิเคราะห์ร้าน" subtitle="ถามจากยอดขาย ต้นทุนเมนู และสต็อกของร้านนี้" topLevel>
      {error ? <Feedback title="วิเคราะห์ข้อมูลไม่ได้" detail={error} tone="danger" /> : null}
      {snapshot ? (
        <Surface>
          <SectionHeader title="ความพร้อมของข้อมูล" detail={canRecommend ? 'ข้อมูลพร้อมสำหรับคำแนะนำเชิงธุรกิจ' : 'บางคำตอบอาจยังจำกัด เพราะข้อมูลต้นทุนหรือสูตรไม่ครบ'} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <View style={{ flex: 1, minWidth: 130 }}><Text selectable style={typeScale.number}>{snapshot.inventory_summary.total_items}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>วัตถุดิบทั้งหมด</Text></View>
            <View style={{ flex: 1, minWidth: 130 }}><Text selectable style={typeScale.number}>{snapshot.inventory_summary.low_items + snapshot.inventory_summary.out_items}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>สต็อกต้องตรวจสอบ</Text></View>
            <View style={{ flex: 1, minWidth: 130 }}><Text selectable style={typeScale.number}>{money(snapshot.inventory_summary.value)}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>มูลค่าคงคลัง</Text></View>
          </View>
          {snapshot.analysis_readiness.warnings?.map((warning) => <Feedback key={warning} title={warning} tone="warning" />)}
        </Surface>
      ) : null}

      <Surface>
        <SectionHeader title="ถามผู้ช่วย" detail="ระบบตอบจากข้อมูลของร้าน ไม่ใช่ข้อมูลสมมติ" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {prompts.map((prompt) => <Pressable key={prompt} onPress={() => ask(prompt)} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{prompt}</Text></Pressable>)}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: spacing.sm }}>
            <TextInput multiline value={question} onChangeText={setQuestion} placeholder="เช่น วันนี้ควรเติมวัตถุดิบอะไร" placeholderTextColor={palette.placeholder} style={{ minHeight: 92, borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, color: palette.text, fontSize: 16, padding: spacing.md, textAlignVertical: 'top' }} />
            <Button label={loading ? 'กำลังวิเคราะห์...' : 'ส่งคำถาม'} onPress={() => ask()} loading={loading} disabled={!question.trim()} />
          </View>
        </KeyboardAvoidingView>
      </Surface>

      {history.length ? (
        <Surface>
          <SectionHeader title="บทสนทนา" detail={latestAnswer ? 'คำตอบล่าสุดอยู่ด้านล่าง' : undefined} />
          {history.map((item, index) => <View key={`${item.role}-${index}`} style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'stretch', maxWidth: item.role === 'user' ? '86%' : '100%', borderWidth: item.role === 'user' ? 0 : 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: item.role === 'user' ? palette.primary : palette.surfaceSubtle, padding: spacing.md }}><Text selectable style={[typeScale.body, { color: item.role === 'user' ? palette.primaryText : palette.text }]}>{item.content}</Text></View>)}
        </Surface>
      ) : null}
    </AppScreen>
  );
}
