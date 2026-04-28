import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Client, ClientNote, LinkedProfile } from '../types';
import * as clientService from '../services/clientService';

interface ClientStore {
  clients: Client[];
  linkedProfiles: Record<string, LinkedProfile>;
  isLoading: boolean;
  error: string | null;
  _fetchedAt: number | null;
  fetchClients: (force?: boolean) => Promise<void>;
  getClient: (id: string) => Client | undefined;
  addClient: (client: Omit<Client, 'id' | 'created_at' | 'notes'>) => Promise<Client>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  uploadAvatar: (id: string, file: File) => Promise<void>;
  removeAvatar: (id: string) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addNote: (clientId: string, text: string) => Promise<void>;
  searchClients: (query: string) => Client[];
  findByPsid: (psid: string) => Client | undefined;
  linkPlatform: (clientId: string, platform: 'instagram' | 'messenger', psid: string) => Promise<void>;
  unlinkPlatform: (clientId: string, platform: 'instagram' | 'messenger') => Promise<void>;
}

const FETCH_TTL = 60_000;

export const useClientStore = create<ClientStore>()(persist((set, get) => ({
  clients: [],
  linkedProfiles: {},
  isLoading: false,
  error: null,
  _fetchedAt: null,

  fetchClients: async (force = false) => {
    const fetchedAt = get()._fetchedAt;
    if (!force && fetchedAt && Date.now() - fetchedAt < FETCH_TTL) return;

    // Only show loading spinner if there's no cached data
    if (get().clients.length === 0) set({ isLoading: true });
    set({ error: null });
    try {
      const clients = await clientService.fetchClients();
      const allPsids = clients.flatMap((c) =>
        [c.instagram, c.facebook].filter(Boolean)
      ) as string[];

      // Only fetch profiles we don't already have cached. Saves egress on
      // re-fetches where most profiles haven't changed. After hydration
      // we may have entries without a profilePic (URLs are stripped on
      // persist) — refetch those too so the avatar comes back.
      const existing = get().linkedProfiles;
      const missingPsids = allPsids.filter((p) => !existing[p] || !existing[p].profilePic);
      const newProfiles = missingPsids.length > 0
        ? await clientService.fetchLinkedProfiles(missingPsids)
        : {};
      set({
        clients,
        linkedProfiles: { ...existing, ...newProfiles },
        isLoading: false,
        _fetchedAt: Date.now(),
      });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  getClient: (id) => get().clients.find((c) => c.id === id),

  addClient: async (data) => {
    const tempId = crypto.randomUUID();
    const optimistic: Client = {
      ...data,
      id: tempId,
      created_at: new Date().toISOString(),
      notes: [],
    };
    set((s) => ({ clients: [optimistic, ...s.clients] }));

    try {
      const real = await clientService.createClient(data);
      // Fetch linked profiles for the new client
      const newPsids = [real.instagram, real.facebook].filter(Boolean) as string[];
      const newProfiles = await clientService.fetchLinkedProfiles(newPsids);
      set((s) => ({
        clients: s.clients.map((c) => (c.id === tempId ? real : c)),
        linkedProfiles: { ...s.linkedProfiles, ...newProfiles },
      }));
      return real;
    } catch (e) {
      set((s) => ({ clients: s.clients.filter((c) => c.id !== tempId) }));
      throw e;
    }
  },

  updateClient: async (id, data) => {
    const prev = get().clients.find((c) => c.id === id);
    set((s) => ({
      clients: s.clients.map((c) => (c.id === id ? { ...c, ...data } : c)),
    }));

    try {
      await clientService.updateClient(id, data);
    } catch (e) {
      if (prev) {
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? prev : c)),
        }));
      }
      throw e;
    }
  },

  uploadAvatar: async (id, file) => {
    const prev = get().clients.find((c) => c.id === id);
    try {
      const { path, signedUrl } = await clientService.uploadClientAvatar(id, file);
      await clientService.updateClient(id, { profile_pic: path });
      // Store the signed URL (not the path) so <img src> renders immediately.
      // On next fetchClients the path is re-resolved to a fresh signed URL.
      set((s) => ({
        clients: s.clients.map((c) => (c.id === id ? { ...c, profile_pic: signedUrl } : c)),
      }));
    } catch (e) {
      if (prev) {
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? prev : c)),
        }));
      }
      throw e;
    }
  },

  removeAvatar: async (id) => {
    const prev = get().clients.find((c) => c.id === id);
    set((s) => ({
      clients: s.clients.map((c) => (c.id === id ? { ...c, profile_pic: undefined } : c)),
    }));

    try {
      await clientService.deleteClientAvatar(id);
      // Cast null through unknown to satisfy Partial<Client>; updateClient
      // service maps the !== undefined guard then `?? null` to NULL the column.
      await clientService.updateClient(id, { profile_pic: null as unknown as undefined });
    } catch (e) {
      if (prev) {
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? prev : c)),
        }));
      }
      throw e;
    }
  },

  deleteClient: async (id) => {
    const prev = get().clients.find((c) => c.id === id);
    set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));

    try {
      await clientService.deleteClient(id);
    } catch (e) {
      if (prev) {
        set((s) => ({ clients: [...s.clients, prev] }));
      }
      throw e;
    }
  },

  addNote: async (clientId, text) => {
    const client = get().clients.find((c) => c.id === clientId);
    if (!client) return;

    const note: ClientNote = { ts: new Date().toISOString(), text };
    const newNotes = [note, ...client.notes];

    set((s) => ({
      clients: s.clients.map((c) =>
        c.id === clientId ? { ...c, notes: newNotes } : c
      ),
    }));

    try {
      await clientService.updateClientNotes(clientId, newNotes);
    } catch (e) {
      set((s) => ({
        clients: s.clients.map((c) =>
          c.id === clientId ? { ...c, notes: client.notes } : c
        ),
      }));
      throw e;
    }
  },

  findByPsid: (psid) =>
    get().clients.find((c) => c.instagram === psid || c.facebook === psid),

  linkPlatform: async (clientId, platform, psid) => {
    const field = platform === 'instagram' ? 'instagram' : 'facebook';
    set((s) => ({
      clients: s.clients.map((c) =>
        c.id === clientId ? { ...c, [field]: psid } : c
      ),
    }));
    try {
      await clientService.updateClient(clientId, { [field]: psid });
      const profiles = await clientService.fetchLinkedProfiles([psid]);
      set((s) => ({ linkedProfiles: { ...s.linkedProfiles, ...profiles } }));
    } catch (e) {
      set((s) => ({
        clients: s.clients.map((c) =>
          c.id === clientId ? { ...c, [field]: undefined } : c
        ),
      }));
      throw e;
    }
  },

  unlinkPlatform: async (clientId, platform) => {
    const field = platform === 'instagram' ? 'instagram' : 'facebook';
    const prev = get().clients.find((c) => c.id === clientId);
    set((s) => ({
      clients: s.clients.map((c) =>
        c.id === clientId ? { ...c, [field]: undefined } : c
      ),
    }));
    try {
      await clientService.updateClient(clientId, { [field]: null as unknown as undefined });
    } catch (e) {
      if (prev) {
        set((s) => ({
          clients: s.clients.map((c) => (c.id === clientId ? prev : c)),
        }));
      }
      throw e;
    }
  },

  searchClients: (query) => {
    const q = query.toLowerCase();
    const profiles = get().linkedProfiles;
    return get().clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        (c.instagram && profiles[c.instagram]?.name?.toLowerCase().includes(q)) ||
        (c.facebook && profiles[c.facebook]?.name?.toLowerCase().includes(q))
    );
  },
}), {
  name: 'inkbloop-clients',
  // Bumped on the change to profile_pic / profilePic persistence semantics.
  // Pre-v1, both fields were persisted as their resolved render URL; for the
  // R2 backend that's a blob: URL which is session-scoped, so reloads
  // produced broken-image (?) avatars on every linked client. From v1
  // forward neither is persisted — both are re-resolved on hydration via
  // the next fetchClients call.
  version: 1,
  migrate: (persistedState) => {
    const state = persistedState as
      | {
          clients?: Array<{ profile_pic?: unknown }>;
          linkedProfiles?: Record<string, { profilePic?: unknown }>;
        }
      | null
      | undefined;
    if (state?.clients) {
      state.clients = state.clients.map((c) => ({ ...c, profile_pic: undefined }));
    }
    if (state?.linkedProfiles) {
      const cleaned: Record<string, { profilePic?: unknown }> = {};
      for (const [k, v] of Object.entries(state.linkedProfiles)) {
        cleaned[k] = { ...v, profilePic: undefined };
      }
      state.linkedProfiles = cleaned;
    }
    return state;
  },
  // Strip profile_pic / profilePic on persist (and skip _fetchedAt so the
  // next mount always refetches and fills in fresh signed/blob URLs).
  partialize: (state) => ({
    clients: state.clients.map((c) => ({ ...c, profile_pic: undefined })),
    linkedProfiles: Object.fromEntries(
      Object.entries(state.linkedProfiles).map(([k, v]) => [
        k,
        { ...v, profilePic: undefined },
      ]),
    ),
  }),
}));
