// sidebar toggle + active menu + role views + demo login gate - EduSense
(function () {
  var page = document.body.getAttribute('data-page');
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  // login gate: every app page needs a login first (login pages are exempt)
  if (page !== 'login' && read('campus-logged') !== '1') {
    location.href = 'login.html';
    return;
  }
  var btn = document.getElementById('menuBtn');
  var side = document.getElementById('side');
  if (btn && side) btn.addEventListener('click', function () { side.classList.toggle('open'); });
  if (page) {
    var links = document.querySelectorAll('.side a[data-nav]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-nav') === page) links[i].className += ' on';
    }
  }
  // logout link in sidebar footer (injected so every page gets it)
  var foot = document.querySelector('.side .foot');
  if (foot && !document.getElementById('logoutLink')) {
    var sep = document.createElement('div');
    sep.style.marginTop = '8px';
    var a = document.createElement('a');
    a.id = 'logoutLink';
    a.href = 'login.html';
    a.textContent = '⎋ Logout';
    a.style.color = '#dc2626';
    a.style.fontWeight = '700';
    a.style.textDecoration = 'none';
    a.addEventListener('click', function () {
      try { localStorage.removeItem('campus-logged'); } catch (e) {}
    });
    sep.appendChild(a);
    foot.appendChild(sep);
  }
  var NAMES = { admin: 'Staff', hod: 'Head of Dept', student: 'Student' };
  var SUBS = { admin: 'Admin · staff login', hod: 'HOD · department login', student: 'Student · awaiting login' };
  function applyRole(role) {
    document.body.setAttribute('data-role', role);
    store('campus-role', role);
    var blocks = document.querySelectorAll('[data-for]');
    for (var i = 0; i < blocks.length; i++) {
      var list = (blocks[i].getAttribute('data-for') || '').split(' ');
      blocks[i].classList.toggle('hide', list.indexOf(role) === -1);
    }
    var savedUser = read('campus-user');
    var nm = document.querySelector('[data-profile-name]');
    if (nm) nm.textContent = savedUser && savedUser.length ? savedUser : (NAMES[role] || 'User');
    var sb = document.querySelector('[data-profile-sub]');
    if (sb) sb.textContent = SUBS[role] || '';
    var gr = document.querySelector('[data-greet]');
    if (gr) gr.textContent = gr.getAttribute('data-greet-' + role) || gr.textContent;
  }
  var saved = read('campus-role');
  applyRole(saved === 'hod' || saved === 'student' ? saved : 'admin');
})();
