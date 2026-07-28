import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, EmptyState, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

export default function RestaurantsScreen() {
  const { activeMembership, memberships, selectRestaurant, user } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const membershipCount = new Intl.NumberFormat(locale).format(memberships.length);

  if (!user) return <Redirect href="/login" />;

  return (
    <AuthScreen
      title={copy('เลือกร้านที่จะทำงาน', 'Choose a restaurant')}
      subtitle={copy(
        'ร้านและสิทธิ์ของคุณจากบัญชีเดียวกับเว็บ',
        'Your restaurants and permissions from the same account as the web app',
      )}
    >
      <Surface>
        <SectionHeader
          title={copy('ร้านของฉัน', 'My restaurants')}
          detail={language === 'th'
            ? `${membershipCount} ร้านที่เข้าถึงได้`
            : `${membershipCount} ${memberships.length === 1 ? 'restaurant' : 'restaurants'} available`}
        />
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

          return (
            <Pressable
              key={membership.ID}
              accessibilityLabel={copy('เลือกร้าน', 'Choose restaurant')}
              onPress={() => selectRestaurant(membership)}
              style={({ pressed }) => ({
                minHeight: 76,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderWidth: 1,
                borderColor: active ? palette.primary : palette.border,
                borderRadius: radius.md,
                backgroundColor: active ? palette.accentSoft : palette.surface,
                padding: spacing.md,
                opacity: pressed ? 0.74 : 1,
              })}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  backgroundColor: palette.primary,
                }}
              >
                <Text style={{ color: palette.primaryText, fontWeight: '800' }}>
                  {(membership.restaurant?.name || 'R').slice(0, 1)}
                </Text>
              </View>
              <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
                <Text selectable numberOfLines={1} style={typeScale.cardTitle}>
                  {membership.restaurant?.name
                    || copy(
                      `ร้าน #${membership.restaurant_id}`,
                      `Restaurant #${membership.restaurant_id}`,
                    )}
                </Text>
                <Text
                  selectable
                  numberOfLines={1}
                  style={[typeScale.caption, { color: palette.muted }]}
                >
                  {membership.restaurant?.branch_name
                    || copy('สาขาหลัก', 'Main branch')} · {defaultRole}
                </Text>
              </View>
              {active ? (
                <StatusBadge
                  label={copy('ร้านปัจจุบัน', 'Current restaurant')}
                  tone="success"
                />
              ) : (
                <Text style={{ color: palette.muted, fontSize: 20 }}>›</Text>
              )}
            </Pressable>
          );
        })}
        {!memberships.length ? (
          <EmptyState
            title={copy('ยังไม่มีร้าน', 'No restaurants yet')}
            detail={copy(
              'สร้างร้านใหม่หรือวางลิงก์คำเชิญจากเจ้าของร้าน',
              'Create a restaurant or paste an invitation link from the owner',
            )}
          />
        ) : null}
      </Surface>
      <Surface>
        <Button
          label={copy('สร้างร้านใหม่', 'Create a restaurant')}
          onPress={() => router.push('/create-restaurant' as never)}
        />
        <Button
          variant="secondary"
          label={copy('รับคำเชิญพนักงาน', 'Accept a staff invitation')}
          onPress={() => router.push('/invite/manual' as never)}
        />
      </Surface>
    </AuthScreen>
  );
}
