import { router, usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { askOperationsAI, getOperationsSnapshot } from '@/src/api/ai';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Feedback, SectionHeader, Surface } from '@/src/components/ui';
import {
  type AIGuidedAction,
  getGuidedAIActions,
  getUnclearAIActions,
  resolveAIClarificationRequest,
  resolveAINavigationRequest,
} from '@/src/lib/ai-actions';
import {
  appendConversationTurn,
  recentConversationHistory,
  selectOperationsSnapshot,
} from '@/src/lib/ai-conversation';
import { parseAIResponseBlocks } from '@/src/lib/ai-response';
import { money } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { AIConversationMessage, AISnapshot } from '@/src/types/ai';

function AIResponseContent({ content }: { content: string }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {parseAIResponseBlocks(content).map((block, blockIndex) => (
        <View
          key={`${block.kind}-${blockIndex}`}
          style={{
            flexDirection: block.kind === 'bullet' ? 'row' : 'column',
            alignItems: 'flex-start',
            gap: block.kind === 'bullet' ? spacing.sm : 0,
          }}
        >
          {block.marker ? (
            <Text style={[typeScale.body, { minWidth: 18, color: palette.muted }]}>
              {block.marker}
            </Text>
          ) : null}
          <Text
            selectable
            style={[
              block.kind === 'heading' ? typeScale.cardTitle : typeScale.body,
              { flexShrink: 1, color: palette.text },
            ]}
          >
            {block.segments.map((segment, segmentIndex) => (
              <Text
                key={`${segment.text}-${segmentIndex}`}
                style={{ fontWeight: segment.bold ? '800' : undefined }}
              >
                {segment.text}
              </Text>
            ))}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function AIAssistantScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const pathname = usePathname();
  const prompts = language === 'th'
    ? ['สรุปสถานการณ์ร้านวันนี้ให้หน่อย', 'พรุ่งนี้ควรเตรียมวัตถุดิบอะไรเพิ่ม?', 'เมนูไหนขายดีและกระทบสต็อกมากที่สุด?', 'มีความเสี่ยงวัตถุดิบขาดหรือซื้อเกินไหม?']
    : ['Summarize restaurant operations today.', 'Which ingredients should we prepare more of tomorrow?', 'Which best-selling items affect stock the most?', 'Are any ingredients at risk of running out or being overstocked?'];
  const canUseAI = can(activeMembership, 'view_reports') || can(activeMembership, 'manage_inventory');
  const [snapshot, setSnapshot] = useState<AISnapshot | null>(null);
  const [history, setHistory] = useState<AIConversationMessage[]>([]);
  const [actions, setActions] = useState<AIGuidedAction[]>([]);
  const [pendingAction, setPendingAction] = useState<AIGuidedAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canUseAI) return;
    getOperationsSnapshot()
      .then(setSnapshot)
      .catch((err) => setError(err instanceof Error ? err.message : copy('โหลดข้อมูลวิเคราะห์ไม่สำเร็จ', 'Could not load analytics data.')));
  }, [canUseAI, copy]);
  const canRecommend = snapshot?.analysis_readiness.can_recommend_business_actions;
  const latestAnswer = useMemo(() => [...history].reverse().find((item) => item.role === 'assistant')?.content, [history]);

  async function ask(value = question) {
    const trimmed = value.trim(); if (!trimmed || loading) return;
    const hasPermission = (permission: string) => can(activeMembership, permission);
    setNotice(null);
    setActions([]);
    setPendingAction(null);
    setError(null);

    const navigation = resolveAINavigationRequest(trimmed, hasPermission, pathname, language);
    if (navigation) {
      setQuestion('');
      setNotice(navigation.message);
      if (navigation.kind === 'suggest') {
        setActions(navigation.options.map((option) => ({
          id: option.href,
          href: option.href,
          label: option.label,
        })));
      } else if (!navigation.alreadyThere) {
        router.push(navigation.href as never);
      }
      return;
    }

    const clarification = resolveAIClarificationRequest(trimmed, hasPermission, language);
    if (clarification) {
      setQuestion('');
      setNotice(clarification.message);
      setActions(clarification.actions);
      return;
    }

    const nextHistory = recentConversationHistory([
      ...history,
      { role: 'user' as const, content: trimmed },
    ]);
    setHistory(nextHistory); setQuestion(''); setLoading(true); setError(null);
    try {
      const response = await askOperationsAI(trimmed, recentConversationHistory(history));
      setHistory(appendConversationTurn(history, trimmed, response.answer));
      setSnapshot((current) => selectOperationsSnapshot(current, response.snapshot));
      setActions(response.intent === 'unclear'
        ? getUnclearAIActions(hasPermission, language)
        : response.intent === 'analysis'
          ? getGuidedAIActions(trimmed, response.answer, hasPermission, language)
          : []);
    } catch (err) { setError(err instanceof Error ? err.message : copy('ผู้ช่วยวิเคราะห์ตอบไม่ได้ในขณะนี้', 'The analytics assistant cannot respond right now.')); }
    finally { setLoading(false); }
  }

  function handleAction(action: AIGuidedAction) {
    if (action.prompt) {
      void ask(action.prompt);
      return;
    }
    if (!action.href) return;
    if (action.requiresConfirmation) {
      setPendingAction(action);
      return;
    }
    router.push(action.href as never);
  }

  if (!canUseAI) {
    return (
      <AppScreen title={copy('ผู้ช่วยวิเคราะห์ร้าน', 'Restaurant analytics assistant')} subtitle={copy('ถามจากยอดขายและคลังวัตถุดิบล่าสุดของร้าน', 'Ask questions using the restaurant’s latest sales and inventory data.')} topLevel>
        <Feedback title={copy('ไม่มีสิทธิ์ใช้ผู้ช่วยวิเคราะห์', 'Analytics assistant access unavailable')} detail={copy('หน้านี้ต้องใช้สิทธิ์ดูรายงานหรือจัดการคลังวัตถุดิบ', 'This page requires report or inventory management access.')} tone="info" />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={copy('ผู้ช่วยวิเคราะห์ร้าน', 'Restaurant analytics assistant')} subtitle={copy('ถามจากยอดขายและคลังวัตถุดิบล่าสุดของร้าน', 'Ask questions using the restaurant’s latest sales and inventory data.')} topLevel>
      {error ? <Feedback title={copy('วิเคราะห์ข้อมูลไม่ได้', 'Could not analyze data')} detail={error} tone="danger" /> : null}
      {snapshot ? (
        <Surface>
          <SectionHeader title={copy('ความพร้อมของข้อมูล', 'Data readiness')} detail={canRecommend ? copy('ข้อมูลพร้อมสำหรับคำแนะนำเชิงธุรกิจ', 'The data is ready for business recommendations.') : copy('บางคำตอบอาจยังจำกัด เพราะข้อมูลต้นทุนหรือสูตรไม่ครบ', 'Some answers may be limited because cost or recipe data is incomplete.')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <View style={{ flex: 1, minWidth: 130 }}><Text selectable style={typeScale.number}>{snapshot.inventory_summary.total_items.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy('วัตถุดิบทั้งหมด', 'Total ingredients')}</Text></View>
            <View style={{ flex: 1, minWidth: 130 }}><Text selectable style={typeScale.number}>{(snapshot.inventory_summary.low_items + snapshot.inventory_summary.out_items).toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy('สต็อกต้องตรวจสอบ', 'Stock requiring review')}</Text></View>
            <View style={{ flex: 1, minWidth: 130 }}><Text selectable style={typeScale.number}>{money(snapshot.inventory_summary.value, language)}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy('มูลค่าคงคลัง', 'Inventory value')}</Text></View>
          </View>
          {(snapshot.analysis_readiness.warnings ?? []).map((warning) => <Feedback key={warning} title={warning} tone="warning" />)}
        </Surface>
      ) : null}

      <Surface>
        <SectionHeader title={copy('ถามผู้ช่วย', 'Ask the assistant')} detail={copy('ระบบตอบจากข้อมูลของร้าน ไม่ใช่ข้อมูลสมมติ', 'Answers are based on restaurant data, not hypothetical data.')} />
        {notice ? <Feedback title={notice} tone="info" /> : null}
        {actions.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {actions.map((action) => (
              <Button
                compact
                key={action.id}
                variant="secondary"
                label={action.label}
                onPress={() => handleAction(action)}
              />
            ))}
          </View>
        ) : null}
        {pendingAction ? (
          <View style={{ gap: spacing.md }}>
            <Feedback
              title={copy('ยืนยันก่อนเปิดหน้าตรวจสอบ', 'Confirm before opening the review page')}
              detail={pendingAction.description || copy('ระบบจะเปิดหน้าที่เกี่ยวข้องโดยไม่แก้ไขข้อมูลอัตโนมัติ', 'The related page will open without changing any data automatically.')}
              tone="warning"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                variant="secondary"
                label={copy('ยกเลิก', 'Cancel')}
                onPress={() => setPendingAction(null)}
                style={{ flex: 1 }}
              />
              <Button
                label={copy('ยืนยันและเปิด', 'Confirm and open')}
                onPress={() => {
                  if (pendingAction.href) router.push(pendingAction.href as never);
                  setPendingAction(null);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {prompts.map((prompt) => <Pressable key={prompt} onPress={() => ask(prompt)} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{prompt}</Text></Pressable>)}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: spacing.sm }}>
            <TextInput accessibilityLabel={copy('คำถามสำหรับผู้ช่วย AI', 'Question for the AI assistant')} multiline maxLength={800} value={question} onChangeText={setQuestion} placeholder={copy('เช่น พรุ่งนี้ควรเตรียมวัตถุดิบอะไรเพิ่ม?', 'For example: Which ingredients should we prepare more of tomorrow?')} placeholderTextColor={palette.placeholder} style={{ minHeight: 92, borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, color: palette.text, fontSize: 16, padding: spacing.md, textAlignVertical: 'top' }} />
            <Button label={loading ? copy('กำลังวิเคราะห์...', 'Analyzing...') : copy('ถาม AI', 'Ask AI')} onPress={() => ask()} loading={loading} disabled={!question.trim()} />
          </View>
        </KeyboardAvoidingView>
      </Surface>

      {history.length ? (
        <Surface>
          <SectionHeader title={copy('บทสนทนา', 'Conversation')} detail={latestAnswer ? copy('คำตอบล่าสุดอยู่ด้านล่าง', 'The latest answer appears below.') : undefined} />
          {history.map((item, index) => (
            <View
              key={`${item.role}-${index}`}
              style={{
                alignSelf: item.role === 'user' ? 'flex-end' : 'stretch',
                maxWidth: item.role === 'user' ? '86%' : '100%',
                borderWidth: item.role === 'user' ? 0 : 1,
                borderColor: palette.border,
                borderRadius: radius.md,
                backgroundColor: item.role === 'user' ? palette.primary : palette.surfaceSubtle,
                padding: spacing.md,
              }}
            >
              {item.role === 'user' ? (
                <Text selectable style={[typeScale.body, { color: palette.primaryText }]}>
                  {item.content}
                </Text>
              ) : (
                <AIResponseContent content={item.content} />
              )}
            </View>
          ))}
        </Surface>
      ) : null}
    </AppScreen>
  );
}
