// S2: la batería de contrato contra la implementación en memoria (corre siempre, sin base ni red).

import { createMemoryPersistence } from "@/persistence/memory";
import { persistenceContract } from "./contract";
import { erpContract } from "./contractErp";
import { filesContract } from "./contractFiles";

persistenceContract("memoria", async (overrides) => createMemoryPersistence(overrides));
erpContract("memoria", async (overrides) => createMemoryPersistence(overrides));
filesContract("memoria", async (overrides) => createMemoryPersistence(overrides));
