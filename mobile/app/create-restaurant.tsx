import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { createRestaurant } from '@/src/api/restaurant';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, ChipGroup, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { timeOrDefault, toInt } from '@/src/lib/forms';
import {
  DEFAULT_RESTAURANT_TYPE,
  restaurantTypeOptions,
} from '@/src/lib/restaurant-types';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { spacing } from '@/src/theme';

export default function CreateRestaurantScreen() {
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
      title={copy('สร้างร้าน', 'Create a restaurant')}
      subtitle={copy(
        'ระบบจะตั้งคุณเป็นเจ้าของร้านและเตรียมข้อมูลเริ่มต้นตามประเภทร้าน',
        'You will become the owner, and Dishy will prepare starter data for this restaurant type.',
      )}
      showBack
    >
      {error ? (
        <Feedback
          title={copy('สร้างร้านไม่ได้', 'Unable to create restaurant')}
          detail={error}
          tone="danger"
        />
      ) : null}
      <Surface>
        <SectionHeader title={copy('ข้อมูลร้าน', 'Restaurant information')} />
        <TextField label={copy('ชื่อร้าน', 'Restaurant name')} value={name} onChangeText={setName} />
        <TextField label={copy('สาขา', 'Branch')} value={branch} onChangeText={setBranch} />
        <ChipGroup
          label={copy('ประเภทร้าน', 'Restaurant type')}
          value={type}
          onChange={setType}
          options={restaurantTypeOptions(language)}
        />
        <TextField
          label={copy('เบอร์โทรร้าน', 'Restaurant phone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextField
          label={copy('ที่อยู่', 'Address')}
          value={address}
          onChangeText={setAddress}
          multiline
        />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={copy('เวลาเปิด', 'Opening time')}
              value={open}
              onChangeText={setOpen}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label={copy('เวลาปิด', 'Closing time')}
              value={close}
              onChangeText={setClose}
            />
          </View>
        </View>
        <TextField
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
          label={copy('สร้างร้านและเริ่มใช้งาน', 'Create restaurant and get started')}
          onPress={submit}
          loading={saving}
        />
      </Surface>
    </AuthScreen>
  );
}
