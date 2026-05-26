import { useRef, type PointerEventHandler } from "react";

type BackdropCloseHandlers = {
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
};

export function useBackdropClose(onClose: () => void): BackdropCloseHandlers {
  const startedOnBackdrop = useRef(false);

  return {
    onPointerDown: (event) => {
      startedOnBackdrop.current = event.target === event.currentTarget;
    },
    onPointerUp: (event) => {
      if (startedOnBackdrop.current && event.target === event.currentTarget) {
        onClose();
      }
      startedOnBackdrop.current = false;
    },
    onPointerCancel: () => {
      startedOnBackdrop.current = false;
    },
  };
}
