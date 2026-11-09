/* Your Home Timeline — agent dashboard */
(function () {
  "use strict";
  var Y = window.YHT, esc = Y.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var pane = $("#pane"), listEl = $("#tx-list");
  var state = { list: [], current: null, data: null, tab: "timeline", editing: null, filter: "" };
  var CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
  var ICON = {
    up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    del: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>'
  };

  if (Y.mode === "demo") {
    document.querySelectorAll("[data-demo]").forEach(function (e) { e.hidden = false; });
    $("[data-reset]").addEventListener("click", function () { Y.reset(); location.reload(); });
  }
  $("[data-signout]").addEventListener("click", function () { Y.signOut().then(function () { location.href = "index.html"; }); });
  $("#q").addEventListener("input", function (e) { state.filter = e.target.value.toLowerCase(); renderList(); });
  $("#new-btn").addEventListener("click", function () { state.current = null; renderList(); renderNew(); });

  function err(e) { Y.toast("<b>Couldn&rsquo;t save.</b> " + esc((e && e.message) || "Please try again."), "err"); console.error(e); }

  function boot() {
    var start = Y.mode === "demo" ? Y.signIn("agent@demo") : Promise.resolve();
    start.then(Y.user).then(function (u) {
      $("#loading").hidden = true;
      if (!u) return gate('<span class="eyebrow">Agent dashboard</span><h1 style="margin-top:12px;font-size:2rem">Please sign in</h1><div class="divider"><i></i></div><p>Sign in with your agent email to manage client timelines.</p><p style="margin-top:20px"><a class="btn" href="index.html#signin">Sign In</a></p>');
      return Y.canManage().then(function (ok) {
        if (!ok) return gate('<span class="eyebrow">Agent dashboard</span><h1 style="margin-top:12px;font-size:2rem">Not an agent account</h1><div class="divider"><i></i></div><p>' + esc(u.email) + ' isn&rsquo;t on the agent list. Add it to the <b>agents</b> table in Supabase (see README), then refresh.</p><p style="margin-top:20px"><a class="btn" href="portal.html">Go to my timeline</a></p>');
        $("#admin").hidden = false;
        return refreshList().then(function () {
          var want = new URLSearchParams(location.search).get("t") || Y.store("yht-agent-last");
          var pick = state.list.filter(function (t) { return t.id === want; })[0] || state.list[0];
          if (pick) select(pick.id); else renderNew();
        });
      });
    }).catch(function (e) { $("#loading").hidden = true; gate("<h2>Something went wrong</h2><p>" + esc(e.message || e) + "</p>"); });
  }
  function gate(html) { var g = $("#gate"); g.innerHTML = html; g.hidden = false; }

  function refreshList() { return Y.listTransactions().then(function (l) { state.list = l || []; renderList(); }); }

  function progress(t) {
    var s = t.steps || [], d = s.filter(function (x) { return x.done; }).length;
    return s.length ? Math.round(d / s.length * 100) : 0;
  }
  function renderList() {
    var l = state.list.filter(function (t) { return !state.filter || (t.client_name + " " + t.address + " " + t.city).toLowerCase().indexOf(state.filter) > -1; });
    listEl.innerHTML = l.length ? l.map(function (t) {
      return '<li><button type="button" data-id="' + esc(t.id) + '" aria-current="' + (t.id === state.current) + '"><b>' + esc(t.client_name) + '</b><small>' + (t.side === "seller" ? "Selling" : "Buying") + ' &middot; ' + esc(t.address || "Address TBD") + '</small><div class="mini-bar"><span style="width:' + progress(t) + '%"></span></div></button></li>';
    }).join("") : '<li style="padding:14px;color:var(--ink-soft);font-size:.9rem">No clients yet.</li>';
    listEl.querySelectorAll("button[data-id]").forEach(function (b) { b.addEventListener("click", function () { select(b.getAttribute("data-id")); }); });
  }

  function select(id) {
    state.current = id; state.editing = null; Y.store("yht-agent-last", id);
    history.replaceState(null, "", "?t=" + id);
    renderList();
    return reload();
  }
  function reload() {
    return Y.getTransaction(state.current).then(function (d) {
      state.data = d;
      if (d.tx.side !== "seller" && (state.tab === "feedback" || state.tab === "openhouses")) state.tab = "timeline";
      // keep sidebar progress in sync
      state.list.forEach(function (t) { if (t.id === d.tx.id) { Object.assign(t, d.tx); t.steps = d.steps.map(function (s) { return { done: s.done }; }); } });
      renderList(); renderPane();
    }).catch(err);
  }

  /* ---------------- detail pane ---------------- */
  function renderPane() {
    var d = state.data, tx = d.tx, seller = tx.side === "seller";
    var done = d.steps.filter(function (s) { return s.done; }).length;
    var tabs = [["timeline", "Timeline", d.steps.length]];
    if (seller) { tabs.push(["feedback", "Showing Feedback", d.feedback.length]); tabs.push(["openhouses", "Open Houses", d.openHouses.length]); }
    tabs.push(["updates", "Post Update", d.events.length]); tabs.push(["details", "Home & Client", null]);
    var html = '<div class="admin-head"><div><span class="side-badge ' + (seller ? "" : "buyer") + '">' + (seller ? "Seller" : "Buyer") + '</span>' +
      '<h1 style="margin-top:10px">' + esc(tx.client_name) + '</h1><p>' + esc(tx.address) + (tx.city ? ", " + esc(tx.city) : "") + ' &middot; ' + done + ' of ' + d.steps.length + ' steps done</p></div>' +
      '<div class="btn-row"><a class="btn ghost" href="portal.html?t=' + esc(tx.id) + '" target="_blank" rel="noopener">View Client Page</a></div></div>' +
      '<label class="switch" style="margin-bottom:18px"><input type="checkbox" id="alerts" ' + (tx.alerts_enabled ? "checked" : "") + '> Send alerts to ' + (tx.client_emails && tx.client_emails.length ? esc(tx.client_emails.join(", ")) : "<em>no client email yet: add one under Home &amp; Client</em>") + '</label>' +
      '<div class="atabs" role="tablist">' + tabs.map(function (t) {
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '">' + t[1] + (t[2] != null ? '<span class="count">' + t[2] + '</span>' : "") + '</button>';
      }).join("") + '</div><div id="tabbody"></div>';
    pane.innerHTML = html;
    pane.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { state.tab = b.getAttribute("data-tab"); renderPane(); }); });
    $("#alerts").addEventListener("change", function (e) {
      Y.updateTransaction(tx.id, { alerts_enabled: e.target.checked }).then(function () { tx.alerts_enabled = e.target.checked; Y.toast(e.target.checked ? "Alerts on for this client." : "Alerts paused for this client."); }).catch(err);
    });
    ({ timeline: tabTimeline, feedback: tabFeedback, openhouses: tabOpenHouses, updates: tabUpdates, details: tabDetails })[state.tab]($("#tabbody"));
  }

  function tabTimeline(el) {
    var steps = state.data.steps, txId = state.data.tx.id;
    el.innerHTML = '<p class="help" style="margin:0 0 12px">Click a circle to check off a step. The client gets an alert the moment you do.</p><ul class="step-edit">' + steps.map(function (s, i) {
      if (state.editing === s.id) {
        return '<li><span></span><form class="step-inline" data-edit="' + esc(s.id) + '"><input name="title" value="' + esc(s.title) + '" required aria-label="Step name"><textarea name="description" rows="2" aria-label="Description">' + esc(s.description) + '</textarea>' +
          '<label style="margin:0">Planned date <input name="due_date" type="date" value="' + esc(s.due_date || "") + '" style="margin-top:6px"></label>' +
          '<div class="form-actions" style="margin-top:4px"><button class="btn small" type="submit">Save</button><button class="btn ghost small" type="button" data-cancel>Cancel</button></div></form><span></span></li>';
      }
      return '<li class="' + (s.done ? "done" : "") + '"><button type="button" class="chk" data-toggle="' + esc(s.id) + '" aria-pressed="' + s.done + '" aria-label="' + (s.done ? "Mark not done: " : "Mark done: ") + esc(s.title) + '">' + (s.done ? CHECK : "") + '</button>' +
        '<div><b>' + esc(s.title) + '</b>' + (s.description ? '<small>' + esc(s.description) + '</small>' : "") +
        '<div class="meta">' + (s.done ? "Done " + Y.fmtDate(s.done_at) : (s.due_date ? "Planned " + Y.fmtDate(s.due_date) : "")) + '</div></div>' +
        '<div class="tools"><button class="icon-btn" type="button" data-move="-1" data-id="' + esc(s.id) + '" aria-label="Move up" ' + (i === 0 ? "disabled" : "") + '>' + ICON.up + '</button>' +
        '<button class="icon-btn" type="button" data-move="1" data-id="' + esc(s.id) + '" aria-label="Move down" ' + (i === steps.length - 1 ? "disabled" : "") + '>' + ICON.down + '</button>' +
        '<button class="icon-btn" type="button" data-editstep="' + esc(s.id) + '" aria-label="Edit step">' + ICON.edit + '</button>' +
        '<button class="icon-btn" type="button" data-delstep="' + esc(s.id) + '" aria-label="Delete step">' + ICON.del + '</button></div></li>';
    }).join("") + '</ul>' +
      '<form class="step-form" id="add-step"><div><label for="ns-t">Add a step</label><input id="ns-t" name="title" required placeholder="e.g. Radon test"></div><div><label for="ns-d">Description (optional)</label><input id="ns-d" name="description" placeholder="What happens in this step"></div><button class="btn small" type="submit" style="height:48px">Add Step</button></form>';

    el.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = steps.filter(function (x) { return x.id === b.getAttribute("data-toggle"); })[0];
        b.disabled = true;
        Y.setStepDone(s.id, !s.done).then(function () {
          if (!s.done && Y.mode === "live") Y.toast(state.data.tx.alerts_enabled ? "<b>Checked off.</b> Alert is on its way to the client." : "<b>Checked off.</b> Alerts are paused, so no email was sent.");
          return reload();
        }).catch(err);
      });
    });
    el.querySelectorAll("[data-move]").forEach(function (b) { b.addEventListener("click", function () { Y.moveStep(b.getAttribute("data-id"), +b.getAttribute("data-move")).then(reload).catch(err); }); });
    el.querySelectorAll("[data-editstep]").forEach(function (b) { b.addEventListener("click", function () { state.editing = b.getAttribute("data-editstep"); renderPane(); }); });
    el.querySelectorAll("[data-delstep]").forEach(function (b) {
      b.addEventListener("click", function () { if (confirmDelete("this step")) Y.deleteRow("steps", b.getAttribute("data-delstep")).then(reload).catch(err); });
    });
    var ef = el.querySelector("[data-edit]");
    if (ef) {
      ef.querySelector("[data-cancel]").addEventListener("click", function () { state.editing = null; renderPane(); });
      ef.addEventListener("submit", function (e) {
        e.preventDefault();
        Y.updateStep(ef.getAttribute("data-edit"), { title: ef.elements.title.value.trim(), description: ef.description.value.trim(), due_date: ef.due_date.value || null })
          .then(function () { state.editing = null; return reload(); }).catch(err);
      });
    }
    $("#add-step").addEventListener("submit", function (e) {
      e.preventDefault(); var f = e.target;
      Y.addStep(txId, f.elements.title.value.trim(), f.elements.description.value.trim()).then(reload).catch(err);
    });
  }

  function confirmDelete(what) { return window.confirm("Delete " + what + "? This can't be undone."); }

  function tabFeedback(el) {
    var today = new Date().toISOString().slice(0, 10), fb = state.data.feedback;
    el.innerHTML = '<div class="panel"><h2>Add showing feedback</h2><p class="hint">Saving sends the seller an alert with the comments.</p><form id="fb-form"><div class="fgrid">' +
      '<div><label for="fb-date">Showing date</label><input id="fb-date" name="showing_date" type="date" value="' + today + '" required></div>' +
      '<div><label for="fb-agent">Buyer&rsquo;s agent / brokerage</label><input id="fb-agent" name="showing_agent" placeholder="e.g. Buyer\'s agent, Hegg Realtors"></div>' +
      '<div><label id="fb-int">Buyer interest</label><div class="rate" role="radiogroup" aria-labelledby="fb-int">' + [1, 2, 3, 4, 5].map(function (n) { return '<label><input type="radio" name="interest" value="' + n + '"><span>' + n + '</span></label>'; }).join("") + '</div><span class="help">1 = not interested, 5 = very interested</span></div>' +
      '<div><label for="fb-price">Their take on price</label><select id="fb-price" name="price_opinion"><option value="">No comment</option><option value="low">Priced low</option><option value="right">About right</option><option value="high">Priced high</option></select></div>' +
      '<div class="full"><label for="fb-c">Comments</label><textarea id="fb-c" name="comments" rows="4" placeholder="What did the buyers like or not like?"></textarea></div>' +
      '</div><div class="form-actions"><button class="btn" type="submit">Save &amp; Notify Seller</button></div></form></div>' +
      '<div class="panel"><h2>Feedback so far</h2><div class="rows-list">' + (fb.length ? fb.map(function (f) {
        return '<div class="row-item"><div><b>' + Y.fmtDate(f.showing_date) + '</b> &middot; ' + esc(f.showing_agent || "Showing") + (f.interest ? ' &middot; interest ' + f.interest + '/5' : "") + (f.price_opinion ? ' &middot; price ' + esc({ low: "low", right: "about right", high: "high" }[f.price_opinion]) : "") + '<p>' + esc(f.comments) + '</p></div><button class="icon-btn" type="button" data-del="' + esc(f.id) + '" aria-label="Delete feedback">' + ICON.del + '</button></div>';
      }).join("") : '<p class="empty-state">None yet.</p>') + '</div></div>';
    $("#fb-form").addEventListener("submit", function (e) {
      e.preventDefault(); var f = e.target, i = f.querySelector("[name=interest]:checked");
      if (!f.comments.value.trim() && !i) { Y.toast("Add a rating or a comment first.", "err"); return; }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      Y.addFeedback(state.data.tx.id, { showing_date: f.showing_date.value, showing_agent: f.showing_agent.value.trim(), interest: i ? +i.value : null, price_opinion: f.price_opinion.value || null, comments: f.comments.value.trim() })
        .then(function () { if (Y.mode === "live") Y.toast("<b>Feedback saved.</b> The seller has been notified."); return reload(); }).catch(function (e) { btn.disabled = false; err(e); });
    });
    bindDeletes(el, "feedback");
  }

  function tabOpenHouses(el) {
    var today = new Date().toISOString().slice(0, 10), list = state.data.openHouses;
    el.innerHTML = '<div class="panel"><h2>Add an open house recap</h2><p class="hint">Saving sends the seller an alert with the results.</p><form id="oh-form"><div class="fgrid">' +
      '<div><label for="oh-date">Date</label><input id="oh-date" name="date" type="date" value="' + today + '" required></div>' +
      '<div><label for="oh-time">Time</label><input id="oh-time" name="time_range" placeholder="1:00 – 3:00 PM"></div>' +
      '<div><label for="oh-v">Visitors</label><input id="oh-v" name="visitors" type="number" min="0" value="0" inputmode="numeric"></div>' +
      '<div><label for="oh-i">Serious buyers</label><input id="oh-i" name="interested" type="number" min="0" value="0" inputmode="numeric"></div>' +
      '<div class="full"><label for="oh-n">How it went</label><textarea id="oh-n" name="notes" rows="4" placeholder="Traffic, what people liked, questions that came up, follow-ups"></textarea></div>' +
      '</div><div class="form-actions"><button class="btn" type="submit">Save &amp; Notify Seller</button></div></form></div>' +
      '<div class="panel"><h2>Past open houses</h2><div class="rows-list">' + (list.length ? list.map(function (o) {
        return '<div class="row-item"><div><b>' + Y.fmtDate(o.date) + '</b> ' + esc(o.time_range || "") + ' &middot; ' + (o.visitors || 0) + ' visitors &middot; ' + (o.interested || 0) + ' serious<p>' + esc(o.notes) + '</p></div><button class="icon-btn" type="button" data-del="' + esc(o.id) + '" aria-label="Delete open house">' + ICON.del + '</button></div>';
      }).join("") : '<p class="empty-state">None yet.</p>') + '</div></div>';
    $("#oh-form").addEventListener("submit", function (e) {
      e.preventDefault(); var f = e.target, btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      Y.addOpenHouse(state.data.tx.id, { date: f.date.value, time_range: f.time_range.value.trim(), visitors: +f.visitors.value || 0, interested: +f.interested.value || 0, notes: f.notes.value.trim() })
        .then(function () { if (Y.mode === "live") Y.toast("<b>Open house saved.</b> The seller has been notified."); return reload(); }).catch(function (e) { btn.disabled = false; err(e); });
    });
    bindDeletes(el, "open_houses");
  }

  function tabUpdates(el) {
    var ev = state.data.events;
    el.innerHTML = '<div class="panel"><h2>Post an update</h2><p class="hint">For anything that isn&rsquo;t a checklist step: a scheduled inspection, a price change, a heads-up. The client gets an alert.</p><form id="up-form"><div class="fgrid">' +
      '<div class="full"><label for="up-t">Headline</label><input id="up-t" name="title" required placeholder="e.g. Appraisal scheduled for Thursday"></div>' +
      '<div class="full"><label for="up-b">Message</label><textarea id="up-b" name="body" rows="4" placeholder="Details for your client"></textarea></div>' +
      '</div><div class="form-actions"><button class="btn" type="submit">Post &amp; Notify</button></div></form></div>' +
      '<div class="panel"><h2>Activity the client sees</h2><div class="rows-list">' + (ev.length ? ev.map(function (e) {
        return '<div class="row-item"><div><b>' + esc(e.title) + '</b> <small style="color:var(--ink-soft)">&middot; ' + Y.fmtWhen(e.created_at) + (Y.mode === "live" ? (e.notified_at ? " &middot; alert sent" : "") : "") + '</small>' + (e.body ? '<p>' + esc(e.body) + '</p>' : "") + '</div><button class="icon-btn" type="button" data-del="' + esc(e.id) + '" aria-label="Remove from activity">' + ICON.del + '</button></div>';
      }).join("") : '<p class="empty-state">Nothing yet.</p>') + '</div></div>';
    $("#up-form").addEventListener("submit", function (e) {
      e.preventDefault(); var f = e.target, btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      Y.addUpdate(state.data.tx.id, f.elements.title.value.trim(), f.body.value.trim())
        .then(function () { if (Y.mode === "live") Y.toast("<b>Update posted.</b> The client has been notified."); return reload(); }).catch(function (e) { btn.disabled = false; err(e); });
    });
    bindDeletes(el, "events");
  }

  function bindDeletes(el, table) {
    el.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () { if (confirmDelete("this item")) Y.deleteRow(table, b.getAttribute("data-del")).then(reload).catch(err); });
    });
  }

  /* ---------------- details / new client form ---------------- */
  function detailsForm(tx, isNew) {
    tx = tx || {};
    return '<form id="tx-form"><div class="fgrid">' +
      (isNew ? '<div class="full"><label>Client is</label><div style="display:flex;gap:22px;flex-wrap:wrap"><label class="switch"><input type="radio" name="side" value="seller" checked> Selling a home</label><label class="switch"><input type="radio" name="side" value="buyer"> Buying a home</label></div><span class="help">Starts them with the standard ' + 14 + '-step checklist. You can edit, add or remove steps after.</span></div>' : "") +
      '<div><label for="f-name">Client name(s)</label><input id="f-name" name="client_name" required value="' + esc(tx.client_name || "") + '" placeholder="Jordan &amp; Taylor Miller"></div>' +
      '<div><label for="f-email">Client email(s)</label><input id="f-email" name="client_emails" value="' + esc((tx.client_emails || []).join(", ")) + '" placeholder="jordan@email.com, taylor@email.com"><span class="help">They sign in with these. Separate several with commas.</span></div>' +
      '<div><label for="f-phone">Mobile number(s) for text alerts</label><input id="f-phone" name="client_phones" value="' + esc((tx.client_phones || []).join(", ")) + '" placeholder="(605) 555-0123"><span class="help">Optional. Used only if text alerts are set up.</span></div>' +
      '<div><label for="f-status">Status shown to client</label><input id="f-status" name="status_label" value="' + esc(tx.status_label || "") + '" placeholder="e.g. Coming soon, Active, Under contract"></div>' +
      '<div><label for="f-addr">Street address</label><input id="f-addr" name="address" value="' + esc(tx.address || "") + '" placeholder="4812 S Prairie Meadow Ave"><span class="help">Buyers still searching? Leave blank or write &ldquo;Home search.&rdquo;</span></div>' +
      '<div><label for="f-city">City, state, ZIP</label><input id="f-city" name="city" value="' + esc(tx.city || "") + '" placeholder="Sioux Falls, SD 57108"></div>' +
      '<div><label for="f-price">Price ($)</label><input id="f-price" name="price" type="number" min="0" step="100" value="' + esc(tx.price || "") + '"></div>' +
      '<div><label for="f-target">Target closing date</label><input id="f-target" name="target_date" type="date" value="' + esc(tx.target_date || "") + '"></div>' +
      '<div><label for="f-beds">Beds</label><input id="f-beds" name="beds" type="number" min="0" step="1" value="' + esc(tx.beds || "") + '"></div>' +
      '<div><label for="f-baths">Baths</label><input id="f-baths" name="baths" type="number" min="0" step="0.5" value="' + esc(tx.baths || "") + '"></div>' +
      '<div><label for="f-sqft">Square feet</label><input id="f-sqft" name="sqft" type="number" min="0" step="10" value="' + esc(tx.sqft || "") + '"></div>' +
      '<div><label for="f-mls">Listing link (optional)</label><input id="f-mls" name="mls_url" type="url" value="' + esc(tx.mls_url || "") + '" placeholder="https://"></div>' +
      '<div class="full"><label for="f-photo">Home photo</label><input id="f-photo" type="file" accept="image/*"><input name="photo_url" type="url" value="' + esc(tx.photo_url || "") + '" placeholder="…or paste an image link" style="margin-top:8px" aria-label="Photo link">' +
      '<div class="photo-prev" id="photo-prev" style="background-image:url(\'' + esc(tx.photo_url || "images/home-placeholder.svg") + '\')"></div></div>' +
      '</div><div class="form-actions"><button class="btn" type="submit">' + (isNew ? "Create Timeline" : "Save Changes") + '</button>' +
      (isNew ? '<span class="help">The client gets a welcome email with a link to sign in.</span>' : '<button class="btn danger" type="button" id="del-tx">Delete Client</button>') + '</div></form>';
  }
  function readForm(f) {
    var num = function (v) { return v === "" ? null : +v; };
    return {
      client_name: f.client_name.value.trim(), client_emails: Y.emails(f.client_emails.value), client_phones: Y.phones(f.client_phones.value),
      status_label: f.status_label.value.trim(), address: f.address.value.trim(), city: f.city.value.trim(), price: num(f.price.value),
      target_date: f.target_date.value || null, beds: num(f.beds.value), baths: num(f.baths.value), sqft: num(f.sqft.value),
      mls_url: f.mls_url.value.trim(), photo_url: f.photo_url.value.trim()
    };
  }
  function bindPhoto(f) {
    var prev = $("#photo-prev");
    f.photo_url.addEventListener("input", function () { prev.style.backgroundImage = "url('" + f.photo_url.value.replace(/'/g, "%27") + "')"; });
    $("#f-photo").addEventListener("change", function (e) {
      var file = e.target.files[0]; if (!file) return;
      Y.toast("Uploading photo…");
      Y.uploadPhoto(file).then(function (url) { f.photo_url.value = url; prev.style.backgroundImage = "url('" + url + "')"; Y.toast("Photo ready. Save to keep it."); }).catch(err);
    });
  }

  function tabDetails(el) {
    var tx = state.data.tx;
    el.innerHTML = '<div class="panel">' + detailsForm(tx, false) + '</div>';
    var f = $("#tx-form"); bindPhoto(f);
    f.addEventListener("submit", function (e) {
      e.preventDefault(); var data = readForm(f);
      if (!data.client_name) { Y.toast("Client name is required.", "err"); return; }
      Y.updateTransaction(tx.id, data).then(function () { Y.toast("Saved."); return reload(); }).catch(err);
    });
    $("#del-tx").addEventListener("click", function () {
      if (!confirmDelete(tx.client_name + "'s timeline, including all steps, feedback and open houses,")) return;
      Y.deleteTransaction(tx.id).then(function () { state.current = null; return refreshList(); }).then(function () { if (state.list[0]) select(state.list[0].id); else renderNew(); }).catch(err);
    });
  }

  function renderNew() {
    history.replaceState(null, "", "agent.html");
    pane.innerHTML = '<div class="admin-head"><div><span class="eyebrow">New client</span><h1 style="margin-top:10px">Start a home timeline</h1><p>Set up the home and client. You can fill in details as you go.</p></div></div><div class="panel">' + detailsForm(null, true) + '</div>';
    var f = $("#tx-form"); bindPhoto(f);
    f.addEventListener("submit", function (e) {
      e.preventDefault(); var data = readForm(f);
      data.side = f.querySelector("[name=side]:checked").value;
      if (!data.client_name) { Y.toast("Client name is required.", "err"); return; }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      Y.createTransaction(data).then(function (tx) {
        if (Y.mode === "live") Y.toast(data.client_emails.length ? "<b>Timeline created.</b> Welcome email sent." : "<b>Timeline created.</b> Add a client email to invite them.");
        state.tab = "timeline"; return refreshList().then(function () { return select(tx.id); });
      }).catch(function (e) { btn.disabled = false; err(e); });
    });
  }

  boot();
})();
