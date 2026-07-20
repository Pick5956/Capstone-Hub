import { Text } from 'react-native';

import { AppScreen } from '@/src/components/app-shell';
import { Feedback, SectionHeader, Surface } from '@/src/components/ui';
import { palette, typeScale } from '@/src/theme';

export default function DisplaySettingsScreen() {
  return <AppScreen title="การแสดงผล" subtitle="แอปปรับขนาดตามมือถือและ iPad โดยอัตโนมัติ" topLevel={false}><Surface><SectionHeader title="หน้าจอและการหมุน" detail="มือถือใช้ navigation ด้านล่าง ส่วน iPad ใช้ side rail และรองรับแนวตั้ง/แนวนอน" /><Feedback title="ขนาดตัวอักษรตามอุปกรณ์" detail="Restaurant Hub รองรับการตั้งค่าขนาดตัวอักษรและการซูมจากระบบปฏิบัติการ เพื่อให้ทุกหน้าคงอ่านง่าย" tone="info" /></Surface><Surface><SectionHeader title="ภาษา" /><Text selectable style={[typeScale.body, { color: palette.muted }]}>แอปมือถือใช้ภาษาไทยสำหรับงานหน้าร้านและครัว ส่วนข้อมูลโค้ดและ API ไม่เปลี่ยนตามภาษา</Text></Surface></AppScreen>;
}
