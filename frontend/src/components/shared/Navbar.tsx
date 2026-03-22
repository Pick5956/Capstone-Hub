'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../providers/AuthProvider';

export default function Navbar() {
  const { user, loading, openLoginModal, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ปิด dropdown เมื่อคลิกที่อื่น
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-100 dark:border-gray-800 bg-white/70 dark:bg-gray-950/70 backdrop-blur-xl shadow-sm transition-all duration-300">
      <div className="w-full px-6 sm:px-10 lg:px-14 h-16 flex items-center justify-between">
        {/* Logo / Brand */}
        <Link href="/home" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all duration-300 transform group-hover:-translate-y-0.5">
            <span className="text-lg">P</span>
          </div>
          <span className="text-xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
            ProjectHub
          </span>
        </Link>

        {/* Auth Section */}
        <div className="flex items-center gap-4">
          {loading ? (
             <div className="w-24 h-9 bg-gray-200/50 dark:bg-gray-800/50 rounded-full animate-pulse"></div>
          ) : user ? (
            <div className="flex items-center gap-3 sm:gap-5" ref={dropdownRef}>
              <div className="flex flex-col text-right hidden lg:flex">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                  {user.first_name} {user.last_name}
                </span>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider">
                  {user.role?.role || 'Member'}
                </span>
              </div>
              
              <div className="relative">
                {/* Avatar Button */}
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="relative group cursor-pointer focus:outline-none"
                  aria-haspopup="true"
                  aria-expanded={isDropdownOpen}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border-2 border-white dark:border-gray-700 shadow-sm text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold text-lg ring-2 ring-transparent group-hover:ring-blue-500/30 transition-all duration-300">
                    {user.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  {/* Subtle online indicator */}
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full"></div>
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-200">
                    {/* ข้อมูลเบื้องต้นแบบแสดงเฉพาะในมือถือหรือจอเล็ก */}
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {user.email || 'user@example.com'}
                      </p>
                    </div>

                    <div className="p-2 space-y-1">
                      <Link 
                        href="/profile" 
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors group"
                      >
                        <svg className="w-4 h-4 mr-3 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        โปรไฟล์ของคุณ
                      </Link>
                      
                      <Link 
                        href="/settings" 
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors group"
                      >
                        <svg className="w-4 h-4 mr-3 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        การตั้งค่า
                      </Link>

                      <div className="h-px bg-gray-100 dark:bg-gray-800 my-2"></div>

                      <button 
                        onClick={() => {
                          setIsDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors group"
                      >
                        <svg className="w-4 h-4 mr-3 text-red-500 group-hover:text-red-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        ออกจากระบบ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
             <button 
              onClick={openLoginModal}
              className="px-6 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-full shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 transform hover:-translate-y-0.5"
            >
              เข้าสู่ระบบ
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
