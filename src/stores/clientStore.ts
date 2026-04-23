import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Client, ClientNote, LinkedProfile } from '../types';
import * as clientService from '../services/clientService';

interface ClientStore {
  clients: Client[];
  linkedProfiles: Record<string, LinkedProfile>;
  isLoading: boolean;
  error: string | null;
  fetchClients: () => Promise<void>;
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

export const useClientStore = create<ClientStore>()(persist((set, get) => ({
  clients: [],
  linkedProfiles: {},
  isLoading: false,
  error: null,

  fetchClients: async () => {
    // Only show loading spinner if there's no cached data
    if (get().clients.length === 0) set({ isLoading: true });
    set({ error: null });
    try {
      const clients = await clientService.fetchClients();
      const allPsids = clients.flatMap((c) =>
        [c.instagram, c.facebook].filter(Boolean)
      ) as string[];
      const linkedProfiles = await clientService.fetchLinkedProfiles(allPsids);
      set({ clients, linkedProfiles, isLoading: false });
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
  partialize: (state) => ({
    clients: state.clients,
    linkedProfiles: state.linkedProfiles,
  }),
}));
