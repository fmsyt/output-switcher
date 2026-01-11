import type { ReactNode } from 'react';

export type DraggingContextValues = {
  addIgnoreDragTarget: (target: HTMLElement) => void;
  removeIgnoreDragTarget: (target: HTMLElement) => void;
}

export type DraggingProviderProps = {
  Component?: ReactNode;
  children: ReactNode;
}
