import axios from "axios";

export function apiErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return "";
  return String(error.response?.data?.error ?? "");
}

export function apiErrorCode(error: unknown) {
  if (!axios.isAxiosError(error)) return undefined;
  const code = error.response?.data?.code;
  return typeof code === "string" ? code : undefined;
}
