import type { Metadata } from "next";
import { QrSheet } from "@/components/QrSheet";
import { listFurniture, listQrEntries } from "@/lib/lookup";

export const metadata: Metadata = {
  title: "QR para escanear — Prototipo",
};

export default function QrPage() {
  const furnitureNames = Object.fromEntries(listFurniture().map((def) => [def.furniture.id, def.furniture.name]));
  return <QrSheet entries={listQrEntries()} furnitureNames={furnitureNames} />;
}
