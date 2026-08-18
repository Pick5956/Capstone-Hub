import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { createRestaurant } from '@/src/api/restaurant';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, ChipGroup, Feedback, SectionHeader, TextField } from '@/src/components/ui';
import { timeOrDefault, toInt } from '@/src/lib/forms';
import {
  DEFAULT_RESTAURANT_TYPE,
  restaurantTypeOptions,
} from '@/src/lib/restaurant-types';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing } from '@/src/theme';

export default function CreateRestaurantScreen() {
  const { width } = useWindowDimensions();
  const { refreshMemberships, setActiveRestaurantFromMembership, user } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const [name, setName] = useState('');
  const [branch, setBranch] = useState(() => copy('สำนักงานใหญ่', 'Head office'));
  const [type, setType] = useState<string>(DEFAULT_RESTAURANT_TYPE);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [open, setOpen] = useState('10:00');
  const [close, setClose] = useState('22:00');
  const [tables, setTables] = useState('0');
  const [splitZones, setSplitZones] = useState<'yes' | 'no'>('yes');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBranch((current) => (
      current === 'สำนักงานใหญ่' || current === 'Head office'
        ? copy('สำนักงานใหญ่', 'Head office')
        : current
    ));
  }, [copy]);

  async function submit() {
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!name.trim()) {
      setError(copy('กรอกชื่อร้านก่อน', 'Enter a restaurant name'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await createRestaurant({
        name: name.trim(),
        branch_name: branch.trim() || copy('สำนักงานใหญ่', 'Head office'),
        restaurant_type: type,
        phone: phone.trim(),
        address: address.trim(),
        open_time: timeOrDefault(open, '10:00'),
        close_time: timeOrDefault(close, '22:00'),
        table_count: toInt(tables, 0),
        split_zones: splitZones === 'yes',
      });
      await setActiveRestaurantFromMembership(response.membership);
      await refreshMemberships().catch(() => undefined);
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('สร้างร้านไม่สำเร็จ', 'Could not create the restaurant'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthScreen
      title={copy('สร้างร้าน', 'Create restaurant')}
      showBack
    >
      {error ? (
        <Feedback
          title={copy('สร้างร้านไม่ได้', 'Unable to create restaurant')}
          detail={error}
          tone="danger"
        />
      ) : null}
      <View style={{ gap: spacing.xl }}>
        <TextField icon="storefront-outline" label={copy('ชื่อร้าน', 'Restaurant name')} value={name} onChangeText={setName} />
        <TextField icon="location-outline" label={copy('สาขา', 'Branch')} value={branch} onChangeText={setBranch} />
        <ChipGroup
          label={copy('ประเภทร้าน', 'Restaurant type')}
          value={type}
          onChange={setType}
          options={restaurantTypeOptions(language)}
          scrollable
        />

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
          onPress={() => setDetailsOpen((current) => !current)}
          style={({ pressed }) => ({
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: radius.md,
            backgroundColor: pressed ? palette.surfaceStrong : palette.surfaceSubtle,
            paddingHorizontal: spacing.md,
          })}
        >
          <AppIcon color={palette.muted} name="information-circle-outline" size={19} />
          <Text style={{ flex: 1, color: palette.text, fontSize: 13, fontWeight: '700' }}>
            {copy('เพิ่มเบอร์โทรและที่อยู่', 'Add phone and address')}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>{copy('ไม่บังคับ', 'Optional')}</Text>
          <AppIcon color={palette.muted} name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={17} />
        </Pressable>

        {detailsOpen ? (
          <View style={{ gap: spacing.md }}>
            <TextField
              icon="call-outline"
              label={copy('เบอร์โทรร้าน', 'Restaurant phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <TextField
              icon="navigate-outline"
              label={copy('ที่อยู่', 'Address')}
              value={address}
              onChangeText={setAddress}
              multiline
            />
          </View>
        ) : null}

        <SectionHeader title={copy('เวลาและโต๊ะ', 'Hours and tables')} />
        <View style={{ flexDirection: width >= 360 ? 'row' : 'column', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <TextField
              icon="time-outline"
              label={copy('เวลาเปิด', 'Opening time')}
              value={open}
              onChangeText={setOpen}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              icon="moon-outline"
              label={copy('เวลาปิด', 'Closing time')}
              value={close}
              onChangeText={setClose}
            />
          </View>
        </View>
        <TextField
          icon="grid-outline"
          label={copy('จำนวนโต๊ะเริ่มต้น', 'Initial table count')}
          value={tables}
          onChangeText={setTables}
          keyboardType="number-pad"
        />
        <ChipGroup
          label={copy('รูปแบบโต๊ะเริ่มต้น', 'Initial table layout')}
          value={splitZones}
          onChange={setSplitZones}
          options={[
            {
              label: copy('แบ่งตามโซนตัวอย่าง', 'Create sample zones'),
              value: 'yes',
            },
            { label: copy('ไม่แบ่งโซน', 'No zones'), value: 'no' },
          ]}
        />
        <Button
          icon="arrow-forward"
          label={copy('สร้างร้าน', 'Create restaurant')}
          onPress={submit}
          loading={saving}
        />
      </View>
    </AuthScreen>
  );
}
