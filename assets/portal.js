/* Your Home Timeline — client portal */
(function () {
  "use strict";
  var Y = window.YHT, esc = Y.esc, A = Y.cfg.AGENT;
  var app = document.getElementById("app"), loading = document.getElementById("loading");
  var params = new URLSearchParams(location.search);
  var state = { list: [], current: null, data: null, agent: false, showAllFeed: false };
  var CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';

  if (Y.mode === "demo") {
    document.querySelectorAll("[data-demo]").forEach(function (e) { e.hidden = false; });
    var aa = document.querySelector("[data-as-agent]");
    if (aa) aa.target = "_blank";
  }
  document.querySelector("[data-signout]").addEventListener("click", function () {
    Y.signOut().then(function () { location.href = "index.html"; });
  });

  function lastSeenKey(id) { return "yht-seen-" + id; }

  function boot() {
    Y.user().then(function (u) {
      if (!u && Y.mode === "live") { location.replace("index.html#signin"); return; }
      return Y.isAgent().then(function (ag) {
        state.agent = ag;
        if (ag) document.querySelectorAll("[data-agent-only]").forEach(function (e) { e.hidden = false; });
        if (ag && !params.get("t") && Y.mode === "live") { location.replace("agent.html"); return; }
        return Y.listTransactions().then(function (list) {
          state.list = list || [];
          if (ag && params.get("t")) state.list = state.list.filter(function (t) { return t.id === params.get("t"); });
          if (!state.list.length) return renderNone(u);
          var want = params.get("t") || Y.store("yht-last-tx");
          state.current = (state.list.filter(function (t) { return t.id === want; })[0] || state.list[0]).id;
          return load();
        });
      });
    }).catch(fail);
  }

  function load(quiet) {
    return Y.getTransaction(state.current).then(function (d) {
      if (!d.tx) return renderNone();
      state.data = d; Y.store("yht-last-tx", state.current); render(quiet);
    }).catch(fail);
  }

  function fail(err) {
    loading.hidden = true; app.hidden = false;
    app.innerHTML = '<div class="wrap none-card"><h2>Something went wrong</h2><div class="divider"><i></i></div><p>' + esc((err && err.message) || "Please refresh the page.") + '</p><p style="margin-top:18px"><a class="btn" href="index.html">Back to sign in</a></p></div>';
  }

  function renderNone(u) {
    loading.hidden = true; app.hidden = false;
    app.innerHTML = '<div class="wrap none-card"><span class="eyebrow">Almost there</span><h2 style="margin-top:12px">Your timeline isn&rsquo;t set up yet</h2><div class="divider"><i></i></div>' +
      '<p>We couldn&rsquo;t find a home linked to ' + esc(u && u.email ? u.email : "this email") + '. If Landon used a different address for you, sign out and try that one, or reach out and he&rsquo;ll get you connected.</p>' +
      '<div class="btn-row" style="justify-content:center;margin-top:22px"><a class="btn" href="tel:' + esc(A.phone) + '">Call ' + esc(A.phoneDisplay) + '</a><a class="btn ghost" href="mailto:' + esc(A.email) + '">Email Landon</a></div></div>';
  }

  function render(quiet) {
    var d = state.data, tx = d.tx, steps = d.steps, seller = tx.side === "seller";
    var seen = Y.store(lastSeenKey(tx.id)) || "";
    var done = steps.filter(function (s) { return s.done; }).length, total = steps.length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var curIdx = -1; for (var i = 0; i < steps.length; i++) { if (!steps[i].done) { curIdx = i; break; } }
    var cur = curIdx > -1 ? steps[curIdx] : null;
    document.querySelectorAll("[data-seller-only]").forEach(function (e) { e.hidden = !seller; });
    document.title = (tx.address || "My Timeline") + " | Your Home Timeline";

    var tabs = state.list.length > 1 ? '<div class="tx-tabs" role="tablist" aria-label="Your homes">' + state.list.map(function (t) {
      return '<button class="tx-tab" role="tab" data-tx="' + esc(t.id) + '" aria-selected="' + (t.id === tx.id) + '">' + (t.side === "seller" ? "Selling: " : "Buying: ") + esc(t.address || t.client_name) + '</button>';
    }).join("") + '</div>' : "";

    var facts = [];
    if (tx.beds) facts.push("<b>" + esc(tx.beds) + "</b> Beds");
    if (tx.baths) facts.push("<b>" + esc(tx.baths) + "</b> Baths");
    if (tx.sqft) facts.push("<b>" + Number(tx.sqft).toLocaleString() + "</b> Sq Ft");
    var targetLbl = seller ? "Target closing" : "Target closing";

    var html = '<section class="portal-top"><div class="wrap">' + tabs +
      '<div class="home-card"><div class="ph" style="background-image:url(\'' + esc(tx.photo_url || "images/home-placeholder.svg") + '\')" role="img" aria-label="Photo of ' + esc(tx.address) + '">' +
      '<span class="side side-badge ' + (seller ? "" : "buyer") + '">' + (seller ? "Selling" : "Buying") + '</span></div>' +
      '<div class="info"><span class="eyebrow">Welcome, ' + esc(tx.client_name) + '</span>' +
      '<h1>' + esc(tx.address || "Your new home") + '</h1>' + (tx.city ? '<div class="city">' + esc(tx.city) + '</div>' : "") +
      (tx.price ? '<div class="price">' + Y.money(tx.price) + (seller ? "" : "") + '</div>' : "") +
      (facts.length ? '<div class="facts">' + facts.join("") + '</div>' : "") +
      (tx.status_label ? '<span class="status">' + esc(tx.status_label) + '</span>' : "") +
      '<div class="progress"><div class="lbl"><span><b>' + done + '</b> of ' + total + ' steps complete</span><span>' + pct + '%</span></div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progress"><span style="width:' + pct + '%"></span></div></div>' +
      (cur ? '<div class="next-up"><small>Up next</small><b>' + esc(cur.title) + '</b>' + (cur.due_date ? ' &middot; ' + Y.fmtDate(cur.due_date, { weekday: "short", month: "short", day: "numeric" }) : "") + '</div>'
           : '<div class="next-up"><small>All done</small><b>Congratulations! Every step is complete.</b></div>') +
      (tx.target_date ? '<div class="facts" style="margin-top:4px">' + targetLbl + ': <b>' + Y.fmtDate(tx.target_date, { weekday: "short", month: "long", day: "numeric" }) + '</b></div>' : "") +
      (tx.mls_url ? '<a href="' + esc(tx.mls_url) + '" target="_blank" rel="noopener" style="color:var(--gold-deep);font-size:.9rem">View the listing &rarr;</a>' : "") +
      '</div></div></div></section>';

    /* left column */
    var left = '<div class="panel" id="timeline"><span class="eyebrow">Your timeline</span><h2>' + (seller ? "Selling your home" : "Buying your home") + '</h2>' +
      '<p class="hint">Each step gets checked off as it&rsquo;s done. You&rsquo;ll get an email every time.</p><ol class="timeline">' +
      steps.map(function (s, i) {
        var cls = s.done ? "done" : (i === curIdx ? "current" : "");
        var isNew = s.done && s.done_at && seen && s.done_at > seen;
        var when = s.done ? "Done " + Y.fmtDate(s.done_at, { month: "short", day: "numeric" }) : (i === curIdx ? (s.due_date ? "In progress &middot; planned " + Y.fmtDate(s.due_date, { month: "short", day: "numeric" }) : "In progress") : (s.due_date ? "Planned " + Y.fmtDate(s.due_date, { month: "short", day: "numeric" }) : ""));
        return '<li class="' + cls + '"><span class="dot">' + (s.done ? CHECK : "") + '</span><h3>' + esc(s.title) + (isNew ? '<span class="new">New</span>' : "") + '</h3>' +
          (s.description ? '<p>' + esc(s.description) + '</p>' : "") + (when ? '<span class="when">' + when + '</span>' : "") +
          '<span class="sr-only" style="position:absolute;left:-9999px">' + (s.done ? "Completed" : (i === curIdx ? "Current step" : "Not started")) + '</span></li>';
      }).join("") + '</ol></div>';

    if (seller) left += feedbackPanel(d.feedback) + openHousePanel(d.openHouses);

    /* right column */
    var evs = d.events, shown = state.showAllFeed ? evs : evs.slice(0, 6);
    var right = '<div class="panel"><span class="eyebrow">Your agent</span><div class="agent-card" style="margin-top:8px"><img src="' + esc(A.photo) + '" alt="' + esc(A.name) + '" width="76" height="76"><div><b>' + esc(A.name) + '</b><small>' + esc(A.title) + '</small></div></div>' +
      '<div class="agent-actions"><a href="tel:' + esc(A.phone) + '">Call</a><a href="sms:' + esc(A.phone) + '">Text</a><a href="mailto:' + esc(A.email) + '?subject=' + encodeURIComponent(tx.address || "My home") + '">Email</a></div>' +
      '<p class="alerts-note">' + (tx.alerts_enabled ? "Email alerts are on. You&rsquo;ll hear from us each time a step is done" + (seller ? ", feedback comes in, or an open house wraps up." : " or there&rsquo;s news.") : "Alerts are paused for this home. Check back here for updates.") + '</p></div>' +
      '<div class="panel" id="updates"><span class="eyebrow">Latest updates</span><h2>Activity</h2><ul class="feed" style="margin-top:12px">' +
      (shown.length ? shown.map(function (e) {
        var unread = seen && e.created_at > seen;
        return '<li class="' + (unread ? "unread" : "") + '"><b>' + esc(e.title) + '</b>' + (e.body ? '<p>' + esc(trim(e.body, 220)) + '</p>' : "") + '<time datetime="' + esc(e.created_at) + '">' + Y.fmtWhen(e.created_at) + (unread ? " &middot; new" : "") + '</time></li>';
      }).join("") : '<li class="empty-state">Updates will show up here.</li>') + '</ul>' +
      (evs.length > 6 && !state.showAllFeed ? '<button class="more" type="button" data-allfeed>Show all ' + evs.length + ' updates</button>' : "") + '</div>';

    html += '<section style="padding:10px 0 70px"><div class="wrap portal-grid"><div>' + left + '</div><div>' + right + '</div></div></section>';

    var y = window.scrollY;
    app.innerHTML = html; loading.hidden = true; app.hidden = false;
    if (quiet) window.scrollTo(0, y);
    app.querySelectorAll("[data-tx]").forEach(function (b) {
      b.addEventListener("click", function () { state.current = b.getAttribute("data-tx"); state.showAllFeed = false; history.replaceState(null, "", "?t=" + state.current); load(); });
    });
    var more = app.querySelector("[data-allfeed]");
    if (more) more.addEventListener("click", function () { state.showAllFeed = true; render(true); });

    // remember when they last looked (after a short delay so "new" markers are seen first)
    var latest = evs[0] ? evs[0].created_at : new Date().toISOString();
    if (!seen) Y.store(lastSeenKey(tx.id), latest);
    clearTimeout(state.seenTimer);
    state.seenTimer = setTimeout(function () { Y.store(lastSeenKey(tx.id), latest); }, 8000);
  }

  function trim(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; }

  function interestDots(n) {
    var h = '<span class="interest" aria-label="Interest ' + (n || 0) + ' out of 5">';
    for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= n ? "on" : "") + '"></i>';
    return h + '<span>' + (["", "Not interested", "Slight", "Somewhat", "Interested", "Very interested"][n] || "") + '</span></span>';
  }
  var PRICE = { low: "Feels priced low", right: "Price feels right", high: "Feels priced high" };

  function feedbackPanel(fb) {
    var h = '<div class="panel" id="feedback"><span class="eyebrow">Showing feedback</span><h2>What buyers are saying</h2><p class="hint">Comments from buyers&rsquo; agents after each showing.</p>';
    if (!fb.length) return h + '<p class="empty-state">No showing feedback yet. It will appear here after your first showings.</p></div>';
    var rated = fb.filter(function (f) { return f.interest; });
    var avg = rated.length ? (rated.reduce(function (a, f) { return a + f.interest; }, 0) / rated.length) : 0;
    var c = { low: 0, right: 0, high: 0 }, cn = 0;
    fb.forEach(function (f) { if (c[f.price_opinion] != null) { c[f.price_opinion]++; cn++; } });
    h += '<div class="fb-sum"><div><b>' + fb.length + '</b><span>Showings</span></div><div><b>' + (avg ? avg.toFixed(1) : "–") + '<small style="font-size:.9rem">/5</small></b><span>Avg. interest</span></div><div><b>' + (cn ? Math.round(c.right / cn * 100) + "%" : "–") + '</b><span>Say price is right</span></div></div>';
    if (cn) {
      h += '<div class="price-split" aria-hidden="true">' + ["low", "right", "high"].map(function (k) { return c[k] ? '<i class="pi-' + k + '" style="width:' + (c[k] / cn * 100) + '%"></i>' : ""; }).join("") + '</div>' +
        '<div class="legend"><span><i class="pi-low"></i>Priced low (' + c.low + ')</span><span><i class="pi-right"></i>About right (' + c.right + ')</span><span><i class="pi-high"></i>Priced high (' + c.high + ')</span></div>';
    }
    h += fb.map(function (f) {
      return '<div class="fb"><div class="fb-head"><div><b>Showing ' + Y.fmtDate(f.showing_date, { weekday: "short", month: "short", day: "numeric" }) + '</b>' + (f.showing_agent ? '<small>' + esc(f.showing_agent) + '</small>' : "") + '</div>' + (f.interest ? interestDots(f.interest) : "") + '</div>' +
        (f.comments ? '<p>&ldquo;' + esc(f.comments) + '&rdquo;</p>' : "") + (f.price_opinion ? '<span class="tag ' + esc(f.price_opinion) + '">' + PRICE[f.price_opinion] + '</span>' : "") + '</div>';
    }).join("");
    return h + '</div>';
  }

  function openHousePanel(list) {
    var h = '<div class="panel" id="openhouses"><span class="eyebrow">Open houses</span><h2>How the open houses went</h2><p class="hint">A recap after every open house.</p>';
    if (!list.length) return h + '<p class="empty-state">No open houses yet. Recaps will appear here.</p></div>';
    var tv = list.reduce(function (a, o) { return a + (o.visitors || 0); }, 0);
    h += '<div class="fb-sum"><div><b>' + list.length + '</b><span>Open houses</span></div><div><b>' + tv + '</b><span>Total visitors</span></div><div><b>' + list.reduce(function (a, o) { return a + (o.interested || 0); }, 0) + '</b><span>Serious buyers</span></div></div>';
    h += list.map(function (o) {
      return '<div class="oh"><div class="oh-head"><b>' + Y.fmtDate(o.date, { weekday: "long", month: "short", day: "numeric" }) + '</b><small>' + esc(o.time_range || "") + '</small></div>' +
        '<div class="oh-nums"><div><b>' + (o.visitors || 0) + '</b><span>Visitors</span></div><div><b>' + (o.interested || 0) + '</b><span>Serious buyers</span></div></div>' +
        (o.notes ? '<p>' + esc(o.notes) + '</p>' : "") + '</div>';
    }).join("");
    return h + '</div>';
  }

  // keep it fresh: re-check every minute while the page is open, and instantly across tabs in preview mode
  setInterval(function () { if (state.current && !document.hidden) load(true); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && state.current) load(true); });
  window.addEventListener("storage", function (e) {
    if (e.key === "yht-demo-v1" && state.current) {
      var before = state.data ? state.data.events.length : 0;
      load(true).then(function () {
        var after = state.data ? state.data.events.length : 0;
        if (after > before) Y.toast("<b>New update</b> " + esc(state.data.events[0].title));
      });
    }
  });

  boot();
})();
