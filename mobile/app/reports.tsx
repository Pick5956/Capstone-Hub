import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { getManagerReport, getTopMenuItemsByMonth } from '@/src/api/report';
import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppRefreshControl, AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { loadFilteredReplacement } from '@/src/lib/filter-reload';
import { getBangkokReportMonth, shiftReportMonth } from '@/src/lib/report-query';
import { can } from '@/src/lib/rbac';
import { createRequestGeneration } from '@/src/lib/request-generation';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { ManagerReport, TopMenuItemsReport } from '@/src/types/report';

export default function ReportsScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const canView = can(activeMembership, 'view_reports');
  const currentMonth = useMemo(() => getBangkokReportMonth(), []);
  // Fixed window, matching the web reports page. There is no period picker.
  const REPORT_DAYS = 14;
  const [topMenuMonth, setTopMenuMonth] = useState(currentMonth);
  const [report, setReport] = useState<ManagerReport | null>(null);
  const [topMenus, setTopMenus] = useState<TopMenuItemsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setReportError] = useState<string | null>(null);
  const requestGenerationRef = useRef(createRequestGeneration());
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  const load = useCallback(async () => {
    if (!canView) {
      requestGenerationRef.current.invalidate();
      setReport(null);
      setTopMenus(null);
      setLoading(false);
      return;
    }
    const request = requestGenerationRef.current.begin();
    const setError = (value: string | null) => {
      if (requestGenerationRef.current.isCurrent(request)) setReportError(value);
    };
    setLoading(true);
    setError(null);
    setReport(null);
    setTopMenus(null);
    const result = await loadFilteredReplacement(() => Promise.all([
        getManagerReport(REPORT_DAYS),
        getTopMenuItemsByMonth(topMenuMonth),
      ]));
    if (!requestGenerationRef.current.isCurrent(request)) return;
    if (result.ok) {
      const [managerReport, topMenuReport] = result.data;
      setReport(managerReport);
      setTopMenus(topMenuReport);
    } else {
      setReport(null);
      setTopMenus(null);
      setError(result.error instanceof Error ? result.error.message : copy('โหลดรายงานไม่สำเร็จ', 'Could not load reports.'));
    }
    setLoading(false);
  }, [canView, copy, topMenuMonth]);
  useEffect(() => {
    void load();
    return () => requestGenerationRef.current.invalidate();
  }, [load]);
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

  const summaryPanel = report ? (
    <Surface>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppIcon color={palette.muted} name="analytics-outline" size={20} />
        <Text selectable style={typeScale.title}>{copy('ภาพรวม', 'Overview')}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
        {([
          { icon: 'cash-outline', label: copy('ยอดขาย', 'Revenue'), value: money(report.summary.revenue, language) },
          { icon: 'receipt-outline', label: copy('ออเดอร์', 'Orders'), value: report.summary.orders.toLocaleString(locale) },
          { icon: 'cube-outline', label: copy('ต้นทุนวัตถุดิบ', 'Ingredient cost'), value: money(report.summary.cost, language) },
          { icon: 'trending-up-outline', label: copy('กำไรขั้นต้น', 'Gross profit'), value: money(report.summary.profit, language) },
          { icon: 'pie-chart-outline', label: copy('มาร์จิน', 'Margin'), value: `${Number(report.summary.margin).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` },
        ] as { icon: AppIconName; label: string; value: string }[]).map((item) => (
          <View key={item.label} style={{ minWidth: 126, minHeight: 66, flexBasis: tabletWorkspace ? 150 : 126, flexGrow: 1, justifyContent: 'space-between', gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppIcon color={palette.muted} name={item.icon} size={18} />
              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text>
            </View>
            <Text selectable style={typeScale.number}>{item.value}</Text>
          </View>
        ))}
      </View>
    </Surface>
  ) : null;

  const dailySalesPanel = report ? (
    <Surface>
      <SectionHeader title={copy('ยอดขายรายวัน', 'Daily sales')} detail={copy(`ย้อนหลัง ${REPORT_DAYS.toLocaleString('th-TH')} วัน`, `Last ${REPORT_DAYS.toLocaleString('en-US')} days`)} />
      {report.sales_days.length ? report.sales_days.map((day) => (
        <View key={day.order_date} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
          <Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{dateLabel(day.order_date)}</Text>
          <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy(`${day.orders.toLocaleString('th-TH')} ออเดอร์`, `${day.orders.toLocaleString('en-US')} orders`)}</Text>
          <Text selectable style={typeScale.number}>{money(day.revenue, language)}</Text>
        </View>
      )) : <EmptyState title={copy('ยังไม่มียอดขายในช่วงนี้', 'No sales in this period yet')} />}
    </Surface>
  ) : null;

  const topMenusPanel = report ? (
    <Surface>
      <SectionHeader title={copy('เมนูขายดี', 'Top sellers')} detail={topMenuMonthLabel} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button compact variant="secondary" icon="chevron-back" label={copy('เดือนก่อน', 'Previous')} onPress={() => setTopMenuMonth((current) => shiftReportMonth(current, -1))} disabled={loading || !canGoPreviousMonth} style={{ flex: 1 }} />
        <Button compact variant="secondary" icon="chevron-forward" label={copy('เดือนถัดไป', 'Next')} onPress={() => setTopMenuMonth((current) => shiftReportMonth(current, 1))} disabled={loading || !canGoNextMonth} style={{ flex: 1 }} />
      </View>
      {topMenus?.items.length ? topMenus.items.slice(0, 10).map((item, index) => (
        <View key={`${item.menu_id}-${item.menu_name}`} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
          <Text selectable style={[typeScale.caption, { width: 26, color: palette.muted }]}>#{(index + 1).toLocaleString(locale)}</Text>
          <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{item.menu_name}</Text>
          <Text selectable style={typeScale.number}>{copy(`${item.quantity.toLocaleString('th-TH')} จาน`, `${item.quantity.toLocaleString('en-US')} sold`)}</Text>
        </View>
      )) : <EmptyState title={copy('ยังไม่มีเมนูขายในเดือนนี้', 'No menu sales this month yet')} />}
    </Surface>
  ) : null;

  const profitabilityPanel = report ? (
    <Surface>
      <SectionHeader title={copy('กำไรต่อเมนู', 'Menu profitability')} detail={copy('เรียงจากกำไรสูงสุด', 'Highest profit first')} />
      {report.menu_margins.length ? report.menu_margins.map((item) => (
        <View key={item.menu_id} style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingVertical: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{item.menu_name}</Text>
            <Text selectable style={typeScale.number}>{money(item.profit, language)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{copy(`${item.quantity.toLocaleString('th-TH')} จาน · รายได้ ${money(item.revenue, 'th')}`, `${item.quantity.toLocaleString('en-US')} sold · Revenue ${money(item.revenue, 'en')}`)}</Text>
            <StatusBadge label={`${Number(item.margin).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} tone={item.margin < 20 ? 'danger' : item.margin < 35 ? 'warning' : 'success'} />
          </View>
        </View>
      )) : <EmptyState title={copy('ยังคำนวณกำไรไม่ได้', 'Profit cannot be calculated yet')} detail={copy('เพิ่มสูตรวัตถุดิบในเมนูเพื่อคำนวณต้นทุน', 'Add ingredient recipes to calculate costs.')} />}
    </Surface>
  ) : null;

  const stockRisksPanel = report ? (
    <Surface>
      <SectionHeader title={copy('สต็อกต้องดู', 'Stock risks')} detail={copy('รายการที่ควรวางแผนเติม', 'Plan these restocks')} />
      {report.stock_risks.length ? report.stock_risks.map((item) => (
        <View key={item.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={typeScale.cardTitle}>{item.name}</Text>
            <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy(`${item.category || 'ไม่มีหมวด'} · เติม ${Number(item.restock_estimate).toLocaleString('th-TH')} ${item.unit}`, `${item.category || 'Uncategorized'} · Restock ${Number(item.restock_estimate).toLocaleString('en-US')} ${item.unit}`)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text selectable style={typeScale.number}>{Number(item.stock).toLocaleString(locale)} {item.unit}</Text>
            <StatusBadge label={item.status === 'out' ? copy('หมด', 'Out') : copy('ใกล้หมด', 'Low')} tone={item.status === 'out' ? 'danger' : 'warning'} />
          </View>
        </View>
      )) : <EmptyState title={copy('ไม่มีสต็อกเสี่ยงขาด', 'No stock at risk')} />}
    </Surface>
  ) : null;

  if (!canView) {
    return (
      <AppScreen title={copy('รายงานร้าน', 'Reports')} subtitle={copy('ยอดขาย กำไร และสต็อก', 'Sales, profit, and stock')} topLevel={false}>
        <Feedback title={copy('ไม่มีสิทธิ์ดูรายงาน', 'Report access unavailable')} detail={copy('หน้านี้ต้องใช้สิทธิ์ดูรายงานของร้าน', 'This page requires permission to view restaurant reports.')} tone="info" />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={copy('รายงานร้าน', 'Reports')} subtitle={copy('ยอดขาย กำไร และสต็อก', 'Sales, profit, and stock')} topLevel={false} refreshControl={<AppRefreshControl onRefresh={load} />}>
      {error ? <Feedback title={copy('โหลดรายงานไม่ได้', 'Could not load reports')} detail={error} tone="danger" /> : null}
      {tabletWorkspace && report ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl }}>
          <View style={{ flex: 1.35, gap: spacing.xl }}>
            {summaryPanel}
            {dailySalesPanel}
            {profitabilityPanel}
          </View>
          <View style={{ flex: 0.85, gap: spacing.xl }}>
            {topMenusPanel}
            {stockRisksPanel}
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing.xl }}>
          {summaryPanel}
          {dailySalesPanel}
          {topMenusPanel}
          {profitabilityPanel}
          {stockRisksPanel}
        </View>
      )}
    </AppScreen>
  );
}
