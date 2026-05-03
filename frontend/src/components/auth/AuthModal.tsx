"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "../../types/auth";
import { googleLogin, login, register, getRoles } from "../../lib/auth";
import { authRepository } from "../../app/repositories/authRepository";

type GoogleCredentialResponse = {
    credential?: string;
};

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (options: {
                        client_id: string;
                        callback: (response: GoogleCredentialResponse) => void;
                    }) => void;
                    renderButton: (
                        parent: HTMLElement,
                        options: {
                            type?: "standard" | "icon";
                            theme?: "outline" | "filled_blue" | "filled_black";
                            size?: "large" | "medium" | "small";
                            text?: "signin_with" | "signup_with" | "continue_with" | "signin";
                            shape?: "rectangular" | "pill" | "circle" | "square";
                            width?: number;
                        }
                    ) => void;
                };
            };
        };
    }
}

// ── icons ───────────────────────────────────────────────────────────────────
const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
);
const EyeSlashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
);
const ClearIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);

// ── role API shape (loose: backend may return Role/role + ID/id) ────────────
type ApiRole = {
    ID?: number;
    id?: number;
    Role?: string;
    role?: string;
};

// ── reusable input ──────────────────────────────────────────────────────────
interface InputFieldProps {
    id: string;
    name?: string;
    label: string;
    type?: string;
    value: string | undefined;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    required?: boolean;
    onClear?: () => void;
    showPasswordToggle?: boolean;
    isPasswordVisible?: boolean;
    onTogglePassword?: () => void;
}

const InputField = ({
    id, name, label, type = "text", value = "", onChange, placeholder, required,
    onClear, showPasswordToggle, isPasswordVisible, onTogglePassword,
}: InputFieldProps) => {
    const isPasswordType = type === "password";
    const actualType = isPasswordType && isPasswordVisible ? "text" : type;

    let prClass = "pr-3";
    if (showPasswordToggle && onClear) prClass = "pr-16";
    else if (showPasswordToggle) prClass = "pr-9";
    else if (onClear) prClass = "pr-9";

    return (
        <div>
            <label htmlFor={id} className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {label}
            </label>
            <div className="relative">
                <input
                    type={actualType} id={id} name={name || id} value={value} onChange={onChange}
                    placeholder={placeholder} required={required}
                    className={`w-full pl-3 ${prClass} h-9 text-[13px] border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 outline-none transition-colors`}
                />

                {value.length > 0 && onClear && (
                    <button
                        type="button" onClick={onClear} title="ล้างข้อความ" tabIndex={-1}
                        aria-label="ล้างข้อความ"
                        className={`absolute ${showPasswordToggle ? "right-8" : "right-2"} top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors`}
                    >
                        <ClearIcon />
                    </button>
                )}

                {showPasswordToggle && (
                    <button
                        type="button" onClick={onTogglePassword}
                        title={isPasswordVisible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} tabIndex={-1}
                        aria-label={isPasswordVisible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                    >
                        {isPasswordVisible ? <EyeSlashIcon /> : <EyeIcon />}
                    </button>
                )}
            </div>
        </div>
    );
};

// ── role label mapping (restaurant context) ─────────────────────────────────
function mapRoleLabel(raw: string): string {
    const k = raw.toLowerCase();
    if (k.includes("admin")) return "เจ้าของร้าน / ผู้จัดการ";
    if (k.includes("teacher") || k.includes("manager")) return "ผู้จัดการ";
    if (k.includes("student") || k.includes("staff") || k.includes("employee")) return "พนักงาน";
    return raw;
}

// ── brand block ─────────────────────────────────────────────────────────────
function BrandLine() {
    return (
        <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/>
                    <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3"/><path d="M21 15v7"/>
                </svg>
            </div>
            <div className="leading-none">
                <p className="text-[9px] font-semibold tracking-[0.18em] uppercase text-gray-400 dark:text-gray-500">Restaurant</p>
                <p className="text-[13px] font-black tracking-tight text-gray-900 dark:text-white mt-0.5">HUB</p>
            </div>
        </div>
    );
}

// ── main modal ──────────────────────────────────────────────────────────────
export interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialMode?: "login" | "register";
    onAuthenticated?: (user?: User) => void;
}

