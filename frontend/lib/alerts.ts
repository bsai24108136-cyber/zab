"use client";
import Swal, { SweetAlertIcon, SweetAlertResult } from "sweetalert2";

const themed = Swal.mixin({
  background: "rgba(17, 16, 42, 0.92)",
  color: "#E6E6F0",
  iconColor: "#22D3EE",
  buttonsStyling: false,
  customClass: {
    popup:        "mt-swal",
    title:        "mt-swal-title",
    htmlContainer:"mt-swal-text",
    confirmButton:"mt-swal-confirm",
    cancelButton: "mt-swal-cancel",
  },
});

const toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  background: "rgba(17, 16, 42, 0.95)",
  color: "#E6E6F0",
  customClass: { popup: "mt-swal" },
  didOpen: (el) => {
    el.addEventListener("mouseenter", Swal.stopTimer);
    el.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

export const toastSuccess = (title: string, text?: string) =>
  toast.fire({ icon: "success", iconColor: "#34D399", title, text });

export const toastError = (title: string, text?: string) =>
  toast.fire({ icon: "error", iconColor: "#FB7185", title, text });

export const toastInfo = (title: string, text?: string) =>
  toast.fire({ icon: "info", iconColor: "#22D3EE", title, text });

export const toastWarn = (title: string, text?: string) =>
  toast.fire({ icon: "warning", iconColor: "#FBBF24", title, text });

export const alertSuccess = (title: string, text?: string) =>
  themed.fire({ icon: "success", iconColor: "#34D399", title, text });

export const alertError = (title: string, text?: string) =>
  themed.fire({ icon: "error", iconColor: "#FB7185", title, text });

export function alertConfirm(opts: {
  title: string;
  text?: string;
  icon?: SweetAlertIcon;
  confirmText?: string;
  cancelText?: string;
}): Promise<SweetAlertResult> {
  return themed.fire({
    icon: opts.icon ?? "question",
    title: opts.title,
    text: opts.text,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? "Yes, continue",
    cancelButtonText:  opts.cancelText  ?? "Cancel",
    reverseButtons: true,
    focusCancel: true,
  });
}

export const Alerts = { toastSuccess, toastError, toastInfo, toastWarn, alertSuccess, alertError, alertConfirm };
export default Alerts;
