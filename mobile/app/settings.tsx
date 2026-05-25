import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, Text, View } from 'react-native';

import { updateRestaurant } from '@/src/api/restaurant';
import { FormField, ToggleRow } from '@/src/components/form-controls';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { timeOrDefault, toFloat, toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';

export default function SettingsScreen() {
  const { activeMembership, refreshMemberships, user } = useAuth();
  const restaurant = activeMembership?.restaurant;
  const [name, setName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [restaurantType, setRestaurantType] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [tableCount, setTableCount] = useState('');
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [serviceChargeRate, setServiceChargeRate] = useState('');
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState('');
  const [promptPayName, setPromptPayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurant) return;
    setName(restaurant.name || '');
    setBranchName(restaurant.branch_name || '');
    setRestaurantType(restaurant.restaurant_type || '');
    setPhone(restaurant.phone || '');
    setAddress(restaurant.address || '');
    setOpenTime(restaurant.open_time || '10:00');
    setCloseTime(restaurant.close_time || '22:00');
    setTableCount(String(restaurant.table_count || 0));
    setServiceChargeEnabled(Boolean(restaurant.service_charge_enabled));
    setServiceChargeRate(String(restaurant.service_charge_rate || 0));
    setVatEnabled(Boolean(restaurant.vat_enabled));
    setVatRate(String(restaurant.vat_rate || 0));
    setPromptPayName(restaurant.promptpay_name || '');
  }, [restaurant]);

  if (!user) return <Redirect href="/login" />;
  if (!activeMembership) return <Redirect href="/restaurants" />;

  const editable = can(activeMembership, 'manage_table') || activeMembership.role?.name === 'owner' || activeMembership.role?.name === 'manager';

  async function save() {
    if (!restaurant) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateRestaurant(restaurant.ID, {
        name: name.trim(),
        branch_name: branchName.trim() || 'สำนักงานใหญ่',
        restaurant_type: restaurantType.trim() || 'ร้านอาหาร',
        phone: phone.trim(),
        address: address.trim(),
        open_time: timeOrDefault(openTime, '10:00'),
        close_time: timeOrDefault(closeTime, '22:00'),
        table_count: toInt(tableCount, 0),
        service_charge_enabled: serviceChargeEnabled,
        service_charge_rate: toFloat(serviceChargeRate, 0),
        vat_enabled: vatEnabled,
        vat_rate: toFloat(vatRate, 0),
        promptpay_name: promptPayName.trim(),
        promptpay_qr_image: restaurant.promptpay_qr_image || '',
        logo: restaurant.logo || '',
      });
      await refreshMemberships();
      setMessage('บันทึกการตั้งค่าร้านแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <MobileScreen kicker="SETTINGS" title="ตั้งค่าร้าน" subtitle={restaurant?.name || 'ร้านปัจจุบัน'}>
        {!editable ? <StateMessage title="ไม่มีสิทธิ์แก้ไขร้าน" detail="ต้องเป็น owner หรือ manager" /> : null}
        <View style={layout.panel}>
          <FormField label="ชื่อร้าน" value={name} onChangeText={setName} />
          <FormField label="สาขา" value={branchName} onChangeText={setBranchName} />
          <FormField label="ประเภทร้าน" value={restaurantType} onChangeText={setRestaurantType} />
          <FormField label="เบอร์โทร" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <FormField label="ที่อยู่" value={address} onChangeText={setAddress} multiline />
          <FormField label="เวลาเปิด" value={openTime} onChangeText={setOpenTime} />
          <FormField label="เวลาปิด" value={closeTime} onChangeText={setCloseTime} />
          <FormField label="จำนวนโต๊ะ" value={tableCount} onChangeText={setTableCount} keyboardType="numeric" />
        </View>

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>ภาษีและการชำระเงิน</Text>
          <ToggleRow label="คิด Service Charge" value={serviceChargeEnabled} onValueChange={setServiceChargeEnabled} />
          <FormField label="Service Charge (%)" value={serviceChargeRate} onChangeText={setServiceChargeRate} keyboardType="numeric" />
          <ToggleRow label="คิด VAT" value={vatEnabled} onValueChange={setVatEnabled} />
          <FormField label="VAT (%)" value={vatRate} onChangeText={setVatRate} keyboardType="numeric" />
          <FormField label="ชื่อ PromptPay" value={promptPayName} onChangeText={setPromptPayName} />
        </View>

        {message ? <Text selectable style={[typeScale.caption, { color: colors.accent }]}>{message}</Text> : null}
        {error ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{error}</Text> : null}
        <Pressable disabled={!editable || saving} onPress={save} style={[layout.primaryButton, (!editable || saving) && { opacity: 0.6 }]}>
          <Text style={layout.primaryButtonText}>{saving ? 'กำลังบันทึก' : 'บันทึกตั้งค่าร้าน'}</Text>
        </Pressable>
      </MobileScreen>
    </KeyboardAvoidingView>
  );
}
