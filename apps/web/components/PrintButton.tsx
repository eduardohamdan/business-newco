"use client";
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
      Imprimir / salvar PDF
    </button>
  );
}
