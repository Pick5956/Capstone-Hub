import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { createIngredient, listIngredientCategories } from '@/src/api/ingredient';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { buildIngredientCreateInput, ingredientUnitOptions } from '@/src/lib/inventory-form';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type { IngredientCategory } from '@/src/types/ingredient';

interface BulkRow {
  key: string;
  name: string;
  categoryId: string;
  unit: string;
  cost: string;
  stock: string;
  minStock: string;
}

function emptyRow(): BulkRow {
  return { key: Math.random().toString(36).slice(2), name: '', categoryId: 'none', unit: 'กก.', cost: '0', stock: '0', minStock: '0' };
}

export default function BulkAddIngredientsScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_inventory');
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [rows, setRows] = useState<BulkRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    listIngredientCategories()
      .then((response) => setCategories(response.categories || []))
      .catch((err) => setError(err instanceof Error ? err.message : copy('โหลดหมวดไม่สำเร็จ', 'Could not load categories.')));
  }, [canManage, copy]);

  const categoryOptions = useMemo(
    () => [{ label: copy('ไม่มีหมวด', 'None'), value: 'none' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))],
    [categories, copy],
  );

  const readyCount = rows.filter((row) => row.name.trim()).length;

  function patchRow(key: string, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)));
  }

  async function saveAll() {
    if (!canManage) return;
    const valid = rows.filter((row) => row.name.trim());
    if (!valid.length) {
      setError(copy('กรอกชื่อวัตถุดิบอย่างน้อยหนึ่งรายการ', 'Enter at least one ingredient name.'));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const results = await Promise.allSettled(
        valid.map((row) =>
          createIngredient(
            buildIngredientCreateInput({
              name: row.name,
              sku: '',
              categoryId: row.categoryId,
              imageUrl: '',
              unit: row.unit,
              stock: row.stock,
              minStock: row.minStock,
              cost: row.cost,
              yieldPercent: '100',
              storageType: 'room_temp',
            }),
          ),
        ),
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      const created = results.length - failed;
      if (failed > 0) {
        setError(copy(`บันทึกสำเร็จ ${created} รายการ, ล้มเหลว ${failed} รายการ`, `Saved ${created}, failed ${failed}.`));
        setMessage(null);
      } else {
        router.back();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('บันทึกวัตถุดิบไม่สำเร็จ', 'Could not save ingredients.'));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <AppScreen title={copy('เพิ่มหลายรายการ', 'Bulk add ingredients')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์จัดการคลังวัตถุดิบ', 'Inventory management access unavailable')}
          detail={copy('บัญชีนี้ต้องมีสิทธิ์จัดการคลังวัตถุดิบ', 'This account needs permission to manage inventory.')}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('เพิ่มหลายรายการ', 'Bulk add ingredients')}
      subtitle={copy('กรอกได้หลายรายการแล้วบันทึกรอบเดียว', 'Fill several rows and save them at once.')}
      topLevel={false}
      action={<Button compact icon="add-outline" variant="secondary" label={copy('เพิ่มแถว', 'Add row')} onPress={addRow} />}
    >
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      <View style={{ gap: spacing.lg }}>
        {rows.map((row, index) => (
          <Surface key={row.key}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[typeScale.caption, { color: palette.muted }]}>{copy(`รายการ ${index + 1}`, `Item ${index + 1}`)}</Text>
              {rows.length > 1 ? (
                <Button compact variant="ghost" icon="close-outline" label={copy('เอาออก', 'Remove')} onPress={() => removeRow(row.key)} />
              ) : null}
            </View>
            <TextField icon="cube-outline" label={copy('ชื่อวัตถุดิบ', 'Ingredient name')} value={row.name} onChangeText={(value) => patchRow(row.key, { name: value })} />
            <ChipGroup scrollable label={copy('หมวด', 'Category')} value={row.categoryId} options={categoryOptions} onChange={(value) => patchRow(row.key, { categoryId: value })} />
            <ChipGroup scrollable label={copy('หน่วย', 'Unit')} value={row.unit} options={ingredientUnitOptions(row.unit).map((option) => ({ label: option, value: option }))} onChange={(value) => patchRow(row.key, { unit: value })} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <View style={{ flex: 1, minWidth: 120 }}>
                <TextField icon="cash-outline" label={copy('ต้นทุน/หน่วย', 'Cost/unit')} value={row.cost} keyboardType="decimal-pad" onChangeText={(value) => patchRow(row.key, { cost: value })} />
              </View>
              <View style={{ flex: 1, minWidth: 120 }}>
                <TextField icon="layers-outline" label={copy('สต็อกเริ่มต้น', 'Opening stock')} value={row.stock} keyboardType="decimal-pad" onChangeText={(value) => patchRow(row.key, { stock: value })} />
              </View>
              <View style={{ flex: 1, minWidth: 120 }}>
                <TextField icon="alert-circle-outline" label={copy('จุดเตือนขั้นต่ำ', 'Low-stock')} value={row.minStock} keyboardType="decimal-pad" onChangeText={(value) => patchRow(row.key, { minStock: value })} />
              </View>
            </View>
          </Surface>
        ))}
        <Button icon="add-outline" variant="secondary" label={copy('เพิ่มแถว', 'Add row')} onPress={addRow} />
        <Button
          icon="save-outline"
          label={copy(`บันทึกทั้งหมด (${readyCount})`, `Save all (${readyCount})`)}
          onPress={saveAll}
          loading={saving}
          disabled={!readyCount}
        />
      </View>
    </AppScreen>
  );
}
