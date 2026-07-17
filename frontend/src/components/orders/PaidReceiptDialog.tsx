"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { groupOrderItems } from "@/src/lib/orderItemGroups";
import type { Bill, OrderItem } from "@/src/types/order";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import { printThermalReceipt } from "@/src/lib/thermalReceiptPrint";
import ThermalReceipt from "@/src/components/orders/ThermalReceipt";
import type { Restaurant } from "@/src/types/restaurant";

function fulfillmentType(item: OrderItem) {
  return item.fulfillment_type === "takeaway" ? "takeaway" : "dine_in";
}

export default function PaidReceiptDialog({
  bill,
  language,
  locationLabel,
  restaurant,
  onClose,
}: {
  bill: Bill;
  language: "th" | "en";
  locationLabel: string;
  restaurant?: Restaurant;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const locale = language === "th" ? "th-TH" : "en-US";
  const payment = bill.payments.at(-1) ?? null;
  const groups = groupOrderItems(bill.items);
  const sections = (["dine_in", "takeaway"] as const)
    .map((key) => ({ key, groups: groups.filter((group) => fulfillmentType(group.firstItem) === key) }))
    .filter((section) => section.groups.length > 0);
  const copy = language === "th"
    ? {
        title: "ใบเสร็จรับเงิน",
        close: "ปิด",
        items: "รายการทั้งหมด",
        dineIn: "ทานที่ร้าน",
        takeaway: "กลับบ้าน",
        subtotal: "ยอดอาหาร",
        discount: "ส่วนลด",
        service: "Service charge",
        vat: "VAT",
        grandTotal: "ยอดสุทธิ",
        payment: "วิธีชำระ",
        cash: "เงินสด",
        qr: "QR PromptPay",
        print: "พิมพ์ใบเสร็จอีกครั้ง",
      }
    : {
        title: "Payment receipt",
        close: "Close",
        items: "All items",
        dineIn: "Dine-in",
        takeaway: "Takeaway",
        subtotal: "Subtotal",
        discount: "Discount",
        service: "Service charge",
        vat: "VAT",
        grandTotal: "Grand total",
        payment: "Payment method",
        cash: "Cash",
        qr: "QR PromptPay",
        print: "Print receipt again",
      };
  const money = (value: number) => `฿${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };
  const backdrop = useBackdropClose(requestClose);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div data-reprint-overlay {...backdrop} className={`${closing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-3 backdrop-blur-sm sm:p-4`}>
      <style jsx global>{`
        @media print {
          #archive-print-receipt { position: static !important; display: block !important; width: 48mm !important; height: auto !important; max-height: none !important; margin: 0 auto !important; padding: 3mm 0 !important; overflow: visible !important; transform: none !important; color: #111827 !important; background: #fff !important; }
          #archive-print-receipt [data-receipt-scroll] { overflow: visible !important; }
          #archive-print-receipt [data-screen-only] { display: none !important; }
          #archive-print-receipt [data-screen-receipt] { display: none !important; }
          #archive-print-receipt [data-print-only] { display: block !important; }
          #archive-print-receipt [data-receipt-item] { border: 0 !important; border-bottom: 1px solid #e5e7eb !important; border-radius: 0 !important; padding: 2mm 0 !important; }
          #archive-print-receipt .dark\\:text-white, #archive-print-receipt .dark\\:text-gray-200, #archive-print-receipt .dark\\:text-gray-300, #archive-print-receipt .dark\\:text-gray-400 { color: #111827 !important; }
          #archive-print-receipt .dark\\:bg-gray-950 { background: #fff !important; }
          #archive-print-receipt .dark\\:border-gray-800 { border-color: #d1d5db !important; }
        }
      `}</style>
      <div data-reprint-dialog role="dialog" aria-modal="true" aria-labelledby="archive-receipt-title" className={`${closing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-gray-200 bg-slate-50 shadow-2xl shadow-black/20 dark:border-gray-800 dark:bg-gray-950 sm:max-h-[calc(100vh-2rem)]`}>
        <div id="archive-print-receipt" className="flex min-h-0 flex-1 flex-col">
          <div data-screen-receipt className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
            <div data-screen-only className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{locationLabel} · {bill.order.order_number}</p>
              <h2 id="archive-receipt-title" className="mt-0.5 text-[16px] font-semibold text-gray-950 dark:text-white">{copy.title}</h2>
            </div>
            <div data-print-only className="hidden">
              <h2 className="text-[16px] font-semibold text-gray-900">{copy.title} #{bill.order.order_number}</h2>
              <p className="mt-0.5 text-[12px] text-gray-600">{locationLabel}</p>
              {payment?.paid_at ? <p className="mt-0.5 text-[11px] text-gray-600">{new Date(payment.paid_at).toLocaleString(locale)}</p> : null}
            </div>
            <button data-screen-only type="button" onClick={requestClose} className="ui-press h-9 shrink-0 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">{copy.close}</button>
          </div>

          <div data-screen-receipt data-receipt-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
            <section className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <h3 className="mb-3 text-[13px] font-semibold text-gray-900 dark:text-white">{copy.items}</h3>
              <div className="space-y-3">
                {sections.map((section) => (
                  <div key={section.key} className="space-y-2">
                    {sections.length > 1 || section.key === "takeaway" || bill.order.order_type === "takeaway" ? <p className="px-1 text-[12px] font-semibold text-gray-700 dark:text-gray-200">{section.key === "takeaway" ? copy.takeaway : copy.dineIn}</p> : null}
                    <div className="space-y-2">
                      {section.groups.map((group) => {
                        const item = group.firstItem;
                        return (
                          <div data-receipt-item key={group.key} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                              <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{item.menu_name}</p>
                                {item.selected_options?.length ? <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(" · ")}</p> : null}
                                {item.note ? <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{item.note}</p> : null}
                              </div>
                              <div className="text-right">
                                <p className="font-mono text-[14px] font-semibold tabular-nums text-gray-900 dark:text-white">{money(group.subtotal)}</p>
                                <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">x{group.quantity}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div data-screen-receipt className="shrink-0 space-y-1.5 border-t border-gray-200 bg-white px-4 py-3 text-[12px] text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 sm:px-5">
            <div className="flex justify-between gap-4"><span>{copy.subtotal}</span><span className="font-mono tabular-nums text-gray-900 dark:text-white">{money(bill.subtotal)}</span></div>
            {bill.discount_amount > 0 ? <div className="flex justify-between gap-4"><span>{copy.discount}</span><span className="font-mono tabular-nums text-gray-900 dark:text-white">-{money(bill.discount_amount)}</span></div> : null}
            <div className="flex justify-between gap-4"><span>{copy.service} {bill.service_charge_enabled ? `${bill.service_charge_rate}%` : ""}</span><span className="font-mono tabular-nums text-gray-900 dark:text-white">{money(bill.service_charge_amount)}</span></div>
            <div className="flex justify-between gap-4"><span>{copy.vat} {bill.vat_enabled ? `${bill.vat_rate}%` : ""}</span><span className="font-mono tabular-nums text-gray-900 dark:text-white">{money(bill.vat_amount)}</span></div>
            <div className="mt-2 flex items-end justify-between gap-4 border-t border-gray-200 pt-2.5 dark:border-gray-800"><span className="text-[13px] font-semibold text-gray-900 dark:text-white">{copy.grandTotal}</span><span className="font-mono text-[20px] font-extrabold tabular-nums text-gray-950 dark:text-white">{money(bill.grand_total)}</span></div>
            {payment ? (
              <div className="mt-2 space-y-1.5 border-t border-dashed border-gray-300 pt-2.5 dark:border-gray-700">
                <div className="flex justify-between gap-4"><span>{copy.payment}</span><span className="font-semibold text-gray-900 dark:text-white">{payment.method === "cash" ? copy.cash : copy.qr}</span></div>
              </div>
            ) : null}
          </div>
          <ThermalReceipt bill={bill} language={language} locationLabel={locationLabel} restaurant={restaurant} />
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <button type="button" onClick={() => printThermalReceipt("archive-print-receipt")} className="ui-press inline-flex h-10 items-center gap-2 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"><Printer className="h-4 w-4" aria-hidden="true" />{copy.print}</button>
        </div>
      </div>
    </div>
  );
}
