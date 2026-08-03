import { router, usePathname } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import {
  askOperationsAI,
  cancelAIAction,
  confirmAIAction,
  deleteAIConversation,
  getOperationsSnapshot,
} from '@/src/api/ai';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Feedback, SectionHeader, Surface } from '@/src/components/ui';
import {
  type AIGuidedAction,
  canUseAIAssistant,
  getGuidedAIActions,
  getUnclearAIActions,
  resolveAIClarificationRequest,
  resolveAINavigationRequest,
} from '@/src/lib/ai-actions';
import {
  describeAIActionPreview,
  formatAIActionConfirmationMessage,
  getAIActionCancellationErrorMessage,
  getAIActionErrorMessage,
  isTerminalAIActionCancellationError,
} from '@/src/lib/ai-action-preview';
import { canClearAIConversation, selectAIConversationId } from '@/src/lib/ai-contract';
import {
  appendConversationTurn,
  createAIConversationRequestGuard,
  recentConversationHistory,
  selectOperationsSnapshot,
} from '@/src/lib/ai-conversation';
import { parseAIResponseBlocks } from '@/src/lib/ai-response';
import { money } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type {
  AIActionPreview,
  AIConversationMessage,
  AISnapshot,
} from '@/src/types/ai';

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

function AIActionPreviewPanel({
  preview,
  language,
  confirming,
  cancelling,
  error,
  onConfirm,
  onCancel,
}: {
  preview: AIActionPreview;
  language: 'th' | 'en';
  confirming: boolean;
  cancelling: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const presentation = describeAIActionPreview(preview, language);
  return (
    <View
      style={{ gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.lg }}
    >
      <Feedback
        title={presentation.title}
        detail={presentation.description}
        tone="warning"
      />
      <View style={{ gap: spacing.xs }}>
        <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
          {presentation.menuLabel}
        </Text>
        <Text selectable style={typeScale.cardTitle}>{presentation.menuName}</Text>
        {presentation.summary ? (
          <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
            {presentation.summary}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
            {presentation.currentLabel}
          </Text>
          <Text selectable style={{ color: palette.text, fontSize: 14, fontWeight: '700' }}>
            {presentation.currentValue}
          </Text>
        </View>
        <Text accessibilityElementsHidden style={{ color: palette.warning, fontSize: 18 }}>→</Text>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text selectable style={[typeScale.caption, { color: palette.warning }]}>
            {presentation.requestedLabel}
          </Text>
          <Text selectable style={{ color: palette.warning, fontSize: 14, fontWeight: '700' }}>
            {presentation.requestedValue}
          </Text>
        </View>
      </View>
      <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
        {presentation.expiresLabel}: {presentation.expiresValue}
      </Text>
      {presentation.warnings.length ? (
        <View style={{ gap: spacing.xs }}>
          <Text selectable style={{ color: palette.warning, fontSize: 13, fontWeight: '700' }}>
            {presentation.warningsLabel}
          </Text>
          {presentation.warnings.map((warning, index) => (
            <Text
              key={`${index}-${warning}`}
              selectable
              style={[typeScale.caption, { color: palette.warning }]}
            >
              • {warning}
            </Text>
          ))}
        </View>
      ) : null}
      {error ? <Feedback title={error} tone="danger" /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          variant="secondary"
          label={cancelling ? presentation.cancellingLabel : presentation.cancelLabel}
          onPress={onCancel}
          disabled={confirming || cancelling}
          loading={cancelling}
          style={{ flex: 1 }}
        />
        <Button
          label={confirming ? presentation.confirmingLabel : presentation.confirmLabel}
          onPress={onConfirm}
          loading={confirming}
          disabled={cancelling}
          style={{ flex: 1 }}
        />
      </View>
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
  const canUseAI = canUseAIAssistant(activeMembership?.role?.name);
  const [snapshot, setSnapshot] = useState<AISnapshot | null>(null);
  const [history, setHistory] = useState<AIConversationMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [actions, setActions] = useState<AIGuidedAction[]>([]);
  const [pendingAction, setPendingAction] = useState<AIGuidedAction | null>(null);
  const [pendingActionPreview, setPendingActionPreview] = useState<AIActionPreview | null>(null);
  const [actionConfirming, setActionConfirming] = useState(false);
  const [actionCancelling, setActionCancelling] = useState(false);
  const [actionPreviewError, setActionPreviewError] = useState<string | null>(null);
  const [clearingConversation, setClearingConversation] = useState(false);
  const [conversationClearError, setConversationClearError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRequestsRef = useRef(createAIConversationRequestGuard());
  useEffect(() => {
    conversationRequestsRef.current.clearConversation();
    setConversationId(null);
    setHistory([]);
    setSnapshot(null);
    setActions([]);
    setPendingAction(null);
    setPendingActionPreview(null);
    setActionConfirming(false);
    setActionCancelling(false);
    setActionPreviewError(null);
    setClearingConversation(false);
    setConversationClearError(null);
    setNotice(null);
    setLoading(false);
    setError(null);
  }, [activeMembership?.restaurant_id, activeMembership?.user_id]);
  useEffect(() => {
    if (!canUseAI) return;
    let active = true;
    getOperationsSnapshot()
      .then((nextSnapshot) => {
        if (active) setSnapshot((current) => selectOperationsSnapshot(current, nextSnapshot));
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : copy('โหลดข้อมูลวิเคราะห์ไม่สำเร็จ', 'Could not load analytics data.'));
        }
      });
    return () => { active = false; };
  }, [activeMembership?.restaurant_id, canUseAI, copy]);
  const canRecommend = snapshot?.analysis_readiness.can_recommend_business_actions;
  const latestAnswer = useMemo(() => [...history].reverse().find((item) => item.role === 'assistant')?.content, [history]);

  async function ask(value = question) {
    const trimmed = value.trim();
    if (!trimmed || loading || actionConfirming || actionCancelling || clearingConversation) return;
    if (pendingActionPreview && !(await discardPendingActionPreview())) return;
    const hasPermission = (permission: string) => can(activeMembership, permission);
    setNotice(null);
    setActions([]);
    setPendingAction(null);
    setActionPreviewError(null);
    setConversationClearError(null);
    setError(null);

    const navigation = resolveAINavigationRequest(trimmed, hasPermission, pathname, language, canUseAI);
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

    const clarification = resolveAIClarificationRequest(trimmed, hasPermission, language, canUseAI);
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
    const request = conversationRequestsRef.current.beginRequest();
    setHistory(nextHistory); setQuestion(''); setLoading(true); setError(null);
    try {
      const response = await askOperationsAI(
        trimmed,
        recentConversationHistory(history),
        conversationId,
      );
      if (!conversationRequestsRef.current.canApplyResponse(request)) return;
      setConversationId((current) => selectAIConversationId(current, response.conversation_id));
      setHistory(appendConversationTurn(history, trimmed, response.answer));
      setSnapshot((current) => selectOperationsSnapshot(current, response.snapshot));
      setPendingActionPreview(response.action_preview ?? null);
      setActions(response.intent === 'unclear'
        ? getUnclearAIActions(hasPermission, language, canUseAI)
        : response.intent === 'analysis'
          ? getGuidedAIActions(trimmed, response.answer, hasPermission, language, canUseAI)
          : []);
    } catch (err) {
      if (conversationRequestsRef.current.canApplyResponse(request)) {
        setError(err instanceof Error ? err.message : copy('ผู้ช่วยวิเคราะห์ตอบไม่ได้ในขณะนี้', 'The analytics assistant cannot respond right now.'));
      }
    }
    finally {
      if (conversationRequestsRef.current.canApplyResponse(request)) setLoading(false);
    }
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

  async function handleConfirmActionPreview() {
    const preview = pendingActionPreview;
    if (!preview || actionConfirming || actionCancelling || clearingConversation) return;
    const request = conversationRequestsRef.current.beginRequest();
    setActionConfirming(true);
    setActionPreviewError(null);
    try {
      const confirmation = await confirmAIAction(preview.id, preview.confirmation_token);
      if (!conversationRequestsRef.current.canApplyResponse(request)) return;
      setPendingActionPreview((current) => current?.id === preview.id ? null : current);
      setHistory((current) => recentConversationHistory([
        ...current,
        {
          role: 'assistant',
          content: formatAIActionConfirmationMessage(confirmation, language),
        },
      ]));
      setActions([]);
      getOperationsSnapshot()
        .then((nextSnapshot) => {
          if (conversationRequestsRef.current.canApplyResponse(request)) {
            setSnapshot(nextSnapshot);
          }
        })
        .catch(() => undefined);
    } catch (confirmationError) {
      if (conversationRequestsRef.current.canApplyResponse(request)) {
        setActionPreviewError(getAIActionErrorMessage(confirmationError, language));
      }
    } finally {
      if (conversationRequestsRef.current.canApplyResponse(request)) {
        setActionConfirming(false);
      }
    }
  }

  async function discardPendingActionPreview(): Promise<boolean> {
    const preview = pendingActionPreview;
    if (!preview) return true;
    if (actionConfirming || actionCancelling || clearingConversation) return false;
    const request = conversationRequestsRef.current.beginRequest();
    setActionCancelling(true);
    setActionPreviewError(null);
    try {
      await cancelAIAction(preview.id);
      if (!conversationRequestsRef.current.canApplyResponse(request)) return false;
      setPendingActionPreview((current) => current?.id === preview.id ? null : current);
      return true;
    } catch (cancellationError) {
      if (!conversationRequestsRef.current.canApplyResponse(request)) return false;
      if (isTerminalAIActionCancellationError(cancellationError)) {
        setPendingActionPreview((current) => current?.id === preview.id ? null : current);
        setNotice(copy(
          'รายการ AI นี้ใช้ต่อไม่ได้แล้ว ระบบนำออกจากหน้าจอ กรุณาขอรายการใหม่หากยังต้องการดำเนินการ',
          'This AI action is no longer usable and was removed. Request a new action if it is still needed.',
        ));
        getOperationsSnapshot()
          .then((nextSnapshot) => {
            if (conversationRequestsRef.current.canApplyResponse(request)) {
              setSnapshot((current) => selectOperationsSnapshot(current, nextSnapshot));
            }
          })
          .catch(() => undefined);
        return true;
      }
      setActionPreviewError(getAIActionCancellationErrorMessage(language));
      return false;
    } finally {
      if (conversationRequestsRef.current.canApplyResponse(request)) {
        setActionCancelling(false);
      }
    }
  }

  async function handleCancelActionPreview() {
    await discardPendingActionPreview();
  }

  async function handleClearConversation() {
    if (!canClearAIConversation({
      loading,
      actionConfirming,
      actionCancelling,
      clearingConversation,
    })) return;
    if (pendingActionPreview && !(await discardPendingActionPreview())) return;
    const serverConversationId = conversationId;
    conversationRequestsRef.current.clearConversation();
    const clearRequest = conversationRequestsRef.current.beginRequest();
    setConversationId(null);
    setHistory([]);
    setActions([]);
    setPendingAction(null);
    setPendingActionPreview(null);
    setActionPreviewError(null);
    setNotice(null);
    setLoading(false);
    setError(null);
    setConversationClearError(null);
    if (!serverConversationId) return;

    setClearingConversation(true);
    try {
      await deleteAIConversation(serverConversationId);
    } catch {
      if (conversationRequestsRef.current.canApplyResponse(clearRequest)) {
        setConversationClearError(copy(
          'ล้างบทสนทนาในแอปแล้ว แต่เซิร์ฟเวอร์ยืนยันการลบไม่ได้ ระบบจะไม่ใช้บทสนทนาเดิมต่อ',
          'The local chat was cleared, but the server could not confirm deletion. The old conversation will not be reused.',
        ));
      }
    } finally {
      if (conversationRequestsRef.current.canApplyResponse(clearRequest)) {
        setClearingConversation(false);
      }
    }
  }

  if (!canUseAI) {
    return (
      <AppScreen title={copy('ผู้ช่วยวิเคราะห์ร้าน', 'Restaurant analytics assistant')} subtitle={copy('ถามจากยอดขายและคลังวัตถุดิบล่าสุดของร้าน', 'Ask questions using the restaurant’s latest sales and inventory data.')} topLevel>
        <Feedback title={copy('ไม่มีสิทธิ์ใช้ผู้ช่วยวิเคราะห์', 'Analytics assistant access unavailable')} detail={copy('ผู้ช่วยวิเคราะห์เปิดให้ใช้งานเฉพาะเจ้าของร้าน', 'The analytics assistant is available to restaurant owners only.')} tone="info" />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={copy('ผู้ช่วยวิเคราะห์ร้าน', 'Restaurant analytics assistant')} subtitle={copy('ถามจากยอดขายและคลังวัตถุดิบล่าสุดของร้าน', 'Ask questions using the restaurant’s latest sales and inventory data.')} topLevel>
      {error ? <Feedback title={copy('วิเคราะห์ข้อมูลไม่ได้', 'Could not analyze data')} detail={error} tone="danger" /> : null}
      {conversationClearError ? (
        <Feedback
          title={copy('ล้างบทสนทนาเฉพาะในแอปแล้ว', 'Local conversation cleared')}
          detail={conversationClearError}
          tone="warning"
        />
      ) : null}
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
        {pendingActionPreview ? (
          <AIActionPreviewPanel
            preview={pendingActionPreview}
            language={language}
            confirming={actionConfirming}
            cancelling={actionCancelling}
            error={actionPreviewError}
            onConfirm={() => { void handleConfirmActionPreview(); }}
            onCancel={() => { void handleCancelActionPreview(); }}
          />
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {prompts.map((prompt) => <Pressable disabled={loading || actionConfirming || actionCancelling || clearingConversation} key={prompt} onPress={() => ask(prompt)} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, opacity: loading || actionConfirming || actionCancelling || clearingConversation ? 0.5 : pressed ? 0.7 : 1 })}><Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{prompt}</Text></Pressable>)}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: spacing.sm }}>
            <TextInput accessibilityLabel={copy('คำถามสำหรับผู้ช่วย AI', 'Question for the AI assistant')} multiline maxLength={800} value={question} onChangeText={setQuestion} placeholder={copy('เช่น พรุ่งนี้ควรเตรียมวัตถุดิบอะไรเพิ่ม?', 'For example: Which ingredients should we prepare more of tomorrow?')} placeholderTextColor={palette.placeholder} style={{ minHeight: 92, borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, color: palette.text, fontSize: 16, padding: spacing.md, textAlignVertical: 'top' }} />
            <Button label={loading ? copy('กำลังวิเคราะห์...', 'Analyzing...') : copy('ถาม AI', 'Ask AI')} onPress={() => ask()} loading={loading} disabled={!question.trim() || actionConfirming || actionCancelling || clearingConversation} />
          </View>
        </KeyboardAvoidingView>
      </Surface>

      {history.length ? (
        <Surface>
          <SectionHeader
            title={copy('บทสนทนา', 'Conversation')}
            detail={latestAnswer ? copy('คำตอบล่าสุดอยู่ด้านล่าง', 'The latest answer appears below.') : undefined}
            action={(
              <Button
                compact
                variant="secondary"
                label={clearingConversation ? copy('กำลังล้าง...', 'Clearing...') : copy('ล้างบทสนทนา', 'Clear')}
                onPress={() => { void handleClearConversation(); }}
                loading={clearingConversation}
                disabled={loading || actionConfirming || actionCancelling}
              />
            )}
          />
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
