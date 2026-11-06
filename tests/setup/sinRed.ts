// La suite no usa red (docs/spec-fixture-sintetico.md §1 y TS-10): cualquier fetch falla y queda contado.
// TS-10 verifica el contador; una llamada en cualquier otra prueba la hace fallar con este mensaje.

const counter = { calls: 0 };
(globalThis as { __llamadasDeRed?: typeof counter }).__llamadasDeRed = counter;

globalThis.fetch = (async (input: unknown) => {
  counter.calls += 1;
  throw new Error(`La suite no usa red: fetch(${String(input)}) bloqueado (tests/setup/sinRed.ts).`);
}) as typeof fetch;