export default function AuthModal({ isOpen, onClose, initialMode = "login", onAuthenticated }: AuthModalProps) {
    const [authMode, setAuthMode] = useState<"login" | "register">(initialMode);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const googleButtonRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
    const [rolesList, setRolesList] = useState<{ id: number; label: string }[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        setAuthMode(initialMode);
        setError("");

        getRoles().then(res => {
            if (res?.data?.data) {
                const apiRoles = (res.data.data as ApiRole[]).map(r => ({
                    id: (r.ID ?? r.id) as number,
                    label: mapRoleLabel(r.Role || r.role || ""),
                }));
                setRolesList(apiRoles);
            }
        });
    }, [isOpen, initialMode]);

    // login state
    const [loginEmail, setLoginEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showLoginPassword, setShowLoginPassword] = useState(false);

    // register state — password fields are local only
    const [registerForm, setRegisterForm] = useState<Partial<User> & { password?: string; confirmPassword?: string; role_id?: number }>({
        first_name: "", last_name: "", email: "",
        password: "", confirmPassword: "", role_id: 3,
    });
    const [showRegisterPw, setShowRegisterPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);

    const handleRegisterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const val = e.target.name === "role_id" ? parseInt(e.target.value, 10) : e.target.value;
        setRegisterForm(prev => ({ ...prev, [e.target.name]: val }));
    };
    const clearRegisterField = (field: keyof typeof registerForm) => {
        setRegisterForm(prev => ({ ...prev, [field]: "" }));
    };

    const handleGoogleCredential = useCallback(async (response: GoogleCredentialResponse) => {
        if (!response.credential) {
            setError("ไม่สามารถเข้าสู่ระบบด้วย Google ได้");
            return;
        }

        setLoading(true); setError("");
        try {
            const res = await googleLogin(response.credential);
            if (res && res.data) {
                const token = res.data.token || res.data.access_token;
                const tokenType = res.data.token_type || "Bearer";
                if (token) authRepository.setToken(token, tokenType);
                onAuthenticated?.(res.data.user);
                onClose();
                router.push("/restaurants");
            } else {
                setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
            }
        } catch {
            setError("เข้าสู่ระบบด้วย Google ล้มเหลว กรุณาลองใหม่อีกครั้ง");
        } finally {
            setLoading(false);
        }
    }, [onAuthenticated, onClose, router]);

    useEffect(() => {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!isOpen || authMode !== "login" || !clientId) return;

        let cancelled = false;
        const initializeGoogleButton = () => {
            if (cancelled || !window.google || !googleButtonRef.current) return;

            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: handleGoogleCredential,
            });
            const buttonWidth = Math.min(320, googleButtonRef.current.clientWidth || 320);
            googleButtonRef.current.innerHTML = "";
            window.google.accounts.id.renderButton(googleButtonRef.current, {
                type: "standard",
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "rectangular",
                width: buttonWidth,
            });
        };

        if (window.google) {
            initializeGoogleButton();
        } else {
            const existingScript = document.getElementById("google-identity-services");
            if (existingScript) {
                existingScript.addEventListener("load", initializeGoogleButton, { once: true });
            } else {
                const script = document.createElement("script");
                script.id = "google-identity-services";
                script.src = "https://accounts.google.com/gsi/client";
                script.async = true;
                script.defer = true;
                script.onload = initializeGoogleButton;
                document.head.appendChild(script);
            }
        }

        return () => {
            cancelled = true;
        };
    }, [authMode, handleGoogleCredential, isOpen]);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError("");
        try {
            if (loginEmail && password) {
                const res = await login(loginEmail, password);
                if (res && res.data) {
                    const token = res.data.token || res.data.access_token;
                    const tokenType = res.data.token_type || "Bearer";
                    if (token) authRepository.setToken(token, tokenType);
                    onAuthenticated?.(res.data.user);
                    onClose();
                    router.push("/restaurants");
                } else {
                    setError("ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
                }
            } else setError("กรุณากรอกอีเมลและรหัสผ่าน");
        } catch {
            setError("เข้าสู่ระบบล้มเหลว กรุณาลองใหม่อีกครั้ง");
        } finally {
            setLoading(false);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError("");

        if (registerForm.password !== registerForm.confirmPassword) {
            setError("รหัสผ่านไม่ตรงกัน"); setLoading(false);
            return;
        }
        try {
            if (!registerForm.email || !registerForm.password || !registerForm.first_name || !registerForm.last_name) {
                setError("กรุณากรอกข้อมูลสำคัญให้ครบถ้วน");
                setLoading(false);
                return;
            }
            const userData = { ...registerForm };
            delete userData.confirmPassword;
            userData.role_id = userData.role_id || 3;

            const res = await register(userData as unknown as Omit<User, "password">);
            if (res) {
                const loginRes = await login(registerForm.email!, registerForm.password!);
                if (loginRes && loginRes.data) {
                    const token = loginRes.data.token || loginRes.data.access_token;
                    const tokenType = loginRes.data.token_type || "Bearer";
                    if (token) authRepository.setToken(token, tokenType);
                    onAuthenticated?.(loginRes.data.user);
                    onClose();
                    window.location.href = "/restaurants";
                } else {
                    setAuthMode("login");
                    setLoginEmail(registerForm.email || "");
                    setPassword("");
                }
            } else {
                setError("การสมัครสมาชิกล้มเหลว (อีเมลนี้อาจซ้ำในระบบ)");
            }
        } catch {
            setError("การสมัครสมาชิกล้มเหลว กรุณาลองใหม่อีกครั้ง");
        } finally {
            setLoading(false);
        }
    };

    const toggleAuthMode = () => {
        setAuthMode(prev => (prev === "login" ? "register" : "login"));
        setError("");
        setShowLoginPassword(false); setShowRegisterPw(false); setShowConfirmPw(false);
    };

    const isLogin = authMode === "login";
    const selectedRole = rolesList.find(r => r.id === registerForm.role_id);

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
                isOpen ? "opacity-100 visible bg-black/40 backdrop-blur-sm" : "opacity-0 invisible bg-black/0"
            }`}
        >
            <div
                className={`w-full bg-white dark:bg-gray-950 rounded-md shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden transition-[opacity,transform] duration-200 ${
                    isLogin ? "max-w-sm" : "max-w-lg"
                } ${isOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
            >

                {/* ── header ─────────────────────────────────────────────────── */}
                <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <BrandLine />
                        <h2 className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-white tracking-tight">
                            {isLogin ? "เข้าสู่ระบบร้าน" : "สร้างบัญชีพนักงาน"}
                        </h2>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {isLogin
                                ? "เข้าใช้งานแผงควบคุมร้านและออเดอร์"
                                : "เพิ่มบัญชีสำหรับทีมหน้าร้านหรือหลังครัว"}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="ปิดหน้าต่าง"
                        className="p-1.5 -mr-1.5 -mt-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── form ───────────────────────────────────────────────────── */}
                <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
                    {isLogin ? (
                        <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                            <InputField
                                id="login-email" label="อีเมล"
                                type="email" placeholder="example@email.com" required
                                value={loginEmail}
                                onChange={e => setLoginEmail(e.target.value)}
                                onClear={() => setLoginEmail("")}
                            />
                            <InputField
                                id="login-password" label="รหัสผ่าน"
                                type="password" placeholder="••••••••" required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                onClear={() => setPassword("")}
                                showPasswordToggle isPasswordVisible={showLoginPassword}
                                onTogglePassword={() => setShowLoginPassword(p => !p)}
                            />

                            {error && <ErrorBox message={error} />}

                            <button
                                type="submit" disabled={loading}
                                className="w-full h-10 mt-1 text-[13px] font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-md hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                            </button>

                            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                                <>
                                    <div className="flex items-center gap-3 py-0.5">
                                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                                        <span className="text-[11px] text-gray-400 dark:text-gray-500">หรือ</span>
                                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                                    </div>
                                    <div className="flex justify-center min-h-10" ref={googleButtonRef} />
                                </>
                            )}
                        </form>
                    ) : (
                        <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                            {/* role */}
                            <div className="relative">
                                <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    ตำแหน่ง
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setIsRoleDropdownOpen(o => !o)}
                                    className={`w-full px-3 h-9 flex items-center justify-between border rounded-md bg-white dark:bg-gray-900 text-[13px] text-gray-900 dark:text-white transition-colors outline-none ${
                                        isRoleDropdownOpen
                                            ? "border-orange-500 ring-2 ring-orange-500/15"
                                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                    }`}
                                >
                                    <span className="truncate">{selectedRole?.label ?? "เลือกตำแหน่ง"}</span>
                                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isRoleDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {isRoleDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsRoleDropdownOpen(false)} />
                                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg overflow-hidden">
                                            {rolesList.map(role => {
                                                const active = registerForm.role_id === role.id;
                                                return (
                                                    <button
                                                        key={role.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setRegisterForm(prev => ({ ...prev, role_id: role.id }));
                                                            setIsRoleDropdownOpen(false);
                                                        }}
                                                        className={`w-full px-3 py-2 flex items-center justify-between text-left text-[13px] transition-colors ${
                                                            active
                                                                ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-medium"
                                                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                                        }`}
                                                    >
                                                        <span>{role.label}</span>
                                                        {active && (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <InputField
                                    id="firstName" name="first_name" label="ชื่อ" placeholder="ชื่อ" required
                                    value={registerForm.first_name}
                                    onChange={handleRegisterChange}
                                    onClear={() => clearRegisterField("first_name")}
                                />
                                <InputField
                                    id="lastName" name="last_name" label="นามสกุล" placeholder="นามสกุล" required
                                    value={registerForm.last_name}
                                    onChange={handleRegisterChange}
                                    onClear={() => clearRegisterField("last_name")}
                                />
                            </div>

                            <InputField
                                id="register-email" name="email" label="อีเมล"
                                type="email" placeholder="example@email.com" required
                                value={registerForm.email}
                                onChange={handleRegisterChange}
                                onClear={() => clearRegisterField("email")}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <InputField
                                    id="register-password" name="password" label="รหัสผ่าน"
                                    type="password" placeholder="••••••••" required
                                    value={registerForm.password}
                                    onChange={handleRegisterChange}
                                    onClear={() => clearRegisterField("password")}
                                    showPasswordToggle isPasswordVisible={showRegisterPw}
                                    onTogglePassword={() => setShowRegisterPw(p => !p)}
                                />
                                <InputField
                                    id="confirmPassword" name="confirmPassword" label="ยืนยันรหัสผ่าน"
                                    type="password" placeholder="••••••••" required
                                    value={registerForm.confirmPassword}
                                    onChange={handleRegisterChange}
                                    onClear={() => clearRegisterField("confirmPassword")}
                                    showPasswordToggle isPasswordVisible={showConfirmPw}
                                    onTogglePassword={() => setShowConfirmPw(p => !p)}
                                />
                            </div>

                            {error && <ErrorBox message={error} />}

                            <button
                                type="submit" disabled={loading}
                                className="w-full h-10 mt-1 text-[13px] font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-md hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {loading ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}
                            </button>
                        </form>
                    )}
                </div>

                {/* ── footer toggle ──────────────────────────────────────────── */}
                <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-slate-50/60 dark:bg-gray-900/40 text-center">
                    <p className="text-[12px] text-gray-600 dark:text-gray-400">
                        {isLogin ? "ยังไม่มีบัญชี?" : "มีบัญชีอยู่แล้ว?"}{" "}
                        <button
                            onClick={toggleAuthMode}
                            type="button"
                            className="font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
                        >
                            {isLogin ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── error box ───────────────────────────────────────────────────────────────
function ErrorBox({ message }: { message: string }) {
    return (
        <div className="flex items-start gap-2 px-3 py-2 text-[12px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-md">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 mt-px">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{message}</span>
        </div>
    );
}
