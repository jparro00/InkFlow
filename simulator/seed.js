/**
 * Seed data — maps Ink Bloop's mock clients to simulated Meta platform identities
 * and pre-populates realistic tattoo booking conversations.
 *
 * Clients with an `instagram` handle → Instagram platform.
 * Clients without → Facebook Messenger.
 */

/** @type {Array<{id: string, name: string, firstName: string, lastName: string, platform: 'instagram' | 'messenger', psid: string, profilePic: string | null, instagram?: string}>} */
export const seedClients = [
  { id: 'c1', name: 'Sarah Mitchell',    firstName: 'Sarah',    lastName: 'Mitchell',  platform: 'instagram', psid: 'igsid-c1', profilePic: null, instagram: '@sarahink_tn' },
  { id: 'c2', name: 'Marcus Rivera',     firstName: 'Marcus',   lastName: 'Rivera',    platform: 'instagram', psid: 'igsid-c2', profilePic: null, instagram: '@marcusriv' },
  { id: 'c3', name: 'Jen Kowalski',      firstName: 'Jen',      lastName: 'Kowalski',  platform: 'messenger', psid: 'psid-c3',  profilePic: null },
  { id: 'c4', name: 'Deshawn Thompson',  firstName: 'Deshawn',  lastName: 'Thompson',  platform: 'instagram', psid: 'igsid-c4', profilePic: null, instagram: '@deshawn.t' },
  { id: 'c5', name: 'Alyssa Chen',       firstName: 'Alyssa',   lastName: 'Chen',      platform: 'instagram', psid: 'igsid-c5', profilePic: null, instagram: '@alyssachen.art' },
  { id: 'c6', name: 'Tyler Brooks',      firstName: 'Tyler',    lastName: 'Brooks',    platform: 'messenger', psid: 'psid-c6',  profilePic: null },
  { id: 'c7', name: 'Maria Santos',      firstName: 'Maria',    lastName: 'Santos',    platform: 'instagram', psid: 'igsid-c7', profilePic: null, instagram: '@maria.s.art' },
  { id: 'c8', name: 'Jake Donovan',      firstName: 'Jake',     lastName: 'Donovan',   platform: 'messenger', psid: 'psid-c8',  profilePic: null },
];

/**
 * Starter conversations — realistic tattoo booking messages.
 * Each entry: { psid, messages: [{ from: 'client' | 'business', text, timestamp }] }
 */
export const seedConversations = [
  {
    psid: 'igsid-c1',
    messages: [
      { from: 'client',   text: 'Hey! I saw your florals on IG and I love them. Do you have any openings this month?', timestamp: '2026-04-01T14:22:00Z' },
      { from: 'business', text: 'Hi Sarah! Thanks so much 🙏 I have a few slots mid-April. What size were you thinking?', timestamp: '2026-04-01T14:35:00Z' },
      { from: 'client',   text: 'Something small, under 3 inches. Fine line on my inner wrist. Can I send you a reference pic?', timestamp: '2026-04-01T14:38:00Z' },
    ],
  },
  {
    psid: 'igsid-c2',
    messages: [
      { from: 'client',   text: 'Yo, ready to continue the half-sleeve whenever you are. Same Japanese style.', timestamp: '2026-04-03T09:15:00Z' },
      { from: 'business', text: 'Marcus! Let\'s do it. I was thinking we extend the koi down to the elbow next. Want to come in for a quick layout session first?', timestamp: '2026-04-03T10:00:00Z' },
      { from: 'client',   text: 'Yeah that works. Just remember — nitrile gloves only, latex allergy.', timestamp: '2026-04-03T10:05:00Z' },
    ],
  },
  {
    psid: 'psid-c3',
    messages: [
      { from: 'client',   text: 'Hi! Sarah Mitchell referred me. My best friend and I want matching tattoos — something small and meaningful. Are you taking new clients?', timestamp: '2026-04-05T16:30:00Z' },
    ],
  },
  {
    psid: 'igsid-c4',
    messages: [
      { from: 'client',   text: 'Hey, I need a cover-up on my right shoulder. Old tribal piece. Think you can work with it?', timestamp: '2026-04-02T11:00:00Z' },
      { from: 'business', text: 'Hey Deshawn! Yeah I do cover-ups. Can you send me a clear photo of the current piece? I\'ll need to see the size and how dark the ink is.', timestamp: '2026-04-02T11:20:00Z' },
    ],
  },
  {
    psid: 'psid-c6',
    messages: [
      { from: 'client',   text: 'Hi there, I want a full color koi fish on my calf. What would something like that run price-wise? Budget is around $800.', timestamp: '2026-04-04T13:00:00Z' },
      { from: 'business', text: 'Hey Tyler! A full color koi on the calf would probably be 2-3 sessions depending on detail. $800 is a solid starting point — we can talk design and nail down the exact scope. Want to book a consultation?', timestamp: '2026-04-04T14:15:00Z' },
    ],
  },
  {
    psid: 'psid-c8',
    messages: [
      { from: 'client',   text: 'Quick question — I had a reaction to red ink last time I got tattooed (not by you). Do you have alternative pigments that are safe for sensitive skin?', timestamp: '2026-04-06T09:30:00Z' },
      { from: 'business', text: 'Good question Jake. Yes, I use vegan inks and I have alternatives for red that work well for sensitive skin. I\'ll note the allergy on your file. We can do a small patch test before any session if you want peace of mind.', timestamp: '2026-04-06T10:00:00Z' },
      { from: 'client',   text: 'That would be great. Let me know when works for the patch test.', timestamp: '2026-04-06T10:05:00Z' },
    ],
  },
];
