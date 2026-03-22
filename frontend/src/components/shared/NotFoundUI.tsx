"use client";

import Link from 'next/link';

export default function NotFoundUI() {
  return (
    <div className="min-h-screen flex items-center justify-center relative bg-white dark:bg-gray-950 overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-500/20 rounded-full blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-purple-500/20 rounded-full blur-[100px] animate-pulse delay-700"></div>

      <div className="container px-4 text-center relative z-10">
        <div className="relative inline-block mb-8">
          {/* Glowing 404 text */}
          <h1 className="text-[12rem] sm:text-[18rem] font-black leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-blue-600 via-indigo-600 to-purple-700 dark:from-white dark:to-gray-800 drop-shadow-2xl">
            404
          </h1>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full flex items-center justify-center opacity-10 pointer-events-none">
            <span className="text-[14rem] sm:text-[22rem] font-bold blur-3xl text-blue-500">404</span>
          </div>
        </div>

        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white transition-opacity duration-300">
            อุ๊ปส์! ไม่พบหน้าที่คุณต้องการ 🔍
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 font-medium leading-relaxed">
            หน้าที่คุณกำลังค้นหาอาจจะถูกย้าย เปลี่ยนชื่อ หรือคุณอาจไม่มีสิทธิ์เข้าถึงในส่วนนี้
            ไม่ต้องกังวลไปครับ! ลองกลับไปจุดเริ่มต้นกันใหม่ดีกว่า
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link 
              href="/home" 
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 transform hover:-translate-y-1 active:scale-95 w-full sm:w-auto"
            >
              กลับสู่หน้าหลัก
            </Link>
            <button 
              onClick={() => window.history.back()}
              className="px-8 py-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-300 transform hover:-translate-y-1 active:scale-95 w-full sm:w-auto cursor-pointer"
            >
              ย้อนกลับไปก่อนหน้า
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-20 pt-8 border-t border-gray-100 dark:border-gray-800 max-w-xs mx-auto">
          <p className="text-sm text-gray-400 dark:text-gray-600">
            &copy; {new Date().getFullYear()} ProjectHub. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
