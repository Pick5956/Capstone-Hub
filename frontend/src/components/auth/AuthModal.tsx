"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "../../types/auth";
import { Membership } from "../../types/restaurant";
import { googleLogin, login, register, LoginResponse } from "../../lib/auth";
import { authRepository } from "../../app/repositories/authRepository";
import { restaurantRepository } from "../../app/repositories/restaurantRepository";
import { useLanguage } from "@/src/providers/LanguageProvider";

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

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="h-4 w-4">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
  </svg>
);

const EyeSlashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="h-4 w-4">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
    />
  </svg>
);

const ClearIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

type InputFieldLabels = {
  clear: string;
  hidePassword: string;
  showPassword: string;
};

interface InputFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  onClear?: () => void;
  showPasswordToggle?: boolean;
  isPasswordVisible?: boolean;
  onTogglePassword?: () => void;
  labels: InputFieldLabels;
}

const InputField = ({
  id,
  name,
  label,
  type = "text",
  value = "",
  onChange,
  placeholder,
  required,
  autoComplete,
  onClear,
  showPasswordToggle,
  isPasswordVisible,
  onTogglePassword,
  labels,
}: InputFieldProps) => {
  const isPasswordType = type === "password";
  const actualType = isPasswordType && isPasswordVisible ? "text" : type;

  let prClass = "pr-3";
  if (showPasswordToggle && onClear) prClass = "pr-16";
  else if (showPasswordToggle || onClear) prClass = "pr-9";

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="relative">
        <input
          type={actualType}
          id={id}
          name={name || id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className={`h-9 w-full rounded-md border border-gray-200 bg-white pl-3 ${prClass} text-[13px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white`}
        />

        {value.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            title={labels.clear}
            tabIndex={-1}
            aria-label={labels.clear}
            className={`absolute top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300 ${
              showPasswordToggle ? "right-8" : "right-2"
            }`}
          >
            <ClearIcon />
          </button>
        )}

        {showPasswordToggle && (
          <button
            type="button"
            onClick={onTogglePassword}
            title={isPasswordVisible ? labels.hidePassword : labels.showPassword}
            tabIndex={-1}
            aria-label={isPasswordVisible ? labels.hidePassword : labels.showPassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
          >
            {isPasswordVisible ? <EyeSlashIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
    </div>
  );
};

function BrandLine() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-red-600 shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3" />
          <path d="M21 15v7" />
        </svg>
      </div>
      <div className="leading-none">
        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Restaurant</p>
        <p className="text-[13px] font-black tracking-tight text-gray-900 dark:text-white">HUB</p>
      </div>
    </div>
  );
}

function decideRedirect(memberships: Membership[]): string {
  if (memberships.length === 0) return "/restaurants";
  if (memberships.length === 1) {
    restaurantRepository.setActiveId(memberships[0].restaurant_id);
    return "/home";
  }
  return "/restaurants";
}

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
  onAuthenticated?: (user?: User, memberships?: Membership[]) => void;
}

