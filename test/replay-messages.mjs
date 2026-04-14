import crypto from 'crypto';

const WEBHOOK_URL = 'https://jpjvexfldouobiiczhax.supabase.co/functions/v1/webhook';
const APP_SECRET = 'inkbloop-dev-secret';
const IG_USER_ID = '999888777666555';
const PAGE_ID = '111222333444555';

// All 65 sim_messages ordered by timestamp ASC
const messages = [
  { mid:"m_5KBdjjXMzcCiGW3aoLwaYA", sender_id:"igsid-c1", recipient_id:"999888777666555", text:"Hey! I saw your florals on IG and I love them. Do you have any openings this month?", is_echo:false, timestamp:1775053320000 },
  { mid:"m_Vm4G-t7UF8ebSPzDpmqMFw", sender_id:"999888777666555", recipient_id:"igsid-c1", text:"Hi Sarah! Thanks so much 🙏 I have a few slots mid-April. What size were you thinking?", is_echo:true, timestamp:1775054100000 },
  { mid:"m_3fUXwfdEdDzSbY7A0JcJ-g", sender_id:"igsid-c1", recipient_id:"999888777666555", text:"Something small, under 3 inches. Fine line on my inner wrist. Can I send you a reference pic?", is_echo:false, timestamp:1775054280000 },
  { mid:"m_yrgNk6mPHZDtI56z5o1Tvw", sender_id:"igsid-c4", recipient_id:"999888777666555", text:"Hey, I need a cover-up on my right shoulder. Old tribal piece. Think you can work with it?", is_echo:false, timestamp:1775127600000 },
  { mid:"m_GlBb5DWzwzobp6GXdikyoQ", sender_id:"999888777666555", recipient_id:"igsid-c4", text:"Hey Deshawn! Yeah I do cover-ups. Can you send me a clear photo of the current piece? I'll need to see the size and how dark the ink is.", is_echo:true, timestamp:1775128800000 },
  { mid:"m_l5YxQwt17aJ__QsGD7NZHQ", sender_id:"igsid-c2", recipient_id:"999888777666555", text:"Yo, ready to continue the half-sleeve whenever you are. Same Japanese style.", is_echo:false, timestamp:1775207700000 },
  { mid:"m_VNc0UzzG8zZ3FSOKVvE_Iw", sender_id:"999888777666555", recipient_id:"igsid-c2", text:"Marcus! Let's do it. I was thinking we extend the koi down to the elbow next. Want to come in for a quick layout session first?", is_echo:true, timestamp:1775210400000 },
  { mid:"m_pm0Wx8XUSPJh8dJc6OCS7Q", sender_id:"igsid-c2", recipient_id:"999888777666555", text:"Yeah that works. Just remember — nitrile gloves only, latex allergy.", is_echo:false, timestamp:1775210700000 },
  { mid:"m_1Pn-HoNcGjXCn1T6kfLX_A", sender_id:"psid-c6", recipient_id:"111222333444555", text:"Hi there, I want a full color koi fish on my calf. What would something like that run price-wise? Budget is around $800.", is_echo:false, timestamp:1775307600000 },
  { mid:"m_IN3cNafsy4hNGKL9g5DRHw", sender_id:"111222333444555", recipient_id:"psid-c6", text:"Hey Tyler! A full color koi on the calf would probably be 2-3 sessions depending on detail. $800 is a solid starting point — we can talk design and nail down the exact scope. Want to book a consultation?", is_echo:true, timestamp:1775312100000 },
  { mid:"m_k9Du9QcWlp0DfON9EqMgNQ", sender_id:"psid-c3", recipient_id:"111222333444555", text:"Hi! Sarah Mitchell referred me. My best friend and I want matching tattoos — something small and meaningful. Are you taking new clients?", is_echo:false, timestamp:1775406600000 },
  { mid:"m_BU-5nrCfPDPSuIFHk5HqEg", sender_id:"psid-c8", recipient_id:"111222333444555", text:"Quick question — I had a reaction to red ink last time I got tattooed (not by you). Do you have alternative pigments that are safe for sensitive skin?", is_echo:false, timestamp:1775467800000 },
  { mid:"m_jhp7Zta9zVV7036XN9TXcw", sender_id:"111222333444555", recipient_id:"psid-c8", text:"Good question Jake. Yes, I use vegan inks and I have alternatives for red that work well for sensitive skin. I'll note the allergy on your file. We can do a small patch test before any session if you want peace of mind.", is_echo:true, timestamp:1775469600000 },
  { mid:"m_OzoxSBvgQEasZpQZRJylbQ", sender_id:"psid-c8", recipient_id:"111222333444555", text:"That would be great. Let me know when works for the patch test.", is_echo:false, timestamp:1775469900000 },
  { mid:"m_lwxLES951pYvPNgVay3rPA", sender_id:"igsid-c5", recipient_id:"999888777666555", text:"hey", is_echo:false, timestamp:1776127151880 },
  { mid:"m_G8Wti00ChsJHZGWG72uu8Q", sender_id:"igsid-c5", recipient_id:"999888777666555", text:"hey", is_echo:false, timestamp:1776127493786 },
  { mid:"m_Dv9VapQSgSSuHAfb-5xx7w", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"hey babe", is_echo:false, timestamp:1776128118660 },
  { mid:"m_NvhSwwOhkCJUKlI2BY5EFg", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"you gonna tat me up?", is_echo:false, timestamp:1776128133884 },
  { mid:"m_pJ8tN-vrOgey6AR4S7FsEw", sender_id:"999888777666555", recipient_id:"igsid-4l0xl2cs", text:"wassup hommie", is_echo:true, timestamp:1776128152241 },
  { mid:"m_acU6JPTuKr48XrBJ8azepA", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"you a fat ass milfy", is_echo:false, timestamp:1776128161933 },
  { mid:"m_S0bl4rYkn6iVt53nFU9_xA", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"ha", is_echo:false, timestamp:1776128184203 },
  { mid:"m_ee5b4b88968246e59f5b3d", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"hey", is_echo:false, timestamp:1776129048192 },
  { mid:"m_a0a4ae97c0104cd7bc25aa", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"test", is_echo:false, timestamp:1776129280884 },
  { mid:"m_4a8322c5821647b0a1f2e9", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"hellooo", is_echo:false, timestamp:1776130057909 },
  { mid:"m_589599186ab24d43a7ddbf", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"sooo", is_echo:false, timestamp:1776130100537 },
  { mid:"m_b7bd275b1d3147cfb19ca8", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"test", is_echo:false, timestamp:1776130140886 },
  { mid:"m_54087aebb01f47e5b8d1f7", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"testing", is_echo:false, timestamp:1776130288059 },
  { mid:"m_1fbc918af3584461b56c12", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"does this work?", is_echo:false, timestamp:1776130318017 },
  { mid:"m_23801421640a45b3816a1f", sender_id:"999888777666555", recipient_id:"igsid-4l0xl2cs", text:"Hey", is_echo:true, timestamp:1776130355768 },
  { mid:"m_2f81e6d8f1a240faa21939", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"and this?", is_echo:false, timestamp:1776130628699 },
  { mid:"m_9bae20fe837142de886d42", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"can you tattoo me?", is_echo:false, timestamp:1776130678768 },
  { mid:"m_5f60c41632c44d5f8c6ba3", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"hey", is_echo:false, timestamp:1776130966869 },
  { mid:"m_842b93289f954be48309b1", sender_id:"psid-1c22a3a6", recipient_id:"111222333444555", text:"test", is_echo:false, timestamp:1776131044332 },
  { mid:"m_b66daae7aad84ad4bc5225", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"testing", is_echo:false, timestamp:1776131056909 },
  { mid:"m_cf9d478535c1415f9c6a1c", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"another test", is_echo:false, timestamp:1776131532243 },
  { mid:"m_667ec216a9384c9788e4e7", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"hey", is_echo:false, timestamp:1776132044229 },
  { mid:"m_a6402cfae6294b269f56b0", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"test", is_echo:false, timestamp:1776132110669 },
  { mid:"m_64c2057fd0464a0e9f8890", sender_id:"psid-c8", recipient_id:"111222333444555", text:"I'm new", is_echo:false, timestamp:1776132134708 },
  { mid:"m_df837583cc054609bd8575", sender_id:"igsid-c7", recipient_id:"999888777666555", text:"test", is_echo:false, timestamp:1776133324445 },
  { mid:"m_3535458bcc644759b38205", sender_id:"igsid-c7", recipient_id:"999888777666555", text:"test2", is_echo:false, timestamp:1776133882124 },
  { mid:"m_d6698b88bcf3449e97f7c9", sender_id:"999888777666555", recipient_id:"igsid-4l0xl2cs", text:"Hey", is_echo:true, timestamp:1776133994429 },
  { mid:"m_db48509b27da4926a3424f", sender_id:"999888777666555", recipient_id:"igsid-4l0xl2cs", text:"test", is_echo:true, timestamp:1776134027256 },
  { mid:"m_dbbdecf8cf6e4d858bb0ac", sender_id:"999888777666555", recipient_id:"igsid-4l0xl2cs", text:"hey", is_echo:true, timestamp:1776134208455 },
  { mid:"m_bb5db4a96e3e41278c0b06", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"what?", is_echo:false, timestamp:1776134237696 },
  { mid:"m_9ff1284e4fed40a7acbecf", sender_id:"999888777666555", recipient_id:"igsid-4l0xl2cs", text:"I said hey", is_echo:true, timestamp:1776134247203 },
  { mid:"m_7b09815d6cc94fcc8aa1d3", sender_id:"999888777666555", recipient_id:"igsid-c7", text:null, is_echo:true, timestamp:1776134420990 },
  { mid:"m_383a2801b9e64fa68582e2", sender_id:"111222333444555", recipient_id:"psid-c3", text:"Ya", is_echo:true, timestamp:1776136765851 },
  { mid:"m_4a2b74bf43be4bf1a86988", sender_id:"psid-c3", recipient_id:"111222333444555", text:"test", is_echo:false, timestamp:1776179089112 },
  { mid:"m_85ca64f2d5f24becabd5c9", sender_id:"psid-c3", recipient_id:"111222333444555", text:"test2", is_echo:false, timestamp:1776180560531 },
  { mid:"m_8c04c88b4d8c42a58eb6d8", sender_id:"psid-c3", recipient_id:"111222333444555", text:"test3", is_echo:false, timestamp:1776180856604 },
  { mid:"m_9e9832ed7c2d48d9a8f4d7", sender_id:"psid-c3", recipient_id:"111222333444555", text:"test4.", is_echo:false, timestamp:1776180931948 },
  { mid:"m_608131d3a4734d04b0b8c3", sender_id:"psid-c3", recipient_id:"111222333444555", text:"test5", is_echo:false, timestamp:1776180957798 },
  { mid:"m_1655b3cad752442987044b", sender_id:"psid-c3", recipient_id:"111222333444555", text:"new kind of test", is_echo:false, timestamp:1776180991506 },
  { mid:"m_02bfe53a1a9d43e6994631", sender_id:"psid-c3", recipient_id:"111222333444555", text:"new test 2", is_echo:false, timestamp:1776181298609 },
  { mid:"m_e4c199086d70416b8ff1ef", sender_id:"psid-c3", recipient_id:"111222333444555", text:"new test 3", is_echo:false, timestamp:1776181307442 },
  { mid:"m_a056eabbbe9f41879114be", sender_id:"psid-c3", recipient_id:"111222333444555", text:"test4", is_echo:false, timestamp:1776182222981 },
  { mid:"m_9ad34652ee5546449c2840", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"this is a test", is_echo:false, timestamp:1776184619339 },
  { mid:"m_02b1f0cf8c1842049c0860", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"hey", is_echo:false, timestamp:1776185035079 },
  { mid:"m_16409224a91d4e4a8884e8", sender_id:"igsid-4l0xl2cs", recipient_id:"999888777666555", text:"ho", is_echo:false, timestamp:1776185671227 },
  { mid:"m_fba2867376e1410bb05da6", sender_id:"igsid-c5", recipient_id:"999888777666555", text:"hey this is alyssa", is_echo:false, timestamp:1776207127146 },
  { mid:"m_d2847ac22a8e43ec91ecce", sender_id:"999888777666555", recipient_id:"igsid-c5", text:"Hey Lyss this is Jess", is_echo:true, timestamp:1776207163765 },
  { mid:"m_c44a4b27ee7e43b4aed2a1", sender_id:"igsid-c7", recipient_id:"999888777666555", text:"hey Jess this is maria", is_echo:false, timestamp:1776207445102 },
  { mid:"m_11a440da68344821a50688", sender_id:"igsid-c7", recipient_id:"999888777666555", text:"I was hoping we could chat about my piece", is_echo:false, timestamp:1776207457585 },
  { mid:"m_d606540ca33547e2941c05", sender_id:"igsid-c7", recipient_id:"999888777666555", text:"I'm soooooo excited", is_echo:false, timestamp:1776207461950 },
  { mid:"m_d0850ce5fd534a4c8d1417", sender_id:"igsid-95d65c52", recipient_id:"999888777666555", text:"hey it's greenman", is_echo:false, timestamp:1776209303121 },
  { mid:"m_bbba1c3434a04364843fb9", sender_id:"igsid-95d65c52", recipient_id:"999888777666555", text:"hey", is_echo:false, timestamp:1776209646187 },
];

