export function NewerVersionBanner({ currentVersion }: { currentVersion: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <span aria-hidden className="mt-0.5 text-base leading-none">
        ⚠
      </span>
      <div>
        <p className="font-semibold">Hay una versión más nueva de este diseño</p>
        <p className="text-amber-800">Esta ficha corresponde a la versión {currentVersion}. Verificá antes de cortar o armar.</p>
      </div>
    </div>
  );
}
