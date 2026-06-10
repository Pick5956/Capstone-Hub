import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';

import { createRestaurant } from '@/src/api/restaurant';
import { FormField } from '@/src/components/form-controls';
import { timeOrDefault, toInt } from '@/src/lib/forms';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';

export default function CreateRestaurantScreen() {
  const { refreshMemberships, setActiveRestaurantFromMembership, user } = useAuth();
  const [name, setName] = useState('');
  const [branchName, setBranchName] = useState('สำนักงานใหญ่');
  const [restaurantType, setRestaurantType] = useState('ร้านอาหาร');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [tableCount, setTableCount] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!user) {
      router.replace('/login');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await createRestaurant({
        name: name.trim(),
        branch_name: branchName.trim() || 'สำนักงานใหญ่',
        restaurant_type: restaurantType.trim() || 'ร้านอาหาร',
        phone: phone.trim(),
        address: address.trim(),
        open_time: timeOrDefault(openTime, '10:00'),
        close_time: timeOrDefault(closeTime, '22:00'),
        table_count: toInt(tableCount, 0),
      });
      await refreshMemberships();
      await setActiveRestaurantFromMembership(response.membership);
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างร้านไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={layout.scrollContainer}>
        <View style={layout.headerRow}>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>กลับ</Text>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable style={typeScale.kicker}>SETUP</Text>
            <Text selectable style={typeScale.hero}>สร้างร้าน</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>สร้าง workspace ร้านและตั้งคุณเป็น owner</Text>
          </View>
        </View>

        <View style={layout.panel}>
          <FormField label="ชื่อร้าน" value={name} onChangeText={setName} placeholder="เช่น Dishy Cafe" />
          <FormField label="สาขา" value={branchName} onChangeText={setBranchName} placeholder="สำนักงานใหญ่" />
          <FormField label="ประเภทร้าน" value={restaurantType} onChangeText={setRestaurantType} placeholder="ร้านอาหาร" />
          <FormField label="เบอร์โทรร้าน" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <FormField label="ที่อยู่" value={address} onChangeText={setAddress} multiline />
          <FormField label="เวลาเปิด" value={openTime} onChangeText={setOpenTime} placeholder="10:00" />
          <FormField label="เวลาปิด" value={closeTime} onChangeText={setCloseTime} placeholder="22:00" />
          <FormField label="จำนวนโต๊ะเริ่มต้น" value={tableCount} onChangeText={setTableCount} keyboardType="numeric" />
          {error ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{error}</Text> : null}
          <Pressable disabled={submitting} onPress={submit} style={[layout.primaryButton, submitting && { opacity: 0.7 }]}>
            <Text style={layout.primaryButtonText}>{submitting ? 'กำลังสร้างร้าน' : 'สร้างร้าน'}</Text>
          </Pressable>
        </View> 
      </ScrollView>
    </KeyboardAvoidingView>
  );
}