function sign(body) {
  const hmac = crypto.createHmac('sha256', APP_SECRET);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

function buildPayload(msg) {
  const isInstagram = msg.sender_id === IG_USER_ID || msg.recipient_id === IG_USER_ID;
  const object = isInstagram ? 'instagram' : 'page';
  const entryId = isInstagram ? IG_USER_ID : PAGE_ID;

  const messageObj = { mid: msg.mid };
  if (msg.text !== null) messageObj.text = msg.text;
  if (msg.is_echo) messageObj.is_echo = true;

  return {
    object,
    entry: [{
      id: entryId,
      time: msg.timestamp,
      messaging: [{
        sender: { id: msg.sender_id },
        recipient: { id: msg.recipient_id },
        timestamp: msg.timestamp,
        message: messageObj,
      }],
    }],
  };
}

async function replay() {
  console.log(`Replaying ${messages.length} messages...\n`);
  let ok = 0, fail = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const payload = buildPayload(msg);
    const body = JSON.stringify(payload);
    const signature = sign(body);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        },
        body,
      });
      const text = await res.text();
      const status = res.status === 200 ? '✓' : '✗';
      console.log(`[${String(i+1).padStart(2)}/${messages.length}] ${status} ${msg.mid.slice(0,20)}... → ${res.status} ${text}`);
      if (res.status === 200) ok++; else fail++;
    } catch (err) {
      console.log(`[${String(i+1).padStart(2)}/${messages.length}] ✗ ${msg.mid.slice(0,20)}... → ERROR: ${err.message}`);
      fail++;
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
}

replay();
