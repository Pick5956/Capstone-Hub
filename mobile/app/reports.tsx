import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';

import { getManagerReport } from '@/src/api/report';
import { AppScreen } from '@/src/components/app-shell';
import { ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { palette, spacing, typeScale } from '@/src/theme';
import type { ManagerReport } from '@/src/types/report';

export default function ReportsScreen() {
  const [days, setDays] = useState(14);
  const [report, setReport] = useState<ManagerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setReport(await getManagerReport(days)); }
    catch (err) { setError(err instanceof Error ? err.message : 'โหลดรายงานไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  return (
    <AppScreen title="รายงานผู้จัดการ" subtitle="รายได้ ต้นทุน กำไร และความเสี่ยงสต็อกจากข้อมูลจริง" topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {error ? <Feedback title="โหลดรายงานไม่ได้" detail={error} tone="danger" /> : null}
      <Surface><ChipGroup label="ช่วงเวลา" value={days} onChange={setDays} options={[{ label: '7 วัน', value: 7 }, { label: '14 วัน', value: 14 }, { label: '30 วัน', value: 30 }]} /></Surface>
      {report ? (
        <>
          <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[
                { label: 'รายได้', value: money(report.summary.revenue) },
                { label: 'ออเดอร์', value: report.summary.orders.toLocaleString() },
                { label: 'ต้นทุนอาหาร', value: money(report.summary.cost) },
                { label: 'กำไร', value: money(report.summary.profit) },
                { label: 'Margin', value: `${Number(report.summary.margin).toFixed(1)}%` },
              ].map((item, index) => <View key={item.label} style={{ minWidth: 125, flexGrow: 1, gap: 3, borderLeftWidth: index ? 1 : 0, borderBottomWidth: index < 3 ? 1 : 0, borderColor: palette.border, padding: spacing.lg }}><Text selectable style={typeScale.number}>{item.value}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text></View>)}
            </View>
          </Surface>

          <Surface>
            <SectionHeader title="ยอดขายรายวัน" detail={`ย้อนหลัง ${days} วัน`} />
            {report.sales_days.length ? report.sales_days.map((day) => (
              <View key={day.order_date} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
                <Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{day.order_date}</Text>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{day.orders} ออเดอร์</Text>
                <Text selectable style={typeScale.number}>{money(day.revenue)}</Text>
              </View>
            )) : <EmptyState title="ยังไม่มียอดขายในช่วงนี้" />}
          </Surface>

          <Surface>
            <SectionHeader title="กำไรตามเมนู" detail="เรียงจากรายได้สูงสุด" />
            {report.menu_margins.length ? report.menu_margins.map((item) => (
              <View key={item.menu_id} style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingVertical: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: spacing.md }}><Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{item.menu_name}</Text><Text selectable style={typeScale.number}>{money(item.profit)}</Text></View>
                <View style={{ flexDirection: 'row', gap: spacing.md }}><Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{item.quantity} จาน · รายได้ {money(item.revenue)}</Text><StatusBadge label={`${Number(item.margin).toFixed(1)}%`} tone={item.margin < 20 ? 'danger' : item.margin < 35 ? 'warning' : 'success'} /></View>
              </View>
            )) : <EmptyState title="ยังคำนวณกำไรไม่ได้" detail="เพิ่มสูตรวัตถุดิบในเมนูเพื่อให้รายงานคำนวณต้นทุนได้" />}
          </Surface>

          <Surface>
            <SectionHeader title="ความเสี่ยงสต็อก" detail="รายการที่ต้องวางแผนเติม" />
            {report.stock_risks.length ? report.stock_risks.map((item) => (
              <View key={item.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
                <View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.category || 'ไม่มีหมวด'}</Text></View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}><Text selectable style={typeScale.number}>{item.stock} {item.unit}</Text><StatusBadge label={item.status === 'out' ? 'หมด' : 'ใกล้หมด'} tone={item.status === 'out' ? 'danger' : 'warning'} /></View>
              </View>
            )) : <EmptyState title="ไม่มีวัตถุดิบเสี่ยงขาด" />}
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}
