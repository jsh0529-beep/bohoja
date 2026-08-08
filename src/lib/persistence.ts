import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { db, type Store } from "@/lib/domain";

type PersistedStore = Omit<Store, "sessions"> & { sessions: Array<[string, string]> };
type PersistenceGlobal = typeof globalThis & {
  __guardianPrisma?: PrismaClient;
  __guardianHydrated?: boolean;
  __guardianPersistQueue?: Promise<void>;
};

const state = globalThis as PersistenceGlobal;
const prisma = state.__guardianPrisma ??= new PrismaClient();

function snapshot(): PersistedStore {
  return { ...db, sessions: [...db.sessions.entries()] };
}

export async function hydrateStore() {
  if (state.__guardianHydrated) return;
  let migrated = false;
  const saved = await prisma.runtimeState.findUnique({ where: { id: "default" } });
  if (saved) {
    const restored = saved.payload as unknown as PersistedStore;
    for (const key of Object.keys(db) as Array<keyof Store>) {
      if (key === "sessions") continue;
      const value = restored[key];
      if (Array.isArray(value)) (db[key] as unknown[]).splice(0, (db[key] as unknown[]).length, ...value);
    }
    db.sessions.clear();
    for (const [token, userId] of restored.sessions ?? []) db.sessions.set(token, userId);
    for (const user of db.users) {
      if (!user.password.startsWith("$2")) { user.password = hashSync(user.password, 10); migrated = true; }
    }
  }
  state.__guardianHydrated = true;
  if (migrated) await persistStore();
}

export async function persistStore() {
  const payload = JSON.parse(JSON.stringify(snapshot()));
  const next = (state.__guardianPersistQueue ?? Promise.resolve()).then(async () => {
    await prisma.runtimeState.upsert({
      where: { id: "default" },
      create: { id: "default", payload },
      update: { payload },
    });
  });
  state.__guardianPersistQueue = next.catch(() => undefined);
  await next;
}
