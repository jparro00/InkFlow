import { create } from 'zustand';
import type { Client, ClientNote } from '../types';
import * as clientService from '../services/clientService';

interface ClientStore {
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  fetchClients: () => Promise<void>;
  getClient: (id: string) => Client | undefined;
  addClient: (client: Omit<Client, 'id' | 'created_at' | 'notes'>) => Promise<Client>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addNote: (clientId: string, text: string) => Promise<void>;
  searchClients: (query: string) => Client[];
}

export const useClientStore = create<ClientStore>((set, get) => ({
  clients: [],
  isLoading: false,
  error: null,

  fetchClients: async () => {
    set({ isLoading: true, error: null });
    try {
      const clients = await clientService.fetchClients();
      set({ clients, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  getClient: (id) => get().clients.find((c) => c.id === id),

  addClient: async (data) => {
    // Optimistic: create temp client in state
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
      set((s) => ({
        clients: s.clients.map((c) => (c.id === tempId ? real : c)),
      }));
      return real;
    } catch (e) {
      // Roll back
      set((s) => ({ clients: s.clients.filter((c) => c.id !== tempId) }));
      throw e;
    }
  },

  updateClient: async (id, data) => {
    const prev = get().clients.find((c) => c.id === id);
    // Optimistic update
    set((s) => ({
      clients: s.clients.map((c) => (c.id === id ? { ...c, ...data } : c)),
    }));

    try {
      await clientService.updateClient(id, data);
    } catch (e) {
      // Roll back
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
    // Optimistic delete
    set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));

    try {
      await clientService.deleteClient(id);
    } catch (e) {
      // Roll back
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

    // Optimistic
    set((s) => ({
      clients: s.clients.map((c) =>
        c.id === clientId ? { ...c, notes: newNotes } : c
      ),
    }));

    try {
      await clientService.updateClientNotes(clientId, newNotes);
    } catch (e) {
      // Roll back
      set((s) => ({
        clients: s.clients.map((c) =>
          c.id === clientId ? { ...c, notes: client.notes } : c
        ),
      }));
      throw e;
    }
  },

  searchClients: (query) => {
    const q = query.toLowerCase();
    return get().clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.instagram?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  },
}));
