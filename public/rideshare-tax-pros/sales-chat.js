(() => {
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const countLabel = n => n > 99 ? '99+' : String(n);
  const initialsOf = name => name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();

  function mount({ api }) {
    const panel = document.querySelector('[data-tab-panel="chat"]');
    if (!panel) return;
    const $ = selector => panel.querySelector(selector);
    const badges = [...document.querySelectorAll('[data-tab="chat"], .sdr-nav [data-tab="team"]')].map(button => {
      const badge = element('span', '', 'chat-nav-count');
      badge.hidden = true;
      button.append(badge);
      return { button, badge, label: button.dataset.tab === 'chat' ? 'Team chat' : 'Sales team' };
    });
    const list = $('#chat-channels'), log = $('#chat-messages'), scroll = $('#chat-scroll');
    const railToggle = $('#chat-nav-toggle');
    const directs = $('#chat-directs'), peoplePanel = $('#chat-people'), newDirect = $('#chat-new-direct');
    const personSearch = $('#chat-person-search'), personResults = $('#chat-person-results'), firstDirect = $('#chat-first-direct');
    const add = $('#chat-add'), create = $('#chat-create'), compose = $('#chat-compose');
    const input = compose.elements.message, send = compose.querySelector('button');
    const older = $('#chat-older'), jump = $('#chat-jump'), empty = $('#chat-empty'), reply = $('#chat-reply');
    const status = $('#chat-status'), signin = $('#chat-signin');
    const drafts = new Map();
    let user, active = false, room, lastChannel = 'general', controller, timer, retry = 1000;
    let channelList = [], directList = [], channelSignature = '', people = [], peopleRequest = 0;

    function showStatus(text = '', kind = '') {
      status.textContent = text;
      status.dataset.kind = kind;
      status.dataset.error = String(kind === 'error' || kind === 'connection');
    }
    function setNavigation(open) {
      panel.dataset.navOpen = String(open);
      railToggle.setAttribute('aria-expanded', String(open));
    }
    function selectRoom(slug) {
      const fromMobileList = panel.dataset.navOpen === 'true' && railToggle.getClientRects().length > 0;
      setNavigation(false);
      view(user, 'chat', slug);
      if (fromMobileList) {
        railToggle.focus({ preventScroll: true });
        markVisible();
      }
    }
    function renderChannels() {
      const all = [...channelList, ...directList];
      const unread = all.reduce((sum, channel) => sum + channel.unread, 0);
      for (const { button, badge, label } of badges) {
        badge.hidden = !unread;
        badge.textContent = unread ? countLabel(unread) : '';
        button.setAttribute('aria-label', unread ? `${label}, ${unread} unread chat messages` : label);
      }
      firstDirect.hidden = Boolean(directList.length) || !peoplePanel.hidden;
      const signature = JSON.stringify(all.map(c => [c.slug, c.name, c.unread])) + room?.slug;
      if (signature === channelSignature) return;
      channelSignature = signature;
      const focused = document.activeElement?.dataset.channel;
      function rowButton(channel) {
        const direct = Boolean(channel.peerId);
        const label = direct ? channel.name : '#' + channel.slug;
        const button = element('button');
        button.type = 'button';
        button.dataset.channel = channel.slug;
        button.setAttribute('aria-current', String(channel.slug === room?.slug));
        button.setAttribute('aria-label', label + (channel.unread ? `, ${channel.unread} unread` : ''));
        button.title = label;
        const mark = direct ? element('span', initialsOf(label), 'chat-peer-avatar') : element('span', '#', 'chat-hash');
        mark.setAttribute('aria-hidden', 'true');
        button.append(mark, element('span', direct ? label : channel.slug, 'chat-channel-label'));
        if (channel.unread) button.append(element('span', countLabel(channel.unread), 'chat-unread'));
        button.addEventListener('click', () => selectRoom(channel.slug));
        return button;
      }
      list.replaceChildren(...channelList.map(rowButton));
      directs.replaceChildren(...directList.map(rowButton));
      if (focused) [...list.children, ...directs.children].find(button => button.dataset.channel === focused)?.focus({ preventScroll: true });
    }
    function roomHeading(channel) {
      const direct = room.slug.startsWith('@'), name = direct ? channel?.name || 'Direct message' : room.slug;
      const label = direct ? name : '#' + name;
      panel.dataset.conversation = direct ? 'direct' : 'channel';
      scroll.setAttribute('aria-label', direct ? 'Direct message history with ' + name : 'History for ' + label);
      room.writable = !direct || channel?.active === true;
      $('#chat-name').textContent = name;
      $('.chat-channel-mark').textContent = direct ? (channel ? initialsOf(name) : '…') : '#';
      $('.chat-channel-mark').classList.toggle('chat-private-mark', direct);
      $('#chat-audience-label').textContent = direct ? 'Participants only' : 'Sales team only';
      $('#chat-topic').textContent = direct ? (channel?.active === false ? 'This teammate no longer has sales workspace access.' : 'Private direct message') : channel?.topic || '';
      empty.querySelector('h4').textContent = direct ? 'Message ' + name : 'Start the conversation in ' + label;
      empty.querySelector('p').textContent = direct ? 'Only the two of you can see this conversation.' : 'Send the first message to your team.';
      input.placeholder = 'Message ' + label;
      input.setAttribute('aria-label', input.placeholder);
    }
    function draft(slug) {
      if (!drafts.has(slug)) drafts.set(slug, { text: '', replyTo: null, requestId: null, sending: false });
      return drafts.get(slug);
    }
    function composer() {
      const item = room && draft(room.slug);
      input.disabled = !room?.ready || !room.writable || !user;
      input.readOnly = Boolean(item?.sending);
      send.disabled = input.disabled || input.readOnly || !item?.text.trim();
      const target = item?.replyTo;
      reply.hidden = !target;
      reply.querySelector('span').textContent = target ? `Replying to ${target.author} · ${target.body}` : '';
      reply.querySelector('button').disabled = input.readOnly;
    }
    function messageEntry(row, previousDay) {
      const entry = element('div');
      const date = new Date(row.sentAt), day = dayFormat.format(date);
      entry.dataset.day = day;
      if (day !== previousDay) entry.append(element('div', day, 'chat-day'));
      const item = element('article', undefined, 'chat-message');
      item.dataset.messageId = row.id;
      item.classList.toggle('is-own', String(user.id) === row.authorId);
      const initials = initialsOf(row.author);
      const avatar = element('span', initials, 'chat-avatar tone-' + ((Number(row.authorId) || 0) % 4));
      avatar.setAttribute('aria-hidden', 'true');
      const content = element('div', undefined, 'chat-message-content'), byline = element('div', undefined, 'chat-byline');
      const bubble = element('div', undefined, 'chat-bubble');
      const time = element('time', timeFormat.format(date));
      time.dateTime = row.sentAt;
      time.title = date.toLocaleString();
      const respond = element('button', 'Reply');
      respond.type = 'button';
      respond.setAttribute('aria-label', 'Reply to ' + row.author);
      respond.addEventListener('click', () => {
        const item = draft(room.slug);
        if (item.sending || !room.writable) return;
        item.replyTo = { id: row.id, author: row.author, body: row.body.slice(0, 160) };
        item.requestId = null;
        composer();
        input.focus();
      });
      byline.append(element('strong', row.author), time, respond);
      if (row.replyId) bubble.append(element('blockquote', `${row.replyAuthor} · ${row.replyText}`, 'chat-quote'));
      bubble.append(element('p', row.body, 'chat-body'));
      content.append(byline, bubble);
      item.append(avatar, content);
      entry.append(item);
      return entry;
    }
    function insert(rows, prepend = false) {
      if (!rows.length) return;
      const elements = document.createDocumentFragment();
      let day = prepend ? '' : log.lastElementChild?.dataset.day;
      for (const row of rows) {
        const node = messageEntry(row, day);
        day = node.dataset.day;
        elements.append(node);
      }
      if (prepend) {
        if (day === log.firstElementChild?.dataset.day) log.firstElementChild.querySelector('.chat-day')?.remove();
        log.prepend(elements);
        room.first = rows[0].id;
      } else {
        log.append(elements);
        room.first ||= rows[0].id;
        room.last = rows.at(-1).id;
      }
    }
    const nearBottom = () => scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 45;
    function markVisible() {
      const current = room;
      if (!user || !active || !current?.ready || current.marking || current.last <= current.seen ||
          document.visibilityState === 'hidden' || (panel.dataset.navOpen === 'true' && railToggle.getClientRects().length) || !nearBottom()) return;
      const through = current.last;
      current.marking = true;
      api('chat-seen', { channel: current.slug, through }).then(() => {
        current.seen = Math.max(current.seen, through);
      }).catch(() => { /* The next authenticated sync retries the read marker. */ })
        .finally(() => { current.marking = false; if (room === current && current.seen >= through) markVisible(); });
    }
    function pause() {
      clearTimeout(timer);
      controller?.abort();
      controller = undefined;
    }
    function restart() {
      pause();
      if (!user || document.visibilityState === 'hidden') return;
      const request = new AbortController();
      controller = request;
      void sync(request);
    }
    async function sync(request) {
      const current = room, displaying = Boolean(active && current);
      const initial = displaying && !current.ready;
      try {
        const args = displaying ? { channel: current.slug } : {};
        if (displaying && !initial) args.after = current.last;
        const data = await api('chat-sync', args, request.signal);
        if (request !== controller) return;
        channelList = data.channels;
        directList = data.directs || [];
        renderChannels();
        if (displaying) {
          const channel = [...channelList, ...directList].find(c => c.slug === current.slug);
          current.seen = Math.max(current.seen, channel?.seen || 0);
          roomHeading(data.peer || channel);
          const follow = initial || current.follow || nearBottom();
          insert(data.messages);
          if (initial) older.hidden = !data.hasMore;
          empty.hidden = Boolean(current.last);
          current.ready = true;
          composer();
          if (follow) { scroll.scrollTop = scroll.scrollHeight; jump.hidden = true; }
          else if (data.messages.length) jump.hidden = false;
          current.follow = false;
          markVisible();
        }
        if (['loading', 'connection'].includes(status.dataset.kind)) showStatus();
        retry = 1000;
        if (displaying && !initial && data.hasMore) {
          timer = setTimeout(() => sync(request), 0);
          return;
        }
        if (displaying) await api('chat-watch', { version: data.version }, request.signal);
        if (request === controller) timer = setTimeout(() => sync(request), displaying ? 0 : 12_000);
      } catch (error) {
        if (request !== controller) return;
        if ([401, 403].includes(error.status)) {
          reset();
          showStatus(error.message, 'error');
          signin.hidden = false;
          return;
        }
        if (displaying && error.status === 404 && current.slug !== 'general') {
          view(user, 'chat', 'general');
          showStatus('That conversation is unavailable. Showing #general.', 'error');
          return;
        }
        if (displaying) showStatus('Chat connection interrupted. Reconnecting…', 'connection');
        timer = setTimeout(() => sync(request), retry);
        retry = Math.min(retry * 2, 15_000);
      }
    }
    function hideCreate() {
      create.hidden = true;
      add.setAttribute('aria-expanded', 'false');
      $('#chat-create-status').textContent = '';
    }
    function hidePeople() {
      peopleRequest++;
      people = [];
      peoplePanel.hidden = true;
      newDirect.setAttribute('aria-expanded', 'false');
      personSearch.value = '';
      personResults.replaceChildren();
      $('#chat-person-status').textContent = '';
      $('#chat-invite-link').hidden = true;
      firstDirect.hidden = Boolean(directList.length);
    }
    function showPeople() {
      const term = personSearch.value.trim().toLocaleLowerCase();
      const filtered = people.filter(person => person.name.toLocaleLowerCase().includes(term));
      const nameCounts = new Map();
      for (const person of people) nameCounts.set(person.name, (nameCounts.get(person.name) || 0) + 1);
      personResults.replaceChildren(...filtered.map(person => {
        const button = element('button');
        button.type = 'button';
        button.dataset.person = person.id;
        const avatar = element('span', initialsOf(person.name), 'chat-peer-avatar');
        avatar.setAttribute('aria-hidden', 'true');
        const label = element('span', person.name);
        button.append(avatar, label);
        if (nameCounts.get(person.name) > 1) {
          label.append(element('small', person.id === 'owner' ? 'Owner' : 'Rep #' + person.id));
        }
        button.addEventListener('click', async () => {
          if (button.disabled) return;
          button.disabled = true;
          const selection = ++peopleRequest;
          try {
            const { slug } = await api('chat-direct-open', { memberId: person.id });
            if (selection !== peopleRequest || !active) return;
            hidePeople();
            selectRoom(slug);
          } catch (error) {
            if (selection === peopleRequest) $('#chat-person-status').textContent = error.message;
          } finally { button.disabled = false; }
        });
        return button;
      }));
      $('#chat-person-status').textContent = filtered.length ? '' : people.length ? 'No matching teammates.' : 'No other active teammates yet.';
      $('#chat-invite-link').hidden = people.length > 0 || !user;
    }
    async function openPeople() {
      if (!user) return;
      if (!peoplePanel.hidden) { hidePeople(); newDirect.focus(); return; }
      hideCreate();
      if (railToggle.getClientRects().length) setNavigation(true);
      const request = ++peopleRequest;
      peoplePanel.hidden = false;
      firstDirect.hidden = true;
      newDirect.setAttribute('aria-expanded', 'true');
      personSearch.disabled = true;
      $('#chat-person-status').textContent = 'Loading teammates…';
      try {
        const result = await api('chat-people');
        if (request !== peopleRequest) return;
        people = result.people;
        showPeople();
        personSearch.disabled = false;
        personSearch.focus();
      } catch (error) { if (request === peopleRequest) $('#chat-person-status').textContent = error.message; }
    }
    function reset() {
      pause();
      user = room = undefined;
      active = false;
      lastChannel = 'general';
      drafts.clear();
      channelList = [];
      directList = [];
      channelSignature = '';
      log.replaceChildren();
      renderChannels();
      input.value = '';
      create.reset();
      hideCreate();
      hidePeople();
      setNavigation(false);
      add.hidden = older.hidden = jump.hidden = empty.hidden = signin.hidden = true;
      $('#chat-name').textContent = '';
      $('#chat-topic').textContent = '';
      composer();
      showStatus();
    }
    function view(identity, name, requested) {
      const changedUser = user?.id !== identity.id;
      if (changedUser) reset();
      user = identity;
      const entering = name === 'chat';
      const slug = requested || lastChannel;
      if (!changedUser && active === entering && (!entering || room?.slug === slug)) return;
      const wasActive = active;
      active = entering;
      setNavigation(false);
      room = undefined;
      log.replaceChildren();
      hideCreate();
      hidePeople();
      showStatus();
      add.hidden = user.role !== 'owner';
      if (active) {
        room = { slug, first: 0, last: 0, seen: 0, ready: false };
        lastChannel = slug;
        const fragment = slug.startsWith('@') ? 'dm=' + encodeURIComponent(slug.slice(1)) : 'channel=' + encodeURIComponent(slug);
        history.replaceState(null, '', location.pathname + location.search + '#view=chat&' + fragment);
        roomHeading([...channelList, ...directList].find(c => c.slug === slug));
        empty.hidden = older.hidden = jump.hidden = true;
        older.disabled = false;
        input.value = draft(slug).text;
        showStatus('Loading conversation…', 'loading');
      } else if (wasActive && new URLSearchParams(location.hash.slice(1)).get('view') === 'chat') {
        history.replaceState(null, '', location.pathname + location.search + '#view=' + encodeURIComponent(name));
      }
      renderChannels();
      composer();
      restart();
    }
    older.addEventListener('click', async () => {
      const current = room;
      if (!current?.first || older.disabled) return;
      older.disabled = true;
      try {
        const page = await api('chat-history', { channel: current.slug, before: current.first });
        if (room !== current) return;
        const height = scroll.scrollHeight, top = scroll.scrollTop;
        insert(page.messages, true);
        older.hidden = !page.hasMore;
        scroll.scrollTop = top + scroll.scrollHeight - height;
      } catch (error) { if (room === current) showStatus(error.message, 'error'); }
      finally { if (room === current) older.disabled = false; }
    });
    scroll.addEventListener('scroll', () => { if (nearBottom()) { jump.hidden = true; markVisible(); } }, { passive: true });
    jump.addEventListener('click', () => { scroll.scrollTop = scroll.scrollHeight; jump.hidden = true; markVisible(); });
    input.addEventListener('input', () => {
      if (!room) return;
      const item = draft(room.slug);
      item.text = input.value;
      item.requestId = null;
      composer();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        if (!send.disabled) compose.requestSubmit();
      }
    });
    reply.querySelector('button').addEventListener('click', () => {
      const item = draft(room.slug);
      item.replyTo = item.requestId = null;
      composer();
      input.focus();
    });
    compose.addEventListener('submit', async event => {
      event.preventDefault();
      if (!room?.ready || send.disabled) return;
      const slug = room.slug, item = draft(slug);
      item.requestId ||= crypto.randomUUID();
      item.sending = true;
      composer();
      showStatus();
      try {
        await api('chat-send', { channel: slug, body: item.text, replyTo: item.replyTo?.id, requestId: item.requestId });
        if (drafts.get(slug) !== item) return;
        drafts.delete(slug);
        if (room?.slug === slug) {
          room.follow = true;
          input.value = '';
          input.focus();
        }
        restart();
      } catch (error) { if (room?.slug === slug) showStatus(error.message + ' Your draft is saved in this tab.', 'error'); }
      finally { item.sending = false; composer(); }
    });
    add.addEventListener('click', () => {
      if (!create.hidden) { hideCreate(); return; }
      hidePeople();
      create.hidden = false;
      add.setAttribute('aria-expanded', 'true');
      create.elements.name.focus();
    });
    railToggle.addEventListener('click', () => {
      const open = panel.dataset.navOpen !== 'true';
      setNavigation(open);
      if (open) $('#chat-nav [aria-current="true"]')?.focus({ preventScroll: true });
      else markVisible();
    });
    $('#chat-nav').addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented || panel.dataset.navOpen !== 'true') return;
      setNavigation(false);
      railToggle.focus();
      markVisible();
    });
    newDirect.addEventListener('click', openPeople);
    firstDirect.addEventListener('click', openPeople);
    personSearch.addEventListener('input', showPeople);
    peoplePanel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); hidePeople(); newDirect.focus(); }
    });
    $('#chat-create-cancel').addEventListener('click', () => { hideCreate(); add.focus(); });
    create.addEventListener('submit', async event => {
      event.preventDefault();
      const button = create.querySelector('[type=submit]');
      if (button.disabled || !user) return;
      const creator = user.id;
      button.disabled = true;
      try {
        const { slug } = await api('chat-create-channel', { name: create.elements.name.value, topic: create.elements.topic.value });
        if (user?.id !== creator) return;
        create.reset();
        hideCreate();
        if (active) selectRoom(slug);
      } catch (error) { $('#chat-create-status').textContent = error.message; }
      finally { button.disabled = false; }
    });
    document.addEventListener('visibilitychange', restart);
    signin.addEventListener('click', event => { event.preventDefault(); location.reload(); });
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', restart);
    return { view, reset, startDirect() { if (peoplePanel.hidden) void openPeople(); } };
  }
  window.SdrTeamChat = { mount };
})();
