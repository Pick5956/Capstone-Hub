import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { getManagerReport, getTopMenuItemsByMonth } from '@/src/api/report';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { getBangkokReportMonth, shiftReportMonth } from '@/src/lib/report-query';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type { ManagerReport, TopMenuItemsReport } from '@/src/types/report';

export default function ReportsScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const canView = can(activeMembership, 'view_reports');
  const currentMonth = useMemo(() => getBangkokReportMonth(), []);
  const [days, setDays] = useState(14);
  const [topMenuMonth, setTopMenuMonth] = useState(currentMonth);
  const [report, setReport] = useState<ManagerReport | null>(null);
  const [topMenus, setTopMenus] = useState<TopMenuItemsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const [managerReport, topMenuReport] = await Promise.all([
        getManagerReport(days),
        getTopMenuItemsByMonth(topMenuMonth),
      ]);
      setReport(managerReport);
      setTopMenus(topMenuReport);
    }
    catch (err) { setError(err instanceof Error ? err.message : copy('โหลดรายงานไม่สำเร็จ', 'Could not load reports.')); }
    finally { setLoading(false); }
  }, [canView, copy, days, topMenuMonth]);
  useEffect(() => { load(); }, [load]);
  const canGoPreviousMonth = topMenuMonth.year > 2000 || topMenuMonth.month > 1;
  const canGoNextMonth = topMenuMonth.year < currentMonth.year
    || (topMenuMonth.year === currentMonth.year && topMenuMonth.month < currentMonth.month);
  const topMenuMonthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(Date.UTC(topMenuMonth.year, topMenuMonth.month - 1, 1, 12))),
    [locale, topMenuMonth],
  );
  const dateLabel = useCallback((value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }, [locale]);

  if (!canView) {
    return (
      <AppScreen title={copy('รายงานผู้จัดการ', 'Manager reports')} subtitle={copy('ยอดขาย ต้นทุนเมนู และวัตถุดิบเสี่ยงจากข้อมูลขายจริง', 'Sales, menu costs, and stock risks based on actual restaurant data.')} topLevel>
        <Feedback title={copy('ไม่มีสิทธิ์ดูรายงาน', 'Report access unavailable')} detail={copy('หน้านี้ต้องใช้สิทธิ์ดูรายงานของร้าน', 'This page requires permission to view restaurant reports.')} tone="info" />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={copy('รายงานผู้จัดการ', 'Manager reports')} subtitle={copy('ยอดขาย ต้นทุนเมนู และวัตถุดิบเสี่ยงจากข้อมูลขายจริง', 'Sales, menu costs, and stock risks based on actual restaurant data.')} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {error ? <Feedback title={copy('โหลดรายงานไม่ได้', 'Could not load reports')} detail={error} tone="danger" /> : null}
      <Surface><ChipGroup label={copy('ช่วงเวลา', 'Reporting period')} value={days} onChange={setDays} options={[{ label: copy('7 วัน', '7 days'), value: 7 }, { label: copy('14 วัน', '14 days'), value: 14 }, { label: copy('30 วัน', '30 days'), value: 30 }]} /></Surface>
      {report ? (
        <>
          <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[
                { label: copy('ยอดขาย', 'Revenue'), value: money(report.summary.revenue, language) },
                { label: copy('ออเดอร์', 'Orders'), value: report.summary.orders.toLocaleString(locale) },
                { label: copy('ต้นทุนวัตถุดิบ', 'Ingredient cost'), value: money(report.summary.cost, language) },
                { label: copy('กำไรขั้นต้น', 'Gross profit'), value: money(report.summary.profit, language) },
                { label: copy('มาร์จิน', 'Margin'), value: `${Number(report.summary.margin).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` },
              ].map((item, index) => <View key={item.label} style={{ minWidth: 125, flexGrow: 1, gap: 3, borderLeftWidth: index ? 1 : 0, borderBottomWidth: index < 3 ? 1 : 0, borderColor: palette.border, padding: spacing.lg }}><Text selectable style={typeScale.number}>{item.value}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text></View>)}
            </View>
          </Surface>

          <Surface>
            <SectionHeader title={copy('ยอดขายรายวัน', 'Daily sales')} detail={copy(`ย้อนหลัง ${days.toLocaleString('th-TH')} วัน`, `Last ${days.toLocaleString('en-US')} days`)} />
            {report.sales_days.length ? report.sales_days.map((day) => (
              <View key={day.order_date} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
                <Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{dateLabel(day.order_date)}</Text>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy(`${day.orders.toLocaleString('th-TH')} ออเดอร์`, `${day.orders.toLocaleString('en-US')} orders`)}</Text>
                <Text selectable style={typeScale.number}>{money(day.revenue, language)}</Text>
              </View>
            )) : <EmptyState title={copy('ยังไม่มียอดขายในช่วงนี้', 'No sales in this period yet')} />}
          </Surface>

          <Surface>
            <SectionHeader
              title={copy('เมนูขายดีประจำเดือน', 'Monthly top sellers')}
              detail={topMenuMonthLabel}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                compact
                variant="secondary"
                label={copy('เดือนก่อน', 'Previous month')}
                onPress={() => setTopMenuMonth((current) => shiftReportMonth(current, -1))}
                disabled={loading || !canGoPreviousMonth}
                style={{ flex: 1 }}
              />
              <Button
                compact
                variant="secondary"
                label={copy('เดือนถัดไป', 'Next month')}
                onPress={() => setTopMenuMonth((current) => shiftReportMonth(current, 1))}
                disabled={loading || !canGoNextMonth}
                style={{ flex: 1 }}
              />
            </View>
            {topMenus?.items.length ? topMenus.items.slice(0, 10).map((item, index) => (
              <View key={`${item.menu_id}-${item.menu_name}`} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
                <Text selectable style={[typeScale.caption, { width: 26, color: palette.muted }]}>#{(index + 1).toLocaleString(locale)}</Text>
                <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{item.menu_name}</Text>
                <Text selectable style={typeScale.number}>{copy(`${item.quantity.toLocaleString('th-TH')} จาน`, `${item.quantity.toLocaleString('en-US')} sold`)}</Text>
              </View>
            )) : <EmptyState title={copy('ยังไม่มีเมนูขายในเดือนนี้', 'No menu sales this month yet')} />}
          </Surface>

          <Surface>
            <SectionHeader title={copy('เมนูและกำไร', 'Menu profitability')} detail={copy('เรียงจากกำไรสูงสุด', 'Sorted by highest profit.')} />
            {report.menu_margins.length ? report.menu_margins.map((item) => (
              <View key={item.menu_id} style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingVertical: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: spacing.md }}><Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{item.menu_name}</Text><Text selectable style={typeScale.number}>{money(item.profit, language)}</Text></View>
                <View style={{ flexDirection: 'row', gap: spacing.md }}><Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{copy(`${item.quantity.toLocaleString('th-TH')} จาน · รายได้ ${money(item.revenue, 'th')}`, `${item.quantity.toLocaleString('en-US')} sold · Revenue ${money(item.revenue, 'en')}`)}</Text><StatusBadge label={`${Number(item.margin).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} tone={item.margin < 20 ? 'danger' : item.margin < 35 ? 'warning' : 'success'} /></View>
              </View>
            )) : <EmptyState title={copy('ยังคำนวณกำไรไม่ได้', 'Profit cannot be calculated yet')} detail={copy('เพิ่มสูตรวัตถุดิบในเมนูเพื่อให้รายงานคำนวณต้นทุนได้', 'Add ingredient recipes to menu items so the report can calculate costs.')} />}
          </Surface>

          <Surface>
            <SectionHeader title={copy('ความเสี่ยงสต็อก', 'Stock risks')} detail={copy('รายการที่ต้องวางแผนเติม', 'Items that need a restocking plan.')} />
            {report.stock_risks.length ? report.stock_risks.map((item) => (
              <View key={item.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
                <View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy(`${item.category || 'ไม่มีหมวด'} · ควรเติม ${Number(item.restock_estimate).toLocaleString('th-TH')} ${item.unit}`, `${item.category || 'Uncategorized'} · Restock ${Number(item.restock_estimate).toLocaleString('en-US')} ${item.unit}`)}</Text></View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}><Text selectable style={typeScale.number}>{Number(item.stock).toLocaleString(locale)} {item.unit}</Text><StatusBadge label={item.status === 'out' ? copy('หมด', 'Out') : copy('ใกล้หมด', 'Low')} tone={item.status === 'out' ? 'danger' : 'warning'} /></View>
              </View>
            )) : <EmptyState title={copy('ไม่มีวัตถุดิบเสี่ยงขาด', 'No ingredients are at risk of running out')} />}
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}
