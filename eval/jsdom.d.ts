// Declaración mínima de lo que eval/dom.ts usa de jsdom. El repo no tiene @types/jsdom y T5 no suma
// dependencias (docs/spec-t5-runner-eval.md §1, R5). Si se usa otra parte de jsdom, se declara acá.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Window & typeof globalThis;
  }
}
