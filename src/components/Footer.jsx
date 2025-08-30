import React from "react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 mt-8">
      <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-600 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
        <span>
          Hecho con <span className="text-rose-600">❤</span> para aprender IA
          responsable.
        </span>
        <span className="opacity-60">
          Consejo: si usas esta app en clase, proyecta y trabajad por parejas.
        </span>
      </div>
    </footer>
  );
}
