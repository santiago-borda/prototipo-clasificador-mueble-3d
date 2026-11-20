// S2: la batería de contrato contra la implementación en memoria (corre siempre, sin base ni red).

import { createMemoryPersistence } from "@/persistence/memory";
import { persistenceContract } from "./contract";
import { embebidoContract } from "./contractEmbebido";

persistenceContract("memoria", async (overrides) => createMemoryPersistence(overrides));
embebidoContract("memoria", async (overrides) => createMemoryPersistence(overrides));
