"use client";

import { useAuth } from "@/src/providers/AuthProvider";
import Link from "next/link";

export default function Home() {
  const { user, loading, openLoginModal } = useAuth();

  // Handle loading state to avoid UI jumping
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50/50 dark:bg-gray-950">
        <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Dashboard context - visible to everyone
  const stats = [
    { label: "โครงงานทั้งหมด", value: "12", color: "blue" },
    { label: "งานที่กำลังทำ", value: "5", color: "indigo" },
    { label: "สมาชิกในทีม", value: "24", color: "purple" },
    { label: "ความสำเร็จ", value: "85%", color: "teal" },
  ];

  // Helper for conditional greeting
  const getGreeting = () => {
    if (user) return `ยินดีต้อนรับกลับมา, ${user.first_name}`;
    return "ยินดีต้อนรับสู่ระบบจัดการโครงงาน";
  };

  // Helper for role badge
  const getRoleLabel = () => {
    if (user && user.role) return user.role.role;
    return "ผู้เยี่ยมชม (Guest)";
  };

  return (
    <div className="h-full bg-gray-50/50 dark:bg-gray-950 flex flex-col items-center p-6 md:px-12 md:py-8 lg:py-10 relative overflow-hidden font-sans">
      {/* Background Decorative Blurs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-200/20 dark:bg-blue-900/10 rounded-full blur-[100px] -z-10 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-200/20 dark:bg-purple-900/10 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

      <div className="w-full max-w-7xl mx-auto flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-hidden px-2">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100 dark:border-gray-800/50 mb-8 shrink-0">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
              {getGreeting()}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">
              วันที่ {new Date().toLocaleDateString('th-TH', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
             <span className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold text-sm border border-blue-100 dark:border-blue-800/50 uppercase tracking-widest shadow-sm">
              {getRoleLabel()}
            </span>
          </div>
        </header>

        {/* Dash Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-8 pb-6 custom-scrollbar">
          {!user && (
            <div className="p-4 bg-blue-600 rounded-2xl text-white shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500">
               <div>
                 <p className="font-bold text-lg">เริ่มต้นจัดการโครงงานของคุณวันนี้</p>
                 <p className="text-sm text-blue-100 opacity-90">ล็อกอินเพื่อเข้าถึงฟีเจอร์การติดตามงานและทีมงานของคุณ</p>
               </div>
               <button 
                onClick={openLoginModal}
                className="px-6 py-2.5 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors shadow-sm whitespace-nowrap cursor-pointer"
               >
                 เข้าสู่ระบบตอนนี้
               </button>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
            {stats.map((stat, i) => (
              <div key={i} className="p-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-24 h-24 bg-${stat.color}-500/5 -mr-8 -mt-8 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500`}></div>
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white">{stat.value}</h3>
              </div>
            ))}
          </div>

          {/* Main Dashboard Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Recent Projects / Tasks */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">โครงงานที่ติดตามล่าสุด</h2>
                <button className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">ดูทั้งหมด</button>
              </div>
              <div className="grid gap-4">
                {[1, 2].map((_, i) => (
                  <div key={i} className="group p-5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-2xl hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all shadow-sm hover:shadow-md flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-gray-900 flex items-center justify-center shadow-inner group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                        <svg className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Example Project Tracking</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">อัปเดตเมื่อ 2 ชั่วโมงที่แล้ว</p>
                      </div>
                    </div>
                    <div className="flex -space-x-2">
                       <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-950 bg-gray-200 dark:bg-gray-800 text-[10px] flex items-center justify-center font-bold">U1</div>
                       <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-950 bg-gray-300 dark:bg-gray-700 text-[10px] flex items-center justify-center font-bold">U2</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions / Activity Sidebar */}
            <div className="space-y-6">
              <div className="p-6 bg-gradient-to-br from-gray-900 to-blue-950 rounded-3xl text-white shadow-xl shadow-blue-900/10">
                <h3 className="text-lg font-bold mb-4 border-b border-white/10 pb-2">ดำเนินการด่วน</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                  onClick={openLoginModal}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all text-center border border-white/5 flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                    สร้างโครงงาน
                  </button>
                  <button 
                  onClick={openLoginModal}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all text-center border border-white/5 flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    นัดหมาย
                  </button>
                </div>
              </div>

              <div className="p-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">กิจกรรมล่าสุด</h3>
                <div className="space-y-4">
                  {[
                    { user: "Mana", action: "แก้ไขงานล่าสุด", time: "18 นาทีที่แล้ว" },
                    { user: "Somchai", action: "อัปโหลดไฟล์ใหม่", time: "5 นาทีที่แล้ว" },
                  ].map((act, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                      <div>
                        <p className="text-gray-700 dark:text-gray-300">
                          <span className="font-bold text-gray-900 dark:text-white">{act.user}</span> {act.action}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{act.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
