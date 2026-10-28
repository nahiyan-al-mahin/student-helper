// Chat page. New messages are fetched every 3 seconds ("polling").
// Simple and reliable; a mobile app can use the very same API.
const me = auth.user;
let current = null;   // user we are chatting with
let lastId = 0;       // newest message id we have shown

async function loadConversations() {
  const [{ conversations }, { users: following }, { users: followers }] = await Promise.all([
    api('GET', '/chat/conversations'), api('GET', '/social/following'), api('GET', '/social/followers'),
  ]);
  // People I can chat with but haven't yet
  const talked = new Set(conversations.map((c) => c.user.id));
  const others = [...following, ...followers].filter((u, i, arr) => !talked.has(u.id) && arr.findIndex((x) => x.id === u.id) === i);

  $('#convos').innerHTML = conversations.map((c) => `
      <div class="convo ${current && current.id === c.user.id ? 'active' : ''}" data-user="${c.user.id}">
        ${avatarHtml(c.user)}
        <div class="grow"><b>${esc(c.user.display_name)}</b><small>${c.last_message.sender_id === me.id ? 'You: ' : ''}${esc(c.last_message.text)}</small></div>
        ${c.unread ? `<span class="count">${c.unread}</span>` : ''}
      </div>`).join('')
    + (others.length ? `<p class="small muted" style="padding:.8rem 1rem 0;margin:0">Start a chat</p>` + others.map((u) => `
      <div class="convo" data-user="${u.id}">${avatarHtml(u, 'sm')}<div class="grow"><b>${esc(u.display_name)}</b><small>@${esc(u.username)}</small></div></div>`).join('') : '')
    || '<div class="empty">No chats yet. Follow someone on the <a href="/app/people.html">People</a> page to start chatting.</div>';
}

function msgHtml(m) {
  return `<div class="msg ${m.sender_id === me.id ? 'mine' : ''}">${esc(m.text)}<time>${fmtStamp(m.created_at)}</time></div>`;
}

async function openChat(userId) {
  const data = await api('GET', `/chat/${userId}`);
  current = data.user;
  lastId = data.messages.length ? data.messages[data.messages.length - 1].id : 0;
  history.replaceState(null, '', `?u=${userId}`);
  $('#chat').classList.add('open');
  $('#chatTop').innerHTML = `<button class="icon-btn" id="backBtn">‹</button>
    <a href="/app/profile.html?u=${esc(current.username)}">${avatarHtml(current, 'sm')}</a>
    <div><b>${esc(current.display_name)}</b><br><small class="muted">@${esc(current.username)}</small></div>`;
  $('#backBtn').onclick = () => { $('#chat').classList.remove('open'); current = null; loadConversations(); };
  $('#msgs').innerHTML = data.messages.map(msgHtml).join('') || '<p class="muted small" style="text-align:center">Say hi</p>';
  $('#msgs').scrollTop = $('#msgs').scrollHeight;
  $('#chatForm').classList.toggle('hidden', !data.can_chat);
  if (!data.can_chat) $('#msgs').insertAdjacentHTML('beforeend', '<p class="muted small" style="text-align:center">You can chat when one of you follows the other.</p>');
  else $('#chatForm').text.focus();
  loadConversations();
  refreshUnread();
}

async function poll() {
  if (!current) return;
  const data = await api('GET', `/chat/${current.id}?after=${lastId}`);
  const fresh = data.messages.filter((m) => m.id > lastId); // two polls can overlap; skip repeats
  if (fresh.length) {
    if (!lastId) $('#msgs').innerHTML = '';
    $('#msgs').insertAdjacentHTML('beforeend', fresh.map(msgHtml).join(''));
    lastId = fresh[fresh.length - 1].id;
    $('#msgs').scrollTop = $('#msgs').scrollHeight;
    loadConversations();
  }
}

$('#convos').onclick = (e) => {
  const c = e.target.closest('[data-user]');
  if (c) openChat(c.dataset.user).catch((err) => toast(err.message, 'error'));
};

$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  const input = e.target.text;
  const text = input.value.trim();
  if (!text || !current) return;
  input.value = '';
  withButton(e.target.querySelector('button'), async () => {
    await api('POST', `/chat/${current.id}`, { text });
    await poll();
  });
};

const startWith = new URLSearchParams(location.search).get('u');
loadConversations().then(() => startWith && openChat(startWith)).catch((err) => toast(err.message, 'error'));
setInterval(() => poll().catch(() => {}), 3000);
setInterval(() => !current && loadConversations().catch(() => {}), 15000);
