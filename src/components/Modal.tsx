import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  actions: ReactNode;
}

export function Modal({ title, children, actions }: ModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="legacy-modal">
        <div className="legacy-modal-title">{title}</div>
        <div className="legacy-modal-body">{children}</div>
        <div className="legacy-modal-actions">{actions}</div>
      </div>
    </div>
  );
}
