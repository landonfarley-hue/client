/* Your Home Timeline — shared data layer + helpers.
   Two back ends behind one API:
   - live: Supabase (auth by email link, Postgres with row-level security, alerts sent by the "notify" function)
   - demo: sample data kept in this browser's localStorage, so the site can be previewed before Supabase is set up */
(function () {
  "use strict";
  var CFG = window.YHT_CONFIG || {};
  var KEY = CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_ANON_KEY || "";
  if (/^sb_secret_/.test(KEY)) { KEY = ""; console.error("A Supabase SECRET key was put in config.js. It has been ignored. Use the publishable key and rotate the secret key."); }
  var LIVE = !!(CFG.SUPABASE_URL && KEY);

  /* ---------------- step templates ---------------- */
  var TEMPLATES = {
    seller: [
      ["Listing consultation", "We walk through your home, your goals and your timeline."],
      ["Listing agreement signed", "Paperwork is done and we're officially a team."],
      ["Pricing strategy set", "List price chosen from recent sales and current competition."],
      ["Prep & staging", "Small fixes, cleaning and staging so the home shows its best."],
      ["Photos & video", "Professional photography and media scheduled and delivered."],
      ["Live on the MLS", "Your home is published and syndicated to the major home search sites."],
      ["Showings & open houses", "Buyers are touring. Feedback shows up below as it comes in."],
      ["Offer accepted", "We've agreed on price and terms. You're under contract!"],
      ["Buyer's inspection", "The buyer's inspector visits the home."],
      ["Inspection items resolved", "Any repair requests are negotiated and settled."],
      ["Appraisal complete", "The lender's appraiser confirms the value."],
      ["Buyer clear to close", "The buyer's loan has final approval."],
      ["Final walkthrough", "The buyer does one last visit before closing."],
      ["Closed — congratulations!", "Papers signed, funds transferred, keys handed over."]
    ],
    buyer: [
      ["Buyer consultation", "We talk through what you want, where, and your budget."],
      ["Pre-approval letter", "Your lender confirms how much you can borrow."],
      ["Buyer agreement signed", "Paperwork is done and we're officially a team."],
      ["Touring homes", "We're out looking. Favorites and notes land in your updates."],
      ["Offer submitted", "We've written an offer on a home you love."],
      ["Offer accepted", "The seller said yes. You're under contract!"],
      ["Earnest money delivered", "Your good-faith deposit is with the title company."],
      ["Home inspection", "A professional inspector goes through the home with us."],
      ["Inspection items resolved", "Any repair requests are negotiated and settled."],
      ["Appraisal complete", "The lender's appraiser confirms the value."],
      ["Homeowner's insurance in place", "Your policy is bound and sent to the lender."],
      ["Clear to close", "Your loan has final approval."],
      ["Final walkthrough", "One last look before you sign."],
      ["Closed — welcome home!", "Papers signed, keys in hand."]
    ]
  };

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function nowISO() { return new Date().toISOString(); }
  function fmtDate(d, opts) {
    if (!d) return "";
    var dt = typeof d === "string" && d.length === 10 ? new Date(d + "T12:00:00") : new Date(d);
    if (isNaN(dt)) return "";
    return dt.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: "numeric" });
  }
  function fmtWhen(d) {
    var dt = new Date(d), diff = (Date.now() - dt) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + " min ago";
    if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + (Math.floor(diff / 86400) === 1 ? " day ago" : " days ago");
    return fmtDate(dt);
  }
  function money(n) {
    if (n == null || n === "" || isNaN(n)) return "";
    return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function emails(str) {
    if (Array.isArray(str)) return str;
    return String(str || "").split(/[\s,;]+/).map(function (e) { return e.trim().toLowerCase(); }).filter(function (e) { return /.+@.+\..+/.test(e); });
  }
  function phones(str) {
    if (Array.isArray(str)) return str;
    return String(str || "").split(/[,;]+/).map(function (p) {
      var d = p.replace(/[^\d+]/g, "");
      if (/^\d{10}$/.test(d)) d = "+1" + d;
      if (/^1\d{10}$/.test(d)) d = "+" + d;
      return d;
    }).filter(function (p) { return /^\+\d{11,15}$/.test(p); });
  }
  function toast(msg, kind) {
    var host = document.getElementById("toasts");
    if (!host) { host = document.createElement("div"); host.id = "toasts"; host.setAttribute("role", "status"); host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.innerHTML = msg;
    host.appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, 4600);
    setTimeout(function () { t.remove(); }, 5200);
  }
  function store(key, val) {
    try {
      if (arguments.length > 1) { localStorage.setItem(key, JSON.stringify(val)); return val; }
      var v = localStorage.getItem(key); return v ? JSON.parse(v) : null;
    } catch (e) { return arguments.length > 1 ? val : null; }
  }
  function menu() {
    var b = document.querySelector(".menu-btn"), n = document.getElementById("nav");
    if (!b || !n) return;
    b.addEventListener("click", function () { var o = n.classList.toggle("open"); b.setAttribute("aria-expanded", o); });
  }
  var y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
  document.addEventListener("DOMContentLoaded", menu);

  /* ======================================================
     DEMO back end (localStorage)
     ====================================================== */
  var DKEY = "yht-demo-v1";
  function seed() {
    var d = new Date(), day = 86400000;
    function ago(n) { return new Date(d - n * day).toISOString(); }
    function dateOnly(n) { return new Date(d.getTime() + n * day).toISOString().slice(0, 10); }
    var s = { transactions: [], steps: [], feedback: [], open_houses: [], events: [] };
    var t1 = { id: "demo-seller", side: "seller", client_name: "Jordan & Taylor Miller", client_emails: ["seller@example.com"], client_phones: [],
      address: "4812 S Prairie Meadow Ave", city: "Sioux Falls, SD 57108", price: 389900, status_label: "Active — showing", photo_url: "",
      beds: 4, baths: 3, sqft: 2640, mls_url: "", target_date: dateOnly(38), alerts_enabled: true, created_at: ago(24) };
    var t2 = { id: "demo-buyer", side: "buyer", client_name: "Sam Rivera", client_emails: ["buyer@example.com"], client_phones: [],
      address: "1207 E Fawn Creek Ct", city: "Brandon, SD 57005", price: 342500, status_label: "Under contract", photo_url: "",
      beds: 3, baths: 2, sqft: 1980, mls_url: "", target_date: dateOnly(21), alerts_enabled: true, created_at: ago(40) };
    s.transactions.push(t1, t2);
    function addSteps(tx, doneCount, startAgo) {
      TEMPLATES[tx.side].forEach(function (st, i) {
        var done = i < doneCount;
        s.steps.push({ id: uid() + i, transaction_id: tx.id, position: i + 1, title: st[0], description: st[1], done: done,
          done_at: done ? ago(startAgo - i * Math.max(1, Math.floor(startAgo / doneCount))) : null, due_date: null });
      });
    }
    addSteps(t1, 6, 22); addSteps(t2, 7, 38);
    s.steps.filter(function (x) { return x.transaction_id === "demo-seller" && x.position === 8; })[0].due_date = dateOnly(5);
    s.steps.filter(function (x) { return x.transaction_id === "demo-buyer" && x.position === 8; })[0].due_date = dateOnly(2);
    s.feedback.push(
      { id: uid(), transaction_id: "demo-seller", showing_date: dateOnly(-9), showing_agent: "Buyer's agent, Hegg Realtors", interest: 4, price_opinion: "right", comments: "Buyers loved the kitchen and the finished basement. Wish the backyard was a little bigger. May come back for a second showing.", created_at: ago(9) },
      { id: uid(), transaction_id: "demo-seller", showing_date: dateOnly(-6), showing_agent: "Buyer's agent, Coldwell Banker", interest: 2, price_opinion: "high", comments: "Nice home but more space than they need. They felt it was priced a bit above similar homes they've seen.", created_at: ago(6) },
      { id: uid(), transaction_id: "demo-seller", showing_date: dateOnly(-3), showing_agent: "Buyer's agent, The Hegg Companies", interest: 5, price_opinion: "right", comments: "Clients are very interested. Clean, updated, great natural light. Expect to hear from us soon!", created_at: ago(3) }
    );
    s.open_houses.push(
      { id: uid(), transaction_id: "demo-seller", date: dateOnly(-8), time_range: "1:00 – 3:00 PM", visitors: 14, interested: 3, notes: "Steady traffic all afternoon. Two neighbors stopped by, plus three couples who are actively looking. The open kitchen and the main-floor laundry got the most comments.", created_at: ago(8) },
      { id: uid(), transaction_id: "demo-seller", date: dateOnly(-1), time_range: "12:00 – 2:00 PM", visitors: 9, interested: 2, notes: "Quieter with the cold weather, but two serious buyers. One asked about the age of the roof (2019) and the HOA. I'll follow up with both this week.", created_at: ago(1) }
    );
    s.steps.filter(function (x) { return x.done; }).forEach(function (x) {
      s.events.push({ id: uid(), transaction_id: x.transaction_id, kind: "step", title: "Completed: " + x.title, body: x.description, created_at: x.done_at });
    });
    s.feedback.forEach(function (f) { s.events.push({ id: uid(), transaction_id: f.transaction_id, kind: "feedback", title: "New showing feedback", body: f.comments, created_at: f.created_at }); });
    s.open_houses.forEach(function (o) { s.events.push({ id: uid(), transaction_id: o.transaction_id, kind: "open_house", title: "Open house recap: " + o.visitors + " visitors", body: o.notes, created_at: o.created_at }); });
    s.events.push({ id: uid(), transaction_id: "demo-buyer", kind: "note", title: "Inspection is booked", body: "Inspector is scheduled for this week at 10:00 AM. Plan on about 3 hours. You're welcome to be there for the last 30 minutes for the walkthrough.", created_at: ago(0.2) });
    return s;
  }
  function db() { var d = store(DKEY); if (!d) d = store(DKEY, seed()); return d; }
  function save(d) { store(DKEY, d); }
  function demoAlert(txId, title) {
    var d = db(), tx = d.transactions.filter(function (t) { return t.id === txId; })[0];
    if (!tx || !tx.alerts_enabled) return;
    var to = (tx.client_emails || []).join(", ") || "the client";
    toast("<b>Alert sent</b> " + esc(title) + "<br><small>Demo mode: in the live site this emails " + esc(to) + "</small>", "alert");
  }
  function demoEvent(d, txId, kind, title, body) {
    var ev = { id: uid(), transaction_id: txId, kind: kind, title: title, body: body || "", created_at: nowISO() };
    d.events.push(ev); return ev;
  }

  var Demo = {
    user: function () { return Promise.resolve(store("yht-demo-user")); },
    signIn: function (email) {
      email = String(email || "").trim().toLowerCase();
      var u = { email: email, demo: true };
      store("yht-demo-user", u);
      return Promise.resolve({ demoRedirect: true });
    },
    signOut: function () { try { localStorage.removeItem("yht-demo-user"); } catch (e) {} return Promise.resolve(); },
    isAgent: function () { return Promise.resolve(false); },
    canManage: function () { return Promise.resolve(false); /* the dashboard only works once Supabase sign-in is connected */
    },
    listTransactions: function () {
      return Demo.user().then(function (u) {
        var d = db();
        var all = d.transactions.map(function (t) {
          return Object.assign({}, t, { steps: d.steps.filter(function (s) { return s.transaction_id === t.id; }).map(function (s) { return { done: s.done }; }) });
        }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
        return Demo.isAgent().then(function (ag) {
          if (ag) return all;
          var mine = all.filter(function (t) { return u && (t.client_emails || []).indexOf(u.email) > -1; });
          return mine.length ? mine : all; /* demo: any visitor sees the samples */
        });
      });
    },
    getTransaction: function (id) {
      var d = db();
      function f(arr) { return arr.filter(function (x) { return x.transaction_id === id; }); }
      return Promise.resolve({
        tx: d.transactions.filter(function (t) { return t.id === id; })[0],
        steps: f(d.steps).sort(function (a, b) { return a.position - b.position; }),
        feedback: f(d.feedback).sort(function (a, b) { return a.showing_date < b.showing_date ? 1 : -1; }),
        openHouses: f(d.open_houses).sort(function (a, b) { return a.date < b.date ? 1 : -1; }),
        events: f(d.events).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })
      });
    },
    createTransaction: function (data) {
      var d = db(), tx = Object.assign({ id: uid(), created_at: nowISO(), alerts_enabled: true }, data);
      d.transactions.push(tx);
      TEMPLATES[tx.side].forEach(function (st, i) {
        d.steps.push({ id: uid() + i, transaction_id: tx.id, position: i + 1, title: st[0], description: st[1], done: false, done_at: null, due_date: null });
      });
      demoEvent(d, tx.id, "welcome", "Your home timeline is ready", "Follow every step of your " + (tx.side === "seller" ? "sale" : "purchase") + " here.");
      save(d); demoAlert(tx.id, "Welcome: your home timeline is ready");
      return Promise.resolve(tx);
    },
    updateTransaction: function (id, patch) {
      var d = db(); d.transactions.forEach(function (t) { if (t.id === id) Object.assign(t, patch); }); save(d); return Promise.resolve();
    },
    deleteTransaction: function (id) {
      var d = db();
      ["transactions"].forEach(function (k) { d[k] = d[k].filter(function (x) { return x.id !== id; }); });
      ["steps", "feedback", "open_houses", "events"].forEach(function (k) { d[k] = d[k].filter(function (x) { return x.transaction_id !== id; }); });
      save(d); return Promise.resolve();
    },
    setStepDone: function (stepId, done) {
      var d = db(), st = d.steps.filter(function (s) { return s.id === stepId; })[0];
      if (!st) return Promise.resolve();
      var was = st.done; st.done = done; st.done_at = done ? nowISO() : null;
      if (done && !was) { demoEvent(d, st.transaction_id, "step", "Completed: " + st.title, st.description); save(d); demoAlert(st.transaction_id, "Completed: " + st.title); }
      else save(d);
      return Promise.resolve();
    },
    updateStep: function (stepId, patch) {
      var d = db(); d.steps.forEach(function (s) { if (s.id === stepId) Object.assign(s, patch); }); save(d); return Promise.resolve();
    },
    addStep: function (txId, title, description, after) {
      var d = db(), steps = d.steps.filter(function (s) { return s.transaction_id === txId; });
      var pos = after != null ? after + 1 : steps.length + 1;
      steps.forEach(function (s) { if (s.position >= pos) s.position++; });
      d.steps.push({ id: uid(), transaction_id: txId, position: pos, title: title, description: description || "", done: false, done_at: null, due_date: null });
      save(d); return Promise.resolve();
    },
    moveStep: function (stepId, dir) {
      var d = db(), st = d.steps.filter(function (s) { return s.id === stepId; })[0];
      var other = d.steps.filter(function (s) { return s.transaction_id === st.transaction_id && s.position === st.position + dir; })[0];
      if (other) { other.position = st.position; st.position += dir; save(d); }
      return Promise.resolve();
    },
    deleteRow: function (table, id) {
      var d = db(); d[table] = d[table].filter(function (x) { return x.id !== id; });
      if (table === "steps") {
        var bytx = {}; d.steps.forEach(function (s) { (bytx[s.transaction_id] = bytx[s.transaction_id] || []).push(s); });
        Object.keys(bytx).forEach(function (k) { bytx[k].sort(function (a, b) { return a.position - b.position; }).forEach(function (s, i) { s.position = i + 1; }); });
      }
      save(d); return Promise.resolve();
    },
    addFeedback: function (txId, f) {
      var d = db(); f = Object.assign({ id: uid(), transaction_id: txId, created_at: nowISO() }, f); d.feedback.push(f);
      demoEvent(d, txId, "feedback", "New showing feedback", f.comments); save(d); demoAlert(txId, "New showing feedback");
      return Promise.resolve();
    },
    addOpenHouse: function (txId, o) {
      var d = db(); o = Object.assign({ id: uid(), transaction_id: txId, created_at: nowISO() }, o); d.open_houses.push(o);
      var t = "Open house recap: " + (o.visitors || 0) + " visitors";
      demoEvent(d, txId, "open_house", t, o.notes); save(d); demoAlert(txId, t);
      return Promise.resolve();
    },
    addUpdate: function (txId, title, body) {
      var d = db(); demoEvent(d, txId, "note", title, body); save(d); demoAlert(txId, title); return Promise.resolve();
    },
    uploadPhoto: function (file) {
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () {
          var img = new Image();
          img.onload = function () {
            var w = Math.min(1400, img.width), h = Math.round(img.height * w / img.width), c = document.createElement("canvas");
            c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); res(c.toDataURL("image/jpeg", 0.8));
          };
          img.onerror = rej; img.src = r.result;
        };
        r.onerror = rej; r.readAsDataURL(file);
      });
    },
    reset: function () { try { localStorage.removeItem(DKEY); } catch (e) {} }
  };

  /* ======================================================
     LIVE back end (Supabase)
     ====================================================== */
  var sbP = null;
  function sb() {
    if (sbP) return sbP;
    sbP = new Promise(function (res, rej) {
      if (window.supabase && window.supabase.createClient) return res(window.supabase.createClient(CFG.SUPABASE_URL, KEY));
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
      s.onload = function () { res(window.supabase.createClient(CFG.SUPABASE_URL, KEY)); };
      s.onerror = function () { rej(new Error("Could not load the sign-in library. Check your connection and refresh.")); };
      document.head.appendChild(s);
    });
    return sbP;
  }
  function q(fn) { return sb().then(fn).then(function (r) { if (r && r.error) throw r.error; return r ? r.data : null; }); }

  var Live = {
    user: function () { return sb().then(function (c) { return c.auth.getSession(); }).then(function (r) { return r.data.session ? r.data.session.user : null; }); },
    signIn: function (email) {
      var redirect = location.origin + location.pathname.replace(/[^/]*$/, "") + "portal.html";
      return q(function (c) { return c.auth.signInWithOtp({ email: String(email).trim().toLowerCase(), options: { emailRedirectTo: redirect } }); });
    },
    signOut: function () { return sb().then(function (c) { return c.auth.signOut(); }); },
    isAgent: function () { return q(function (c) { return c.rpc("is_agent"); }).then(function (v) { return !!v; }).catch(function () { return false; }); },
    canManage: function () { return Live.isAgent(); },
    listTransactions: function () { return q(function (c) { return c.from("transactions").select("*, steps(done)").order("created_at", { ascending: false }); }); },
    getTransaction: function (id) {
      return Promise.all([
        q(function (c) { return c.from("transactions").select("*").eq("id", id).maybeSingle(); }),
        q(function (c) { return c.from("steps").select("*").eq("transaction_id", id).order("position"); }),
        q(function (c) { return c.from("feedback").select("*").eq("transaction_id", id).order("showing_date", { ascending: false }); }),
        q(function (c) { return c.from("open_houses").select("*").eq("transaction_id", id).order("date", { ascending: false }); }),
        q(function (c) { return c.from("events").select("*").eq("transaction_id", id).order("created_at", { ascending: false }).limit(60); })
      ]).then(function (r) { return { tx: r[0], steps: r[1] || [], feedback: r[2] || [], openHouses: r[3] || [], events: r[4] || [] }; });
    },
    createTransaction: function (data) {
      return q(function (c) { return c.from("transactions").insert(data).select().single(); }).then(function (tx) {
        var rows = TEMPLATES[tx.side].map(function (st, i) { return { transaction_id: tx.id, position: i + 1, title: st[0], description: st[1] }; });
        return q(function (c) { return c.from("steps").insert(rows); }).then(function () { return tx; });
      });
    },
    updateTransaction: function (id, patch) { return q(function (c) { return c.from("transactions").update(patch).eq("id", id); }); },
    deleteTransaction: function (id) { return q(function (c) { return c.from("transactions").delete().eq("id", id); }); },
    setStepDone: function (stepId, done) { return q(function (c) { return c.from("steps").update({ done: done, done_at: done ? nowISO() : null }).eq("id", stepId); }); },
    updateStep: function (stepId, patch) { return q(function (c) { return c.from("steps").update(patch).eq("id", stepId); }); },
    addStep: function (txId, title, description, after) {
      return q(function (c) { return c.rpc("insert_step", { p_transaction: txId, p_title: title, p_description: description || "", p_after: after == null ? null : after }); });
    },
    moveStep: function (stepId, dir) { return q(function (c) { return c.rpc("move_step", { p_step: stepId, p_dir: dir }); }); },
    deleteRow: function (table, id) {
      return q(function (c) { return c.from(table).delete().eq("id", id); });
    },
    addFeedback: function (txId, f) { return q(function (c) { return c.from("feedback").insert(Object.assign({ transaction_id: txId }, f)); }); },
    addOpenHouse: function (txId, o) { return q(function (c) { return c.from("open_houses").insert(Object.assign({ transaction_id: txId }, o)); }); },
    addUpdate: function (txId, title, body) { return q(function (c) { return c.from("events").insert({ transaction_id: txId, kind: "note", title: title, body: body }); }); },
    uploadPhoto: function (file) {
      var path = "homes/" + Date.now() + "-" + file.name.replace(/[^\w.\-]+/g, "_");
      return sb().then(function (c) {
        return c.storage.from("home-photos").upload(path, file, { upsert: false, contentType: file.type }).then(function (r) {
          if (r.error) throw r.error;
          return c.storage.from("home-photos").getPublicUrl(path).data.publicUrl;
        });
      });
    }
  };

  window.YHT = Object.assign({}, LIVE ? Live : Demo, {
    mode: LIVE ? "live" : "demo", cfg: CFG, templates: TEMPLATES,
    esc: esc, fmtDate: fmtDate, fmtWhen: fmtWhen, money: money, emails: emails, phones: phones, toast: toast, store: store
  });
})();