type RegisterFormState = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = "login",
  onAuthenticated,
}: AuthModalProps) {
  const { language } = useLanguage();
  const [authMode, setAuthMode] = useState<"login" | "register">(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const copy = language === "th"
    ? {
        clear: "ล้างข้อความ",
        hidePassword: "ซ่อนรหัสผ่าน",
        showPassword: "แสดงรหัสผ่าน",
        googleCredentialMissing: "ไม่สามารถเข้าสู่ระบบด้วย Google ได้",
        googleLoginFailed: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ",
        googleLoginRetry: "เข้าสู่ระบบด้วย Google ล้มเหลว กรุณาลองใหม่อีกครั้ง",
        invalidCredentials: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง",
        fillLogin: "กรุณากรอกอีเมลและรหัสผ่าน",
        loginFailed: "เข้าสู่ระบบล้มเหลว กรุณาลองใหม่อีกครั้ง",
        passwordMismatch: "รหัสผ่านไม่ตรงกัน",
        fillRequired: "กรุณากรอกข้อมูลสำคัญให้ครบถ้วน",
        registerFailed: "การสมัครสมาชิกไม่สำเร็จ (อีเมลนี้อาจซ้ำในระบบ)",
        registerRetry: "การสมัครสมาชิกล้มเหลว กรุณาลองใหม่อีกครั้ง",
        loginTitle: "เข้าสู่ระบบร้าน",
        registerTitle: "สร้างบัญชีใหม่",
        loginSubtitle: "เข้าใช้งานแผงควบคุมร้านและออเดอร์",
        registerSubtitle: "สมัครเสร็จเลือกได้ว่าจะสร้างร้านใหม่หรือเข้าร่วมร้านที่มีอยู่",
        close: "ปิดหน้าต่าง",
        email: "อีเมล",
        password: "รหัสผ่าน",
        firstName: "ชื่อ",
        lastName: "นามสกุล",
        confirmPassword: "ยืนยันรหัสผ่าน",
        loginButton: "เข้าสู่ระบบ",
        loginBusy: "กำลังเข้าสู่ระบบ...",
        createAccountButton: "สร้างบัญชี",
        createAccountBusy: "กำลังสร้างบัญชี...",
        or: "หรือ",
        noAccount: "ยังไม่มีบัญชี?",
        haveAccount: "มีบัญชีอยู่แล้ว?",
        switchToRegister: "สร้างบัญชี",
        switchToLogin: "เข้าสู่ระบบ",
      }
    : {
        clear: "Clear text",
        hidePassword: "Hide password",
        showPassword: "Show password",
        googleCredentialMissing: "Google sign-in could not be started.",
        googleLoginFailed: "Google sign-in was not successful.",
        googleLoginRetry: "Google sign-in failed. Please try again.",
        invalidCredentials: "The email or password is incorrect.",
        fillLogin: "Please enter your email and password.",
        loginFailed: "Sign-in failed. Please try again.",
        passwordMismatch: "Passwords do not match.",
        fillRequired: "Please fill in all required information.",
        registerFailed: "Registration was not successful. This email may already exist.",
        registerRetry: "Registration failed. Please try again.",
        loginTitle: "Sign in to your restaurant",
        registerTitle: "Create an account",
        loginSubtitle: "Access the restaurant dashboard and order operations.",
        registerSubtitle: "After signing up, you can create a new restaurant or join an existing one.",
        close: "Close",
        email: "Email",
        password: "Password",
        firstName: "First name",
        lastName: "Last name",
        confirmPassword: "Confirm password",
        loginButton: "Sign in",
        loginBusy: "Signing in...",
        createAccountButton: "Create account",
        createAccountBusy: "Creating account...",
        or: "or",
        noAccount: "Don't have an account?",
        haveAccount: "Already have an account?",
        switchToRegister: "Create one",
        switchToLogin: "Sign in",
      };

  useEffect(() => {
    if (!isOpen) return;
    setAuthMode(initialMode);
    setError("");
  }, [isOpen, initialMode]);

  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showRegisterPw, setShowRegisterPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const handleRegisterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegisterForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const clearRegisterField = (field: keyof RegisterFormState) => {
    setRegisterForm((prev) => ({ ...prev, [field]: "" }));
  };

  const completeAuth = useCallback(
    (data: LoginResponse, hardReload = false) => {
      const tokenType = "Bearer";
      if (data.token) authRepository.setToken(data.token, tokenType);
      onAuthenticated?.(data.user, data.memberships);
      onClose();
      const target = decideRedirect(data.memberships ?? []);
      if (hardReload) {
        window.location.href = target;
      } else {
        router.push(target);
      }
    },
    [onAuthenticated, onClose, router]
  );

  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setError(copy.googleCredentialMissing);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const res = await googleLogin(response.credential);
        if (res?.data) {
          completeAuth(res.data);
        } else {
          setError(copy.googleLoginFailed);
        }
      } catch {
        setError(copy.googleLoginRetry);
      } finally {
        setLoading(false);
      }
    },
    [completeAuth, copy.googleCredentialMissing, copy.googleLoginFailed, copy.googleLoginRetry]
  );

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
    setLoading(true);
    setError("");
    try {
      if (loginEmail && password) {
        const res = await login(loginEmail, password);
        if (res?.data) {
          completeAuth(res.data);
        } else {
          setError(copy.invalidCredentials);
        }
      } else {
        setError(copy.fillLogin);
      }
    } catch {
      setError(copy.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (registerForm.password !== registerForm.confirmPassword) {
      setError(copy.passwordMismatch);
      setLoading(false);
      return;
    }

    try {
      if (!registerForm.email || !registerForm.password || !registerForm.first_name || !registerForm.last_name) {
        setError(copy.fillRequired);
        setLoading(false);
        return;
      }

      const res = await register({
        email: registerForm.email,
        first_name: registerForm.first_name,
        last_name: registerForm.last_name,
        password: registerForm.password,
        phone: "",
        address: "",
        birthday: "",
        profile_image: "",
      });

      if (res) {
        const loginRes = await login(registerForm.email, registerForm.password);
        if (loginRes?.data) {
          completeAuth(loginRes.data, true);
        } else {
          setAuthMode("login");
          setLoginEmail(registerForm.email);
          setPassword("");
        }
      } else {
        setError(copy.registerFailed);
      }
    } catch {
      setError(copy.registerRetry);
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setAuthMode((prev) => (prev === "login" ? "register" : "login"));
    setError("");
    setShowLoginPassword(false);
    setShowRegisterPw(false);
    setShowConfirmPw(false);
  };

  const isLogin = authMode === "login";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        isOpen ? "visible bg-black/40 opacity-100 backdrop-blur-sm" : "invisible bg-black/0 opacity-0"
      }`}
    >
      <div
        className={`w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl transition-[opacity,transform] duration-200 dark:border-gray-800 dark:bg-gray-950 ${
          isLogin ? "max-w-sm" : "max-w-lg"
        } ${isOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 pb-3 pt-4 dark:border-gray-800">
          <div>
            <BrandLine />
            <h2 className="mt-3 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
              {isLogin ? copy.loginTitle : copy.registerTitle}
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {isLogin ? copy.loginSubtitle : copy.registerSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="-mr-1.5 -mt-1 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {isLogin ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <InputField
                id="login-email"
                label={copy.email}
                type="email"
                placeholder="example@email.com"
                required
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                onClear={() => setLoginEmail("")}
                labels={copy}
              />
              <InputField
                id="login-password"
                label={copy.password}
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onClear={() => setPassword("")}
                showPasswordToggle
                isPasswordVisible={showLoginPassword}
                onTogglePassword={() => setShowLoginPassword((prev) => !prev)}
                labels={copy}
              />

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900"
              >
                {loading ? copy.loginBusy : copy.loginButton}
              </button>

              {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                <>
                  <div className="flex items-center gap-3 py-0.5">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{copy.or}</span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                  </div>
                  <div className="flex min-h-10 justify-center" ref={googleButtonRef} />
                </>
              )}
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InputField
                  id="firstName"
                  name="first_name"
                  label={copy.firstName}
                  placeholder={copy.firstName}
                  required
                  autoComplete="given-name"
                  value={registerForm.first_name}
                  onChange={handleRegisterChange}
                  onClear={() => clearRegisterField("first_name")}
                  labels={copy}
                />
                <InputField
                  id="lastName"
                  name="last_name"
                  label={copy.lastName}
                  placeholder={copy.lastName}
                  required
                  autoComplete="family-name"
                  value={registerForm.last_name}
                  onChange={handleRegisterChange}
                  onClear={() => clearRegisterField("last_name")}
                  labels={copy}
                />
              </div>

              <InputField
                id="register-email"
                name="email"
                label={copy.email}
                type="email"
                placeholder="example@email.com"
                required
                autoComplete="email"
                value={registerForm.email}
                onChange={handleRegisterChange}
                onClear={() => clearRegisterField("email")}
                labels={copy}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InputField
                  id="register-password"
                  name="password"
                  label={copy.password}
                  type="password"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  value={registerForm.password}
                  onChange={handleRegisterChange}
                  onClear={() => clearRegisterField("password")}
                  showPasswordToggle
                  isPasswordVisible={showRegisterPw}
                  onTogglePassword={() => setShowRegisterPw((prev) => !prev)}
                  labels={copy}
                />
                <InputField
                  id="confirmPassword"
                  name="confirmPassword"
                  label={copy.confirmPassword}
                  type="password"
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  value={registerForm.confirmPassword}
                  onChange={handleRegisterChange}
                  onClear={() => clearRegisterField("confirmPassword")}
                  showPasswordToggle
                  isPasswordVisible={showConfirmPw}
                  onTogglePassword={() => setShowConfirmPw((prev) => !prev)}
                  labels={copy}
                />
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900"
              >
                {loading ? copy.createAccountBusy : copy.createAccountButton}
              </button>
            </form>
          )}
        </div>

        <div className="bg-slate-50/60 px-5 py-3 text-center dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[12px] text-gray-600 dark:text-gray-400">
            {isLogin ? copy.noAccount : copy.haveAccount}{" "}
            <button
              onClick={toggleAuthMode}
              type="button"
              className="font-semibold text-orange-600 transition-colors hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
            >
              {isLogin ? copy.switchToRegister : copy.switchToLogin}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px h-4 w-4 shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
