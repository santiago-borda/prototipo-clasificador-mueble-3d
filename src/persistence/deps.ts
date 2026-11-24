// S2: lo que las implementaciones no deciden solas (ids, QR, reloj). Las pruebas lo reemplazan.

import type { PersistenceDeps } from "./ports";
import { newQrId } from "./qrId";

export const defaultDeps: PersistenceDeps = {
  newId: () => crypto.randomUUID(),
  newQrId,
  now: () => new Date(),
};
