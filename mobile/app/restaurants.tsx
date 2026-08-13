import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { AuthScreen } from '@/src/components/auth-screen';
import { AppText as Text } from '@/src/components/app-text';
import {
  Button,
  EdgeRow,
  EdgeSection,
  EdgeSectionHeader,
  EmptyState,
  Feedback,
} from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing } from '@/src/theme';

export default function RestaurantsScreen() {
  const { width } = useWindowDimensions();
  const {
    activeMembership,
    memberships,
    membershipsLoadError,
    refreshMemberships,
    selectRestaurant,
    user,
  } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const [retrying, setRetrying] = useState(false);
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const membershipCount = new Intl.NumberFormat(locale).format(memberships.length);
  const tablet = width >= breakpoints.tablet;
  const edgeSectionStyle = tablet ? undefined : { marginHorizontal: -spacing.xxl };

  if (!user) return <Redirect href="/login" />;

  async function retryMemberships() {
    setRetrying(true);
    try {
      await refreshMemberships();
    } catch {
      // The provider keeps the contextual error visible for another retry.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <AuthScreen
      title={copy('เลือกร้าน', 'Choose a restaurant')}
    >
      <View style={{ gap: spacing.xl }}>
        {membershipsLoadError ? (
          <>
            <Feedback
              title={copy('โหลดร้านของคุณไม่สำเร็จ', 'Could not load your restaurants')}
              detail={copy(
                'บัญชีของคุณยังอยู่ในระบบ ข้อมูลนี้ไม่ได้หมายความว่าคุณไม่มีร้าน',
                'You are still signed in. This does not mean that you have no restaurants.',
              )}
              tone="warning"
            />
            <Button
              variant="secondary"
              label={copy('ลองอีกครั้ง', 'Try again')}
              onPress={retryMemberships}
              loading={retrying}
            />
          </>
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <EdgeSectionHeader
            title={copy('ร้านของคุณ', 'Your restaurants')}
            detail={membershipsLoadError
              ? copy('โหลดรายชื่อร้านไม่ได้', 'Could not load restaurants')
              : language === 'th'
                ? `${membershipCount} ร้าน`
                : `${membershipCount} ${memberships.length === 1 ? 'restaurant' : 'restaurants'}`}
          />
          {memberships.length ? (
            <EdgeSection style={edgeSectionStyle}>
              {memberships.map((membership) => {
                const active = activeMembership?.restaurant_id === membership.restaurant_id;
                const roleName = membership.role?.name || '';
                const defaultRole = roleName === 'owner'
                  ? copy('เจ้าของร้าน', 'Owner')
                  : roleName === 'manager'
                    ? copy('ผู้จัดการ', 'Manager')
                    : roleName === 'cashier'
                      ? copy('แคชเชียร์', 'Cashier')
                      : roleName === 'waiter'
                        ? copy('พนักงานเสิร์ฟ', 'Server')
                        : roleName === 'chef'
                          ? copy('ครัว', 'Kitchen')
                          : membership.role?.display_name || roleName || copy('พนักงาน', 'Staff');
                const restaurantName = membership.restaurant?.name
                  || copy(
                    `ร้าน #${membership.restaurant_id}`,
                    `Restaurant #${membership.restaurant_id}`,
                  );

                return (
                  <EdgeRow
                    accessibilityLabel={copy(`เลือกร้าน ${restaurantName}`, `Choose ${restaurantName}`)}
                    detail={`${membership.restaurant?.branch_name || copy('สาขาหลัก', 'Main branch')} · ${defaultRole}`}
                    icon="storefront-outline"
                    iconColor={active ? palette.accent : palette.text}
                    key={membership.ID}
                    onPress={() => selectRestaurant(membership)}
                    style={active ? { backgroundColor: palette.accentSoft } : undefined}
                    title={restaurantName}
                    trailing={active ? (
                      <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>
                        {copy('ร้านปัจจุบัน', 'Current')}
                      </Text>
                    ) : undefined}
                  />
                );
              })}
            </EdgeSection>
          ) : !membershipsLoadError ? (
            <EdgeSection style={[edgeSectionStyle, { paddingHorizontal: spacing.lg }]}>
              <EmptyState
                title={copy('ยังไม่มีร้าน', 'No restaurants yet')}
                detail={copy(
                  'สร้างร้านใหม่หรือวางลิงก์คำเชิญจากเจ้าของร้าน',
                  'Create a restaurant or paste an invitation link from the owner',
                )}
              />
            </EdgeSection>
          ) : null}
        </View>
        {!membershipsLoadError || memberships.length ? (
          <View style={{ gap: spacing.sm }}>
            <EdgeSectionHeader
              title={copy('เพิ่มร้าน', 'Add a restaurant')}
              detail={copy('สร้างร้านของคุณหรือเข้าร่วมทีมที่มีอยู่', 'Create your own or join an existing team')}
            />
            <EdgeSection style={edgeSectionStyle}>
              <EdgeRow
                icon="add-outline"
                onPress={() => router.push('/create-restaurant' as never)}
                title={copy('สร้างร้านใหม่', 'Create restaurant')}
              />
              <EdgeRow
                icon="mail-open-outline"
                onPress={() => router.push('/invite/manual' as never)}
                title={copy('เปิดคำเชิญ', 'Open invitation')}
              />
            </EdgeSection>
          </View>
        ) : null}
      </View>
    </AuthScreen>
  );
}
