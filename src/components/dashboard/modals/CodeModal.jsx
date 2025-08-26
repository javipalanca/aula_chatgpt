
import React from 'react';
import { Button } from '../../ui';

export function CodeModal({ show, onClose, code }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-xl p-8 max-w-4xl w-full text-center">
        <h3 className="text-2xl font-bold mb-4">Código de clase</h3>
        <div className="text-6xl font-mono font-bold mb-6">{code}</div>
        <div className="flex justify-center">
          <Button onClick={onClose} variant="ghost">Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
