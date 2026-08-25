import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { createExpense, deleteExpense, updateExpense } from '@/src/api/expense';
import { AppScreen } from '@/src/components/app-shell';
import { StateMessage } from '@/src/components/mobile-screen';
import { Button, ChipGroup, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { spacing } from '@/src/theme';
import { expenseCategories, type ExpenseCategory } from '@/src/types/expense';

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function normalizeDate(value: string | undefined) {
  if (!value) return todayIso();
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : todayIso();
}

function categoryLabel(category: string, copy: (th: string, en: string) => string) {
  switch (category) {
    case 'ingredient': return copy('วัตถุดิบ', 'Ingredients');
    case 'labor': return copy('ค่าแรง', 'Labor');
    case 'rent': return copy('ค่าเช่า', 'Rent');
    case 'utilities': return copy('สาธารณูปโภค', 'Utilities');
    case 'equipment': return copy('อุปกรณ์', 'Equipment');
    default: return copy('อื่นๆ', 'Other');
  }
}

export default function ExpenseItemScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const params = useLocalSearchParams<{ id?: string; category?: string; amount?: string; spent_at?: string; note?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const editing = editingId !== null && Number.isInteger(editingId) && editingId > 0;
  const canEdit = can(activeMembership, 'manage_expenses');

  const initialCategory = useMemo<ExpenseCategory>(() => {
    const value = params.category;
    return (expenseCategories as readonly string[]).includes(value ?? '') ? (value as ExpenseCategory) : 'other';
  }, [params.category]);

  const [category, setCategory] = useState<ExpenseCategory>(initialCategory);
  const [amount, setAmount] = useState(params.amount ? String(params.amount) : '');
  const [spentAt, setSpentAt] = useState(normalizeDate(params.spent_at));
  const [note, setNote] = useState(params.note ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = editing ? copy('แก้ไขค่าใช้จ่าย', 'Edit expense') : copy('เพิ่มค่าใช้จ่าย', 'Add expense');

  if (!canEdit) {
    return (
      <AppScreen title={title} topLevel={false}>
        <StateMessage
          title={copy('ไม่มีสิทธิ์จัดการค่าใช้จ่าย', 'Expense management unavailable')}
          detail={copy('บัญชีนี้ต้องมีสิทธิ์จัดการค่าใช้จ่าย', 'This account needs permission to manage expenses.')}
        />
      </AppScreen>
    );
  }

  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(copy('กรอกจำนวนเงินให้มากกว่า 0', 'Enter an amount greater than zero.'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spentAt)) {
      setError(copy('กรอกวันที่รูปแบบ ปปปป-ดด-วว', 'Enter a date as YYYY-MM-DD.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { category, amount: value, spent_at: spentAt, note: note.trim() };
      if (editing && editingId !== null) {
        await updateExpense(editingId, payload);
      } else {
        await createExpense(payload);
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('บันทึกค่าใช้จ่ายไม่สำเร็จ', 'Could not save the expense.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || editingId === null) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    setError(null);
    try {
      await deleteExpense(editingId);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('ลบค่าใช้จ่ายไม่สำเร็จ', 'Could not delete the expense.'));
      setSaving(false);
    }
  }

  return (
    <AppScreen
      title={title}
      subtitle={copy('หมวด จำนวนเงิน วันที่ และหมายเหตุ', 'Category, amount, date, and note.')}
      topLevel={false}
    >
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      <View style={{ gap: spacing.lg }}>
        <Surface>
          <SectionHeader title={copy('รายละเอียดค่าใช้จ่าย', 'Expense details')} />
          <ChipGroup
            scrollable
            label={copy('หมวด', 'Category')}
            value={category}
            onChange={setCategory}
            options={expenseCategories.map((value) => ({ label: categoryLabel(value, copy), value }))}
          />
          <TextField icon="cash-outline" label={copy('จำนวนเงิน (บาท)', 'Amount (THB)')} value={amount} keyboardType="decimal-pad" onChangeText={setAmount} />
          <View style={{ gap: spacing.sm }}>
            <TextField icon="calendar-outline" label={copy('วันที่ (ปปปป-ดด-วว)', 'Date (YYYY-MM-DD)')} value={spentAt} onChangeText={setSpentAt} />
            <View style={{ alignItems: 'flex-start' }}>
              <Button compact variant="ghost" icon="today-outline" label={copy('วันนี้', 'Today')} onPress={() => setSpentAt(todayIso())} />
            </View>
          </View>
          <TextField icon="document-text-outline" label={copy('หมายเหตุ (ไม่บังคับ)', 'Note (optional)')} value={note} onChangeText={setNote} multiline />
          <Button icon="save-outline" label={editing ? copy('บันทึกการแก้ไข', 'Save changes') : copy('เพิ่มค่าใช้จ่าย', 'Add expense')} onPress={save} loading={saving} />
        </Surface>

        {editing ? (
          <Surface>
            <SectionHeader
              title={copy('ลบค่าใช้จ่าย', 'Delete expense')}
              detail={confirmDelete ? copy('แตะยืนยันอีกครั้งเพื่อลบรายการนี้', 'Confirm again to delete this entry.') : copy('ลบรายการค่าใช้จ่ายนี้ถาวร', 'Permanently remove this expense entry.')}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {confirmDelete ? <Button variant="secondary" label={copy('ยกเลิก', 'Cancel')} onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} /> : null}
              <Button icon="trash-outline" variant="danger" label={confirmDelete ? copy('ยืนยันลบ', 'Confirm delete') : copy('ลบค่าใช้จ่าย', 'Delete expense')} onPress={remove} loading={saving} style={{ flex: 1 }} />
            </View>
          </Surface>
        ) : null}
      </View>
    </AppScreen>
  );
}
