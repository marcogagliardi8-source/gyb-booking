(function(){
  "use strict";

  // -----------------------------------------------------------------------
  // Connessione a Supabase (vedi config.js)
  // -----------------------------------------------------------------------
  var cfg = window.GYB_CONFIG || {};
  var supabaseClient = null;
  var CONFIG_OK = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf("INCOLLA") === -1 && cfg.SUPABASE_ANON_KEY.indexOf("INCOLLA") === -1;
  if (CONFIG_OK) {
    supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  /** Chiama una funzione RPC di Supabase. Lancia un errore con messaggio leggibile. */
  async function rpc(fn, params) {
    var res = await supabaseClient.rpc(fn, params || {});
    if (res.error) {
      throw new Error(res.error.message || "Errore di comunicazione col server. Riprova.");
    }
    return res.data;
  }

  var ACTIVITY_SHORT = "Mini-class";
  var DAY_NAMES = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];
  var DAY_NAMES_SHORT = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
  var MONTH_NAMES = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  var CERT_WARN_DAYS = 30;

  var PRIVACY_CONTACT_EMAIL = "[email di contatto della palestra]";
  var PRIVACY_SECTIONS = [
    {h:"1. Titolare del trattamento", body:"Il Titolare del trattamento è il titolare di Get Your Balance Wellness Academy, Camerino. Per richieste sui tuoi dati scrivi a "+PRIVACY_CONTACT_EMAIL+"."},
    {h:"2. Perché raccogliamo i tuoi dati", body:"Trattiamo i tuoi dati per gestire iscrizione, prenotazioni, pacchetto lezioni, pagamenti, verifica del certificato medico e, solo con il tuo consenso specifico, per la promozione su Instagram e altri social."},
    {h:"3. Il certificato medico", body:"Conserviamo solo la data di scadenza del tuo certificato di idoneità sportiva, per motivi di sicurezza e per avvisarti in tempo del rinnovo — non conserviamo il contenuto clinico del certificato."},
    {h:"4. Come proteggiamo i tuoi dati", body:"I dati sono conservati su un database protetto, con accesso riservato allo staff tramite credenziali personali, e non conservati più a lungo del necessario."},
    {h:"5. A chi comunichiamo i tuoi dati", body:"Non vendiamo né cediamo i tuoi dati a terzi per scopi commerciali. Possono essere comunicati a collaboratori/istruttori, al commercialista per gli adempimenti fiscali, al fornitore del database (Supabase) in qualità di responsabile del trattamento, e alle autorità quando richiesto dalla legge."},
    {h:"6. Foto e video sui social", body:"Il tuo consenso a comparire in foto o video pubblicati sui nostri canali è sempre facoltativo e revocabile in ogni momento, senza conseguenze sul tuo rapporto con la palestra. Puoi gestire la tua scelta nella scheda “Il mio pacchetto” di questa app."},
    {h:"7. Per quanto tempo conserviamo i dati", body:"Conserviamo i dati per la durata del rapporto. Dopo la cessazione, i dati anagrafici vengono cancellati o resi anonimi entro un periodo ragionevole, salvo obblighi fiscali (10 anni per i dati contabili). La scadenza del certificato medico viene conservata per almeno 1-2 anni."},
    {h:"8. I tuoi diritti", body:"Puoi in ogni momento chiedere accesso, rettifica, cancellazione, limitazione o portabilità dei tuoi dati, oltre a opporti all'uso di foto e video, scrivendo al Titolare. Hai inoltre diritto di reclamo al Garante Privacy (www.garanteprivacy.it)."}
  ];

  // -----------------------------------------------------------------------
  // date helpers
  // -----------------------------------------------------------------------
  function toISODate(d){ var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0"); return y+"-"+m+"-"+day; }
  function mondayOf(date){ var d=new Date(date); var wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); d.setHours(0,0,0,0); return d; }
  function addDays(date, n){ var d=new Date(date); d.setDate(d.getDate()+n); return d; }
  function todayISO(){ return toISODate(new Date()); }
  function fmtDayLabel(d){ return DAY_NAMES[(d.getDay()+6)%7]+" "+d.getDate()+" "+MONTH_NAMES[d.getMonth()]; }
  function fmtWeekRange(monday){
    var sunday = addDays(monday,6);
    var sameMonth = monday.getMonth()===sunday.getMonth();
    if(sameMonth) return monday.getDate()+" – "+sunday.getDate()+" "+MONTH_NAMES[monday.getMonth()]+" "+sunday.getFullYear();
    return monday.getDate()+" "+MONTH_NAMES[monday.getMonth()]+" – "+sunday.getDate()+" "+MONTH_NAMES[sunday.getMonth()]+" "+sunday.getFullYear();
  }
  function fmtDateShort(dateStr){
    if(!dateStr) return "—";
    var d = new Date(dateStr+"T00:00:00");
    return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
  }
  function daysUntil(dateStr){
    if(!dateStr) return null;
    var target = new Date(dateStr+"T00:00:00");
    var today = new Date(todayISO()+"T00:00:00");
    return Math.round((target-today)/86400000);
  }
  function certStatus(client){
    if(!client || !client.medCertExpiry) return {level:"missing", days:null};
    var d = daysUntil(client.medCertExpiry);
    if(d<0) return {level:"crit", days:d};
    if(d<=CERT_WARN_DAYS) return {level:"warn", days:d};
    return {level:"ok", days:d};
  }
  function remaining(client){ return client ? Math.max(0, client.total - client.used) : 0; }
  function classOccursOn(cls, iso, dayIdx){
    if(cls.day!==dayIdx) return false;
    if(cls.valid_from && iso<cls.valid_from) return false;
    if(cls.valid_to && iso>cls.valid_to) return false;
    return true;
  }
  function surname(fullName){ var p=String(fullName).trim().split(/\s+/); return p[p.length-1]; }

  // -----------------------------------------------------------------------
  // dom helpers
  // -----------------------------------------------------------------------
  function el(html){ var t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  // -----------------------------------------------------------------------
  // state
  // -----------------------------------------------------------------------
  var state = {
    mode: "client",
    clientToken: localStorage.getItem("gyb_client_token") || null,
    clientProfile: null,
    clientChecking: false,
    clientTab: "calendario",
    weekOffset: 0,
    selectedDate: null,
    scheduleCache: {},
    scheduleLoading: false,
    scheduleError: "",
    myBookings: null,
    myBookingsLoading: false,
    loginError: "",
    loginBusy: false,

    adminToken: localStorage.getItem("gyb_admin_token") || null,
    adminAuthed: false,
    adminChecking: false,
    adminTab: "dashboard",
    adminClients: null, adminClientsLoading: false,
    adminClasses: null, adminClassesLoading: false,
    adminBookingsCache: {}, adminBookingsLoading: false,
    adminLoginError: "",
    adminLoginBusy: false,

    showAddClass: false,
    showAddClient: false,
    editingClassId: null,
    editingClientId: null,
    renewingClientId: null,
    selectedSlotKey: null,
    showPrivacy: false,
    changingPin: false,
    busy: false
  };

  function weekStartISO(offset){ return toISODate(addDays(mondayOf(new Date()), offset*7)); }
  function weekDates(offset){
    var monday = addDays(mondayOf(new Date()), offset*7);
    var days = [];
    for(var i=0;i<7;i++) days.push(addDays(monday,i));
    return days;
  }

  // -----------------------------------------------------------------------
  // render root
  // -----------------------------------------------------------------------
  function render(){
    var oldModal = document.querySelector(".modal-overlay");
    if(oldModal) oldModal.remove();

    var root = document.getElementById("app");
    root.innerHTML = "";

    if(!CONFIG_OK){
      root.appendChild(el(
        '<div class="app" style="padding-top:40px">'+
          '<div class="card"><h2>Configurazione mancante</h2>'+
          '<p style="font-size:13.5px;color:var(--ink-soft)">Apri il file <code>config.js</code> e inserisci l\'indirizzo (URL) e la chiave "anon" del tuo progetto Supabase, poi ricarica questa pagina. Trovi le istruzioni in DEPLOY.md.</p></div>'+
        '</div>'
      ));
      return;
    }

    root.appendChild(renderTopbar());
    var content = el('<div class="content"></div>');

    if(state.mode==="client"){
      if(state.clientToken && !state.clientProfile){
        content.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
        if(!state.clientChecking) validateClientSession();
      } else if(!state.clientProfile){
        content.appendChild(renderClientLogin());
      } else {
        content.appendChild(renderClientApp());
      }
    } else {
      if(state.adminToken && !state.adminAuthed){
        content.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
        if(!state.adminChecking) validateAdminSession();
      } else if(!state.adminAuthed){
        content.appendChild(renderAdminLogin());
      } else {
        content.appendChild(renderAdminApp());
      }
    }
    root.appendChild(content);

    var modal = renderPrivacyModal() || renderSlotModal();
    if(modal) document.body.appendChild(modal);
  }

  // -----------------------------------------------------------------------
  // session validation on load / refresh
  // -----------------------------------------------------------------------
  async function validateClientSession(){
    state.clientChecking = true;
    try {
      var profile = await rpc("app_client_me", { p_token: state.clientToken });
      state.clientProfile = profile;
    } catch(e){
      localStorage.removeItem("gyb_client_token");
      state.clientToken = null;
    }
    state.clientChecking = false;
    render();
  }

  async function validateAdminSession(){
    state.adminChecking = true;
    try {
      var ok = await rpc("app_admin_ping", { p_token: state.adminToken });
      state.adminAuthed = !!ok;
      if(!ok){ localStorage.removeItem("gyb_admin_token"); state.adminToken = null; }
    } catch(e){
      localStorage.removeItem("gyb_admin_token");
      state.adminToken = null;
    }
    state.adminChecking = false;
    render();
  }

  // -----------------------------------------------------------------------
  // topbar
  // -----------------------------------------------------------------------
  function renderTopbar(){
    var bar = el('<div class="topbar"></div>');
    var row = el(
      '<div class="brand-row">'+
        '<div class="brand">'+
          '<img src="assets/logo-color.png" alt="Get Your Balance Wellness Academy" class="logo-light">'+
          '<img src="assets/logo-white.png" alt="Get Your Balance Wellness Academy" class="logo-dark" style="display:none">'+
          '<span class="brand-name">Get Your Balance</span>'+
        '</div>'+
        '<button id="privacy-link" style="background:none;border:none;font-size:12px;font-weight:700;color:var(--ink-soft);text-decoration:underline;padding:0">Privacy</button>'+
      '</div>'
    );
    row.querySelector("#privacy-link").addEventListener("click", function(){ state.showPrivacy=true; render(); });
    bar.appendChild(row);

    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var dark = document.documentElement.getAttribute("data-theme")==="dark" || (mq.matches && document.documentElement.getAttribute("data-theme")!=="light");
    if(dark){ row.querySelector(".logo-light").style.display="none"; row.querySelector(".logo-dark").style.display="block"; }

    var modeSwitch = el(
      '<div class="mode-switch">'+
        '<button data-mode="client" class="'+(state.mode==="client"?"active":"")+'">Sono un cliente</button>'+
        '<button data-mode="admin" class="'+(state.mode==="admin"?"active":"")+'">Sono lo staff</button>'+
      '</div>'
    );
    modeSwitch.querySelectorAll("button").forEach(function(b){
      b.addEventListener("click", function(){ state.mode=b.getAttribute("data-mode"); state.selectedSlotKey=null; render(); });
    });
    bar.appendChild(modeSwitch);

    if(state.mode==="client" && state.clientProfile){
      bar.appendChild(renderSectionTabs(
        [["calendario","Calendario"],["prenotazioni","Le mie prenotazioni"],["pacchetto","Il mio pacchetto"]],
        state.clientTab, function(v){ state.clientTab=v; render(); }
      ));
    }
    if(state.mode==="admin" && state.adminAuthed){
      bar.appendChild(renderSectionTabs(
        [["dashboard","Dashboard"],["orari","Orari"],["clienti","Clienti"],["prenotazioni","Prenotazioni"]],
        state.adminTab, function(v){ state.adminTab=v; render(); }
      ));
    }
    return bar;
  }

  function renderSectionTabs(tabs, active, onPick){
    var wrap = el('<div class="section-tabs"></div>');
    tabs.forEach(function(t){
      var b = el('<button>'+esc(t[1])+'</button>');
      if(t[0]===active) b.classList.add("active");
      b.addEventListener("click", function(){ onPick(t[0]); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // -----------------------------------------------------------------------
  // CLIENT: login
  // -----------------------------------------------------------------------
  function renderClientLogin(){
    var wrap = el('<div class="login-wrap"></div>');
    wrap.appendChild(el('<div class="login-hero"><h1 class="display">Prenota il tuo posto</h1><p>Accedi con l\'email e il PIN che hai ricevuto dallo staff.</p></div>'));
    var card = el('<div class="card"></div>');
    if(state.loginError) card.appendChild(el('<div class="error-msg">'+esc(state.loginError)+'</div>'));
    var form = el(
      '<form>'+
        '<div class="field"><label>Email</label><input type="email" id="login-email" placeholder="nome.cognome@email.it" autocomplete="email" required></div>'+
        '<div class="field"><label>PIN</label><input type="text" inputmode="numeric" id="login-pin" placeholder="••••" maxlength="6" required></div>'+
        '<button type="submit" class="btn btn-primary btn-block" '+(state.loginBusy?"disabled":"")+'>'+(state.loginBusy?"Accesso in corso…":"Accedi")+'</button>'+
      '</form>'
    );
    form.addEventListener("submit", async function(ev){
      ev.preventDefault();
      var email = form.querySelector("#login-email").value.trim();
      var pin = form.querySelector("#login-pin").value.trim();
      state.loginBusy = true; state.loginError=""; render();
      try {
        var res = await rpc("app_client_login", { p_email: email, p_pin: pin });
        state.clientToken = res.token;
        state.clientProfile = res.client;
        localStorage.setItem("gyb_client_token", res.token);
        state.clientTab = "calendario";
      } catch(e){
        state.loginError = "Email o PIN non corretti. Controlla e riprova.";
      }
      state.loginBusy = false;
      render();
    });
    card.appendChild(form);
    wrap.appendChild(card);
    return wrap;
  }

  // -----------------------------------------------------------------------
  // CLIENT: app
  // -----------------------------------------------------------------------
  function renderClientApp(){
    var client = state.clientProfile;
    var wrap = el('<div style="display:flex;flex-direction:column;gap:18px"></div>');

    var topRow = el(
      '<div class="banner"><span>🙋</span><div>Ciao <strong>'+esc(client.name.split(" ")[0])+'</strong>. '+
      '<a href="#" id="logout-link" style="color:var(--magenta-ink);font-weight:700;text-decoration:none">Esci</a></div></div>'
    );
    topRow.querySelector("#logout-link").addEventListener("click", async function(ev){
      ev.preventDefault();
      try { await rpc("app_client_logout", { p_token: state.clientToken }); } catch(e){}
      localStorage.removeItem("gyb_client_token");
      state.clientToken=null; state.clientProfile=null; state.scheduleCache={}; state.myBookings=null;
      render();
    });
    wrap.appendChild(topRow);

    renderClientAlerts(client).forEach(function(b){ wrap.appendChild(b); });

    if(state.clientTab==="calendario") wrap.appendChild(renderClientCalendar(client));
    if(state.clientTab==="prenotazioni") wrap.appendChild(renderClientBookings(client));
    if(state.clientTab==="pacchetto") wrap.appendChild(renderClientPackage(client));

    return wrap;
  }

  function renderClientAlerts(client){
    var alerts = [];
    var rem = remaining(client);
    if(rem<=0){
      alerts.push(el('<div class="banner" style="background:var(--crit-bg);border-color:transparent"><span>⚠️</span><div><strong style="color:var(--crit)">Pacchetto lezioni esaurito.</strong> Passa in reception per rinnovarlo prima di prenotare altre lezioni.</div></div>'));
    } else if(rem<=2){
      alerts.push(el('<div class="banner" style="background:var(--warn-bg);border-color:transparent"><span>⏳</span><div>Ti rest'+(rem===1?"a":"ano")+' <strong style="color:var(--warn)">'+rem+' lezion'+(rem===1?"e":"i")+'</strong> nel pacchetto.</div></div>'));
    }
    var cs = certStatus(client);
    if(cs.level==="crit"){
      alerts.push(el('<div class="banner" style="background:var(--crit-bg);border-color:transparent"><span>🩺</span><div><strong style="color:var(--crit)">Certificato medico scaduto</strong> il '+fmtDateShort(client.medCertExpiry)+'. Portane uno aggiornato prima del prossimo allenamento.</div></div>'));
    } else if(cs.level==="warn"){
      alerts.push(el('<div class="banner" style="background:var(--warn-bg);border-color:transparent"><span>🩺</span><div><strong style="color:var(--warn)">Certificato medico in scadenza</strong> il '+fmtDateShort(client.medCertExpiry)+' (tra '+cs.days+' giorn'+(cs.days===1?"o":"i")+'). Ricordati di rinnovarlo.</div></div>'));
    }
    return alerts;
  }

  function renderWeekNav(getOffset, setOffset){
    var monday = addDays(mondayOf(new Date()), getOffset()*7);
    var nav = el(
      '<div class="week-nav">'+
        '<button id="week-prev" '+(getOffset()<=-1?"disabled":"")+'>‹</button>'+
        '<span class="week-label">'+esc(fmtWeekRange(monday))+'</span>'+
        '<button id="week-next" '+(getOffset()>=3?"disabled":"")+'>›</button>'+
      '</div>'
    );
    nav.querySelector("#week-prev").addEventListener("click", function(){ if(getOffset()>-1){ setOffset(getOffset()-1); render(); } });
    nav.querySelector("#week-next").addEventListener("click", function(){ if(getOffset()<3){ setOffset(getOffset()+1); render(); } });
    return nav;
  }

  function renderDayStrip(monday, days, todayIso){
    var wrap = el('<div class="day-strip-wrap"></div>');
    var monthLabel = MONTH_NAMES[monday.getMonth()].toUpperCase();
    var head = el(
      '<div class="day-strip-head">'+
        '<button class="ds-nav" id="ds-prev" '+(state.weekOffset<=-1?"disabled":"")+'>‹</button>'+
        '<span class="ds-month">'+esc(monthLabel)+'</span>'+
        '<button class="ds-nav" id="ds-next" '+(state.weekOffset>=3?"disabled":"")+'>›</button>'+
      '</div>'
    );
    head.querySelector("#ds-prev").addEventListener("click", function(){
      if(state.weekOffset>-1){ state.weekOffset--; state.scheduleError=""; state.selectedDate=null; render(); }
    });
    head.querySelector("#ds-next").addEventListener("click", function(){
      if(state.weekOffset<3){ state.weekOffset++; state.scheduleError=""; state.selectedDate=null; render(); }
    });
    wrap.appendChild(head);

    var strip = el('<div class="day-strip"></div>');
    days.forEach(function(d){
      var iso = toISODate(d);
      var isSel = iso===state.selectedDate;
      var isToday = iso===todayIso;
      var item = el(
        '<button type="button" class="ds-day'+(isSel?" selected":"")+(isToday?" is-today":"")+'">'+
          '<span class="ds-wd">'+DAY_NAMES_SHORT[(d.getDay()+6)%7].toLowerCase()+'</span>'+
          '<span class="ds-num">'+d.getDate()+'</span>'+
        '</button>'
      );
      item.addEventListener("click", function(){ state.selectedDate = iso; render(); });
      strip.appendChild(item);
    });
    wrap.appendChild(strip);
    return wrap;
  }

  function renderClientCalendar(client){
    var wrap = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');

    var days = weekDates(state.weekOffset);
    var todayIso = todayISO();
    var monday = days[0];

    var inWeek = days.some(function(d){ return toISODate(d)===state.selectedDate; });
    if(!state.selectedDate || !inWeek){
      var todayInWeek = days.some(function(d){ return toISODate(d)===todayIso; });
      state.selectedDate = todayInWeek ? todayIso : toISODate(days[0]);
    }

    wrap.appendChild(renderDayStrip(monday, days, todayIso));

    var wstart = weekStartISO(state.weekOffset);
    var rows = state.scheduleCache[wstart];

    if(rows === undefined && !state.scheduleLoading){
      loadSchedule(wstart);
    }
    if(state.scheduleLoading){
      wrap.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
      return wrap;
    }
    if(state.scheduleError){
      wrap.appendChild(el('<div class="error-banner">'+esc(state.scheduleError)+'</div>'));
      return wrap;
    }
    rows = rows || [];

    var iso = state.selectedDate;
    var dayRows = rows.filter(function(r){ return r.the_date===iso; }).sort(function(a,b){ return a.time.localeCompare(b.time); });
    var list = el('<div class="day-group"></div>');
    if(dayRows.length===0){
      list.appendChild(el('<div class="empty-note">Nessuna mini-class in programma questo giorno.</div>'));
    }
    dayRows.forEach(function(row){
      list.appendChild(renderClientClassCard(row, iso, client, iso<todayIso));
    });
    wrap.appendChild(list);
    return wrap;
  }

  async function loadSchedule(wstart){
    state.scheduleLoading = true; state.scheduleError=""; render();
    try {
      var rows = await rpc("app_get_schedule", { p_token: state.clientToken, p_week_start: wstart });
      state.scheduleCache[wstart] = rows;
    } catch(e){
      state.scheduleError = "Non riesco a caricare il calendario. Controlla la connessione e riprova.";
    }
    state.scheduleLoading = false;
    render();
  }

  function renderClientClassCard(row, iso, client, isPast){
    var full = row.booked_count >= row.capacity;
    var spotsLeft = Math.max(0, row.capacity - row.booked_count);
    var spotsClass = full ? "spots-full" : (spotsLeft<=2 ? "spots-low" : "");
    var timeLabel = String(row.time).replace(":", ".");

    var card = el('<div class="slot-row"></div>');

    var top = el('<div class="slot-top"></div>');
    top.appendChild(el(
      '<div class="slot-info"><div class="slot-time">'+esc(timeLabel)+'</div>'+
      '<div class="slot-name">'+esc(ACTIVITY_SHORT).toUpperCase()+'</div></div>'
    ));

    var side = el('<div class="slot-side"></div>');
    side.appendChild(el('<div class="slot-count" title="Prenotati">'+row.booked_count+'</div>'));

    if(isPast){
      side.appendChild(el('<div class="slot-btn slot-btn-disabled">–</div>'));
    } else if(row.is_mine){
      var doneBtn = el('<button type="button" class="slot-btn slot-btn-done" '+(state.busy?"disabled":"")+' title="Cancella prenotazione">✓</button>');
      doneBtn.addEventListener("click", function(){ cancelOwnBookingBySlot(row, iso); });
      side.appendChild(doneBtn);
    } else {
      var disabled = full || remaining(client)<=0 || state.busy;
      var plusBtn = el('<button type="button" class="slot-btn slot-btn-plus" '+(disabled?"disabled":"")+' title="Prenota">+</button>');
      if(!disabled){
        plusBtn.addEventListener("click", function(){ bookSlot(row, iso); });
      }
      side.appendChild(plusBtn);
    }
    top.appendChild(side);
    card.appendChild(top);

    var bottom = el('<div class="slot-bottom"></div>');
    bottom.appendChild(el(
      '<span class="'+spotsClass+'">'+
        (full ? "Al completo" : spotsLeft+" post"+(spotsLeft===1?"o":"i")+" disponibil"+(spotsLeft===1?"e":"i")+" di "+row.capacity)+
      '</span>'
    ));
    var tagHtml;
    if(isPast) tagHtml = '<span class="slot-tag tag-passata">Passata</span>';
    else if(row.is_mine) tagHtml = '<span class="slot-tag tag-prenotato">✓ Prenotato</span>';
    else if(full) tagHtml = '<span class="slot-tag tag-completo">Al completo</span>';
    else tagHtml = '<span class="slot-tag tag-incluso">Incluso</span>';
    bottom.appendChild(el(tagHtml));
    card.appendChild(bottom);

    return card;
  }

  async function bookSlot(row, iso){
    state.busy = true; render();
    try {
      var updated = await rpc("app_book", { p_token: state.clientToken, p_class_id: row.class_id, p_date: iso });
      state.clientProfile = updated;
      delete state.scheduleCache[weekStartISO(state.weekOffset)];
      state.myBookings = null;
    } catch(e){
      alert(e.message || "Non è stato possibile completare la prenotazione.");
    }
    state.busy = false;
    render();
  }

  async function cancelOwnBookingBySlot(row, iso){
    state.busy = true; render();
    try {
      // Troviamo l'id prenotazione tramite "le mie prenotazioni" se non già in cache.
      var list = state.myBookings || await rpc("app_my_bookings", { p_token: state.clientToken });
      state.myBookings = list;
      var match = list.find(function(b){ return b.day===row.day && b.time===row.time && b.booking_date===iso; });
      if(match){
        var updated = await rpc("app_cancel_own_booking", { p_token: state.clientToken, p_booking_id: match.booking_id });
        state.clientProfile = updated;
      }
      delete state.scheduleCache[weekStartISO(state.weekOffset)];
      state.myBookings = null;
    } catch(e){
      alert(e.message || "Non è stato possibile cancellare la prenotazione.");
    }
    state.busy = false;
    render();
  }

  function renderClientBookings(client){
    var wrap = el('<div class="card"></div>');
    wrap.appendChild(el('<h2>Le mie prossime prenotazioni</h2>'));

    if(state.myBookings === null && !state.myBookingsLoading){
      loadMyBookings();
    }
    if(state.myBookingsLoading){
      wrap.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
      return wrap;
    }
    var list = state.myBookings || [];
    if(list.length===0){
      wrap.appendChild(el('<div class="empty-note">Nessuna prenotazione in programma. Vai su Calendario per prenotare un orario.</div>'));
    } else {
      list.forEach(function(b){
        var d = new Date(b.booking_date+"T00:00:00");
        var row = el(
          '<div class="booking-row"><div class="bmain"><div class="bname">'+esc(fmtDayLabel(d))+'</div>'+
          '<div class="bmeta">'+esc(b.time)+' · '+ACTIVITY_SHORT+'</div></div></div>'
        );
        var cancel = el('<button class="btn btn-line btn-sm" '+(state.busy?"disabled":"")+'>Cancella</button>');
        cancel.addEventListener("click", async function(){
          state.busy = true; render();
          try {
            var updated = await rpc("app_cancel_own_booking", { p_token: state.clientToken, p_booking_id: b.booking_id });
            state.clientProfile = updated;
            state.myBookings = null;
            state.scheduleCache = {};
          } catch(e){ alert(e.message || "Errore durante la cancellazione."); }
          state.busy = false;
          render();
        });
        row.appendChild(cancel);
        wrap.appendChild(row);
      });
    }
    return wrap;
  }

  async function loadMyBookings(){
    state.myBookingsLoading = true; render();
    try { state.myBookings = await rpc("app_my_bookings", { p_token: state.clientToken }); }
    catch(e){ state.myBookings = []; }
    state.myBookingsLoading = false;
    render();
  }

  function renderClientPackage(client){
    var wrap = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    var rem = remaining(client);
    var pct = client.total>0 ? Math.min(100, Math.round((client.used/client.total)*100)) : 0;
    wrap.appendChild(el(
      '<div class="card"><div class="pkg-head"><span class="pkg-name">'+esc(client.pkgName)+'</span>'+
      '<span class="pkg-remaining tabular">'+rem+'</span></div>'+
      '<div class="pkg-bar-track"><div class="pkg-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="pkg-foot"><span>'+client.used+' lezioni usate</span><span>'+client.total+' totali</span></div>'+
      '<div class="hint" style="margin-top:10px">Ultimo pagamento: '+fmtDateShort(client.paymentDate)+'</div></div>'
    ));

    var cs = certStatus(client);
    var certBadgeClass = cs.level==="crit" ? "badge-crit" : (cs.level==="warn" ? "badge-warn" : (cs.level==="missing" ? "badge-warn" : "badge-good"));
    var certText = cs.level==="missing" ? "Non caricato" : (cs.level==="crit" ? "Scaduto il "+fmtDateShort(client.medCertExpiry) : fmtDateShort(client.medCertExpiry));
    wrap.appendChild(el(
      '<div class="card"><div class="pkg-head"><span class="pkg-name" style="font-size:14.5px">Certificato medico</span>'+
      '<span class="badge '+certBadgeClass+'">'+certText+'</span></div></div>'
    ));

    var consentCard = el('<div class="card"></div>');
    consentCard.appendChild(el('<h2 style="font-size:14.5px">Foto e video per i social</h2>'));
    consentCard.appendChild(el('<div class="hint" style="margin:2px 0 12px">Ci autorizzi a pubblicare tue foto o video ripresi in palestra sui nostri canali social? Puoi cambiare idea quando vuoi. <button id="privacy-link-2" style="background:none;border:none;padding:0;color:var(--magenta-ink);font-weight:700;text-decoration:underline;cursor:pointer">Leggi l\'informativa</button></div>'));
    var btnRow = el('<div style="display:flex;gap:8px"></div>');
    var yesBtn = el('<button class="btn '+(client.photoConsent===true?"btn-primary":"btn-line")+'" style="flex:1" '+(state.busy?"disabled":"")+'>Acconsento</button>');
    var noBtn = el('<button class="btn '+(client.photoConsent===false?"btn-primary":"btn-line")+'" style="flex:1" '+(state.busy?"disabled":"")+'>Non acconsento</button>');
    yesBtn.addEventListener("click", function(){ setPhotoConsent(true); });
    noBtn.addEventListener("click", function(){ setPhotoConsent(false); });
    btnRow.appendChild(yesBtn); btnRow.appendChild(noBtn);
    consentCard.appendChild(btnRow);
    if(client.photoConsent===null || client.photoConsent===undefined){
      consentCard.appendChild(el('<div class="hint" style="margin-top:8px">Non hai ancora scelto: finché non rispondi non pubblichiamo tue immagini.</div>'));
    }
    wrap.appendChild(consentCard);
    consentCard.querySelector("#privacy-link-2").addEventListener("click", function(){ state.showPrivacy=true; render(); });

    return wrap;
  }

  async function setPhotoConsent(val){
    state.busy = true; render();
    try {
      state.clientProfile = await rpc("app_client_set_photo_consent", { p_token: state.clientToken, p_consent: val });
    } catch(e){ alert(e.message || "Errore, riprova."); }
    state.busy = false;
    render();
  }

  // -----------------------------------------------------------------------
  // ADMIN: login
  // -----------------------------------------------------------------------
  function renderAdminLogin(){
    var wrap = el('<div class="login-wrap"></div>');
    wrap.appendChild(el('<div class="login-hero"><h1 class="display">Area staff</h1><p>Inserisci il PIN di gestione per accedere.</p></div>'));
    var card = el('<div class="card"></div>');
    if(state.adminLoginError) card.appendChild(el('<div class="error-msg">'+esc(state.adminLoginError)+'</div>'));
    var form = el(
      '<form>'+
        '<div class="field"><label>PIN staff</label><input type="text" inputmode="numeric" id="admin-pin" placeholder="••••" maxlength="6" required></div>'+
        '<button type="submit" class="btn btn-primary btn-block" '+(state.adminLoginBusy?"disabled":"")+'>'+(state.adminLoginBusy?"Accesso in corso…":"Entra")+'</button>'+
      '</form>'
    );
    form.addEventListener("submit", async function(ev){
      ev.preventDefault();
      var pin = form.querySelector("#admin-pin").value.trim();
      state.adminLoginBusy = true; state.adminLoginError=""; render();
      try {
        var res = await rpc("app_admin_login", { p_pin: pin });
        state.adminToken = res.token;
        state.adminAuthed = true;
        localStorage.setItem("gyb_admin_token", res.token);
      } catch(e){
        state.adminLoginError = "PIN errato.";
      }
      state.adminLoginBusy = false;
      render();
    });
    card.appendChild(form);
    wrap.appendChild(card);
    return wrap;
  }

  // -----------------------------------------------------------------------
  // ADMIN: app
  // -----------------------------------------------------------------------
  function renderAdminApp(){
    var wrap = el('<div style="display:flex;flex-direction:column;gap:18px"></div>');
    var top = el(
      '<div class="banner"><span>🛠️</span><div>Modalità gestore — visibile solo a te. '+
      '<a href="#" id="admin-logout" style="color:var(--magenta-ink);font-weight:700;text-decoration:none">Esci</a> · '+
      '<a href="#" id="admin-pin-link" style="color:var(--ink-soft);font-weight:700;text-decoration:none;margin-left:8px">Cambia PIN staff</a></div></div>'
    );
    top.querySelector("#admin-logout").addEventListener("click", async function(ev){
      ev.preventDefault();
      try { await rpc("app_admin_logout", { p_token: state.adminToken }); } catch(e){}
      localStorage.removeItem("gyb_admin_token");
      state.adminToken=null; state.adminAuthed=false;
      state.adminClients=null; state.adminClasses=null; state.adminBookingsCache={};
      render();
    });
    top.querySelector("#admin-pin-link").addEventListener("click", function(ev){ ev.preventDefault(); state.changingPin=!state.changingPin; render(); });
    wrap.appendChild(top);

    if(state.changingPin){
      var pinForm = el(
        '<div class="card">'+
          '<form>'+
            '<div class="field"><label>Nuovo PIN staff</label><input type="text" inputmode="numeric" id="new-admin-pin" maxlength="6" placeholder="almeno 4 cifre" required></div>'+
            '<button type="submit" class="btn btn-primary">Salva nuovo PIN</button>'+
          '</form>'+
        '</div>'
      );
      pinForm.querySelector("form").addEventListener("submit", async function(ev){
        ev.preventDefault();
        var newPin = pinForm.querySelector("#new-admin-pin").value.trim();
        try {
          await rpc("app_admin_change_pin", { p_token: state.adminToken, p_new_pin: newPin });
          alert("PIN aggiornato.");
          state.changingPin=false;
        } catch(e){ alert(e.message || "Errore, riprova."); }
        render();
      });
      wrap.appendChild(pinForm);
    }

    if(state.adminTab==="dashboard") wrap.appendChild(renderAdminDashboard());
    if(state.adminTab==="orari") wrap.appendChild(renderAdminOrari());
    if(state.adminTab==="clienti") wrap.appendChild(renderAdminClienti());
    if(state.adminTab==="prenotazioni") wrap.appendChild(renderAdminPrenotazioni());
    return wrap;
  }

  function ensureAdminData(cb){
    var need = [];
    if(state.adminClients===null && !state.adminClientsLoading) need.push(
      (async function(){ state.adminClientsLoading=true; render(); try{ state.adminClients = await rpc("app_admin_list_clients",{p_token:state.adminToken}); } catch(e){ state.adminClients=[]; } state.adminClientsLoading=false; render(); })()
    );
    if(state.adminClasses===null && !state.adminClassesLoading) need.push(
      (async function(){ state.adminClassesLoading=true; render(); try{ state.adminClasses = await rpc("app_admin_list_classes",{p_token:state.adminToken}); } catch(e){ state.adminClasses=[]; } state.adminClassesLoading=false; render(); })()
    );
  }

  function loadAdminBookings(wstart){
    state.adminBookingsLoading = true; render();
    rpc("app_admin_list_bookings", { p_token: state.adminToken, p_week_start: wstart })
      .then(function(rows){ state.adminBookingsCache[wstart]=rows; })
      .catch(function(){ state.adminBookingsCache[wstart]=[]; })
      .then(function(){ state.adminBookingsLoading=false; render(); });
  }

  function renderAdminDashboard(){
    ensureAdminData();
    var wrap = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    if(state.adminClients===null || state.adminClasses===null){
      wrap.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
      return wrap;
    }
    var wstart = weekStartISO(0);
    if(state.adminBookingsCache[wstart]===undefined && !state.adminBookingsLoading) loadAdminBookings(wstart);
    var weekBookings = state.adminBookingsCache[wstart] || [];

    var todayIso = todayISO();
    var todayIdx = (new Date().getDay()+6)%7;
    var todaysClasses = state.adminClasses.filter(function(c){ return classOccursOn(c, todayIso, todayIdx); });
    var bookedToday = {};
    weekBookings.filter(function(b){ return b.booking_date===todayIso; }).forEach(function(b){ bookedToday[b.class_id]=(bookedToday[b.class_id]||0)+1; });
    var spotsToday = 0;
    todaysClasses.forEach(function(c){ spotsToday += Math.max(0, c.capacity - (bookedToday[c.id]||0)); });

    var lowPkg = state.adminClients.filter(function(c){ return remaining(c)<=2; }).length;

    wrap.appendChild(el(
      '<div class="kpi-grid">'+
        '<div class="kpi accent"><div class="num tabular">'+state.adminClients.length+'</div><div class="label">Clienti attivi</div></div>'+
        '<div class="kpi accent"><div class="num tabular">'+weekBookings.length+'</div><div class="label">Prenotazioni questa settimana</div></div>'+
        '<div class="kpi"><div class="num tabular">'+spotsToday+'</div><div class="label">Posti liberi oggi</div></div>'+
        '<div class="kpi warn"><div class="num tabular">'+lowPkg+'</div><div class="label">Pacchetti in esaurimento</div></div>'+
      '</div>'
    ));

    var card = el('<div class="card"><h2>Clienti in esaurimento pacchetto</h2></div>');
    var low = state.adminClients.filter(function(c){ return remaining(c)<=2; });
    if(low.length===0){
      card.appendChild(el('<div class="empty-note">Nessun cliente sotto le 3 lezioni residue.</div>'));
    } else {
      low.forEach(function(c){
        card.appendChild(el(
          '<div class="list-item"><div class="imain"><div class="ititle">'+esc(c.name)+'</div><div class="isub">'+esc(c.pkg_name)+'</div></div>'+
          '<span class="badge '+(remaining(c)===0?"badge-crit":"badge-warn")+'">'+remaining(c)+' rimaste</span></div>'
        ));
      });
    }
    wrap.appendChild(card);

    var certCard = el('<div class="card"><h2>Certificati medici da controllare</h2></div>');
    var certList = state.adminClients.filter(function(c){ return certStatus({medCertExpiry:c.med_cert_expiry}).level!=="ok"; })
      .sort(function(a,b){ var da=daysUntil(a.med_cert_expiry), db=daysUntil(b.med_cert_expiry); if(da===null) return -1; if(db===null) return 1; return da-db; });
    if(certList.length===0){
      certCard.appendChild(el('<div class="empty-note">Tutti i certificati sono in regola.</div>'));
    } else {
      certList.forEach(function(c){
        var cs = certStatus({medCertExpiry:c.med_cert_expiry});
        var label = cs.level==="missing" ? "mancante" : (cs.level==="crit" ? "scaduto il "+fmtDateShort(c.med_cert_expiry) : "scade il "+fmtDateShort(c.med_cert_expiry));
        var badgeClass = cs.level==="crit" ? "badge-crit" : "badge-warn";
        certCard.appendChild(el(
          '<div class="list-item"><div class="imain"><div class="ititle">'+esc(c.name)+'</div><div class="isub">'+esc(c.email)+'</div></div>'+
          '<span class="badge '+badgeClass+'">'+label+'</span></div>'
        ));
      });
    }
    wrap.appendChild(certCard);
    return wrap;
  }

  function renderAdminOrari(){
    ensureAdminData();
    var wrap = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    var card = el('<div class="card"></div>');
    card.appendChild(el(
      '<div class="section-head"><h2>Orari settimanali</h2>'+
      '<button class="btn btn-ghost btn-sm" id="toggle-add-class">'+(state.showAddClass?"Chiudi":"+ Aggiungi orario")+'</button></div>'
    ));
    card.appendChild(el('<div class="hint" style="margin-top:-6px">L\'attività è sempre '+ACTIVITY_SHORT.toLowerCase()+': qui decidi solo in quali giorni, a che ora e con quanti posti si può prenotare.</div>'));
    card.querySelector("#toggle-add-class").addEventListener("click", function(){ state.showAddClass=!state.showAddClass; render(); });

    if(state.showAddClass){
      var form = el(
        '<form class="toggle-form">'+
          '<div class="field">'+
            '<label>Tipo di orario</label>'+
            '<div style="display:flex;gap:8px">'+
              '<button type="button" class="btn btn-primary btn-sm" id="mode-recurring" style="width:auto">Ricorrente ogni settimana</button>'+
              '<button type="button" class="btn btn-line btn-sm" id="mode-single">Data singola</button>'+
            '</div>'+
          '</div>'+
          '<div id="recurring-fields">'+
            '<div class="field"><label>Giorni della settimana</label>'+
              '<div style="display:flex;flex-wrap:wrap;gap:6px">'+
                DAY_NAMES.map(function(d,i){ return '<label style="display:flex;align-items:center;gap:5px;background:var(--bg);border:1.5px solid var(--line);padding:6px 10px;border-radius:9px;font-size:12.5px;font-weight:700;cursor:pointer"><input type="checkbox" class="nc-day-chk" value="'+i+'" style="margin:0">'+d.slice(0,3)+'</label>'; }).join("")+
              '</div>'+
            '</div>'+
            '<div class="field-row">'+
              '<div class="field"><label>A partire dal</label><input type="date" id="nc-from" value="'+todayISO()+'"></div>'+
              '<div class="field"><label>Fino al (facoltativo)</label><input type="date" id="nc-to"></div>'+
            '</div>'+
          '</div>'+
          '<div id="single-fields" style="display:none">'+
            '<div class="field"><label>Data</label><input type="date" id="nc-date" value="'+todayISO()+'"></div>'+
          '</div>'+
          '<div class="field-row">'+
            '<div class="field"><label>Orario</label><input type="time" id="nc-time" value="18:00" required></div>'+
            '<div class="field"><label>Posti massimi</label><input type="number" id="nc-cap" min="1" max="30" value="8" required></div>'+
          '</div>'+
          '<button type="submit" class="btn btn-primary btn-block">Salva orario</button>'+
        '</form>'
      );
      var recurringBtn = form.querySelector("#mode-recurring");
      var singleBtn = form.querySelector("#mode-single");
      var recurringFields = form.querySelector("#recurring-fields");
      var singleFields = form.querySelector("#single-fields");
      form.setAttribute("data-mode","recurring");
      function setFormMode(mode){
        var recurring = mode==="recurring";
        recurringFields.style.display = recurring ? "" : "none";
        singleFields.style.display = recurring ? "none" : "";
        recurringBtn.className = "btn btn-sm" + (recurring ? " btn-primary" : " btn-line"); recurringBtn.style.width="auto";
        singleBtn.className = "btn btn-sm" + (recurring ? " btn-line" : " btn-primary"); singleBtn.style.width="auto";
        form.setAttribute("data-mode", mode);
      }
      recurringBtn.addEventListener("click", function(){ setFormMode("recurring"); });
      singleBtn.addEventListener("click", function(){ setFormMode("single"); });

      form.addEventListener("submit", async function(ev){
        ev.preventDefault();
        var time = form.querySelector("#nc-time").value;
        var capacity = parseInt(form.querySelector("#nc-cap").value,10);
        var mode = form.getAttribute("data-mode");
        try {
          if(mode==="recurring"){
            var days = Array.prototype.slice.call(form.querySelectorAll(".nc-day-chk:checked")).map(function(i){ return parseInt(i.value,10); });
            if(days.length===0){ alert("Seleziona almeno un giorno della settimana."); return; }
            var from = form.querySelector("#nc-from").value || null;
            var to = form.querySelector("#nc-to").value || null;
            for(var i=0;i<days.length;i++){
              await rpc("app_admin_add_class", { p_token: state.adminToken, p_day: days[i], p_time: time, p_capacity: capacity, p_valid_from: from, p_valid_to: to });
            }
          } else {
            var dateVal = form.querySelector("#nc-date").value;
            if(!dateVal){ alert("Scegli una data."); return; }
            var dayIdx = (new Date(dateVal+"T00:00:00").getDay()+6)%7;
            await rpc("app_admin_add_class", { p_token: state.adminToken, p_day: dayIdx, p_time: time, p_capacity: capacity, p_valid_from: dateVal, p_valid_to: dateVal });
          }
          state.adminClasses = null;
          state.showAddClass = false;
        } catch(e){ alert(e.message || "Errore nel salvataggio."); }
        render();
      });
      card.appendChild(form);
    }
    wrap.appendChild(card);

    var listCard = el('<div class="card"></div>');
    if(state.adminClasses===null){
      listCard.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
    } else {
      var sorted = state.adminClasses.slice().sort(function(a,b){ return a.day-b.day || a.time.localeCompare(b.time); });
      sorted.forEach(function(cls){
        if(state.editingClassId===cls.id){
          listCard.appendChild(renderClassEditRow(cls));
        } else {
          var validityNote;
          if(cls.valid_from && cls.valid_from===cls.valid_to){
            validityNote = "Data singola: "+fmtDateShort(cls.valid_from);
          } else {
            validityNote = "Ogni "+DAY_NAMES[cls.day].toLowerCase();
            if(cls.valid_from) validityNote += " · dal "+fmtDateShort(cls.valid_from);
            if(cls.valid_to) validityNote += " · fino al "+fmtDateShort(cls.valid_to);
          }
          var row = el(
            '<div class="list-item">'+
              '<div class="imain"><div class="ititle">'+DAY_NAMES[cls.day]+' · '+esc(cls.time)+'</div>'+
              '<div class="isub">Massimo '+cls.capacity+' partecipanti · '+validityNote+'</div></div>'+
              '<div class="iactions"><button class="btn btn-line btn-sm" data-act="edit">Modifica</button><button class="btn btn-danger btn-sm" data-act="del">Elimina</button></div>'+
            '</div>'
          );
          row.querySelector('[data-act="edit"]').addEventListener("click", function(){ state.editingClassId=cls.id; render(); });
          row.querySelector('[data-act="del"]').addEventListener("click", async function(){
            if(confirm("Eliminare l'orario di "+DAY_NAMES[cls.day]+" alle "+cls.time+"?")){
              try { await rpc("app_admin_delete_class", { p_token: state.adminToken, p_class_id: cls.id }); state.adminClasses=null; }
              catch(e){ alert(e.message || "Errore."); }
              render();
            }
          });
          listCard.appendChild(row);
        }
      });
    }
    wrap.appendChild(listCard);
    return wrap;
  }

  function renderClassEditRow(cls){
    var row = el('<div class="inline-edit-row"></div>');
    var form = el(
      '<form>'+
        '<div class="field-row">'+
          '<div class="field"><label>Giorno</label><select id="ec-day">'+DAY_NAMES.map(function(d,i){return '<option value="'+i+'" '+(i===cls.day?"selected":"")+'>'+d+'</option>';}).join("")+'</select></div>'+
          '<div class="field"><label>Orario</label><input type="time" id="ec-time" value="'+cls.time+'" required></div>'+
        '</div>'+
        '<div class="field"><label>Posti massimi</label><input type="number" id="ec-cap" min="1" max="30" value="'+cls.capacity+'" required></div>'+
        '<div class="field-row">'+
          '<div class="field"><label>A partire dal</label><input type="date" id="ec-from" value="'+(cls.valid_from||"")+'"></div>'+
          '<div class="field"><label>Fino al (facoltativo)</label><input type="date" id="ec-to" value="'+(cls.valid_to||"")+'"></div>'+
        '</div>'+
        '<div class="hint" style="margin-top:-6px">Lascia entrambe le date vuote per un orario ricorrente senza scadenza.</div>'+
        '<div style="display:flex;gap:8px"><button type="submit" class="btn btn-primary">Salva</button><button type="button" class="btn btn-line" id="ec-cancel">Annulla</button></div>'+
      '</form>'
    );
    form.addEventListener("submit", async function(ev){
      ev.preventDefault();
      try {
        await rpc("app_admin_update_class", {
          p_token: state.adminToken, p_class_id: cls.id,
          p_day: parseInt(form.querySelector("#ec-day").value,10),
          p_time: form.querySelector("#ec-time").value,
          p_capacity: parseInt(form.querySelector("#ec-cap").value,10),
          p_valid_from: form.querySelector("#ec-from").value || null,
          p_valid_to: form.querySelector("#ec-to").value || null
        });
        state.adminClasses = null;
        state.editingClassId = null;
      } catch(e){ alert(e.message || "Errore."); }
      render();
    });
    form.querySelector("#ec-cancel").addEventListener("click", function(){ state.editingClassId=null; render(); });
    row.appendChild(form);
    return row;
  }

  function renderAdminClienti(){
    ensureAdminData();
    var wrap = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    var card = el('<div class="card"></div>');
    card.appendChild(el(
      '<div class="section-head"><h2>Clienti</h2>'+
      '<button class="btn btn-ghost btn-sm" id="toggle-add-client">'+(state.showAddClient?"Chiudi":"+ Nuovo cliente")+'</button></div>'
    ));
    card.querySelector("#toggle-add-client").addEventListener("click", function(){ state.showAddClient=!state.showAddClient; render(); });

    if(state.showAddClient){
      var form = el(
        '<form class="toggle-form">'+
          '<div class="field"><label>Nome e cognome</label><input type="text" id="nu-name" required></div>'+
          '<div class="field-row">'+
            '<div class="field"><label>Email</label><input type="email" id="nu-email" required></div>'+
            '<div class="field"><label>PIN</label><input type="text" id="nu-pin" inputmode="numeric" maxlength="6" placeholder="4 cifre" required></div>'+
          '</div>'+
          '<div class="field-row">'+
            '<div class="field"><label>Nome pacchetto</label><input type="text" id="nu-pkgname" placeholder="Pacchetto 10 lezioni" required></div>'+
            '<div class="field"><label>N. lezioni</label><input type="number" id="nu-total" min="1" value="10" required></div>'+
          '</div>'+
          '<div class="field-row">'+
            '<div class="field"><label>Data pagamento</label><input type="date" id="nu-payment" value="'+todayISO()+'"></div>'+
            '<div class="field"><label>Scadenza certificato medico</label><input type="date" id="nu-cert"></div>'+
          '</div>'+
          '<button type="submit" class="btn btn-primary btn-block">Aggiungi cliente</button>'+
        '</form>'
      );
      form.addEventListener("submit", async function(ev){
        ev.preventDefault();
        try {
          await rpc("app_admin_add_client", {
            p_token: state.adminToken,
            p_name: form.querySelector("#nu-name").value.trim(),
            p_email: form.querySelector("#nu-email").value.trim(),
            p_pin: form.querySelector("#nu-pin").value.trim(),
            p_pkg_name: form.querySelector("#nu-pkgname").value.trim(),
            p_total: parseInt(form.querySelector("#nu-total").value,10),
            p_payment_date: form.querySelector("#nu-payment").value || null,
            p_med_cert_expiry: form.querySelector("#nu-cert").value || null
          });
          state.adminClients = null;
          state.showAddClient = false;
        } catch(e){ alert(e.message || "Errore (magari l'email esiste già)."); }
        render();
      });
      card.appendChild(form);
    }
    wrap.appendChild(card);

    var listCard = el('<div class="card"></div>');
    if(state.adminClients===null){
      listCard.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
    } else {
      state.adminClients.forEach(function(c){
        if(state.editingClientId===c.id){ listCard.appendChild(renderClientEditRow(c)); return; }
        if(state.renewingClientId===c.id){ listCard.appendChild(renderClientRenewRow(c)); return; }

        var rem = remaining(c);
        var pkgBadgeClass = rem===0 ? "badge-crit" : (rem<=2 ? "badge-warn" : "badge-good");
        var cs = certStatus({medCertExpiry:c.med_cert_expiry});
        var certBadgeClass = cs.level==="crit" ? "badge-crit" : (cs.level==="ok" ? "badge-good" : "badge-warn");
        var certLabel = cs.level==="missing" ? "certificato mancante" : (cs.level==="crit" ? "certificato scaduto" : "certificato "+fmtDateShort(c.med_cert_expiry));
        var consentLabel = c.photo_consent===true ? "foto: sì" : (c.photo_consent===false ? "foto: no" : "foto: da chiedere");
        var consentBadgeClass = c.photo_consent===true ? "badge-good" : (c.photo_consent===false ? "badge-crit" : "badge-warn");

        var row = el('<div class="list-item" style="flex-wrap:wrap"></div>');
        row.appendChild(el(
          '<div class="imain"><div class="ititle">'+esc(c.name)+'</div>'+
          '<div class="isub">'+esc(c.email)+' · '+esc(c.pkg_name)+' · '+c.used+'/'+c.total+' lezioni · ultimo pagamento '+fmtDateShort(c.payment_date)+'</div></div>'
        ));
        var badges = el('<div style="display:flex;gap:6px;flex-wrap:wrap"></div>');
        badges.appendChild(el('<span class="badge '+pkgBadgeClass+'">'+rem+' rimaste</span>'));
        badges.appendChild(el('<span class="badge '+certBadgeClass+'">'+certLabel+'</span>'));
        badges.appendChild(el('<span class="badge '+consentBadgeClass+'">'+consentLabel+'</span>'));
        row.appendChild(badges);
        var actions = el('<div class="iactions"><button class="btn btn-line btn-sm" data-act="renew">Rinnova</button><button class="btn btn-line btn-sm" data-act="edit">Modifica</button></div>');
        actions.querySelector('[data-act="renew"]').addEventListener("click", function(){ state.renewingClientId=c.id; render(); });
        actions.querySelector('[data-act="edit"]').addEventListener("click", function(){ state.editingClientId=c.id; render(); });
        row.appendChild(actions);
        listCard.appendChild(row);
      });
    }
    wrap.appendChild(listCard);
    return wrap;
  }

  function renderClientRenewRow(c){
    var row = el('<div class="inline-edit-row"></div>');
    row.appendChild(el('<div class="ititle" style="font-size:13.5px">Rinnova pacchetto — '+esc(c.name)+'</div>'));
    var form = el(
      '<form>'+
        '<div class="field-row">'+
          '<div class="field"><label>Lezioni da aggiungere</label><input type="number" id="rn-qty" min="1" value="10" required></div>'+
          '<div class="field"><label>Data pagamento</label><input type="date" id="rn-payment" value="'+todayISO()+'" required></div>'+
        '</div>'+
        '<div class="field"><label>Nome pacchetto</label><input type="text" id="rn-pkgname" value="'+esc(c.pkg_name)+'" required></div>'+
        '<div style="display:flex;gap:8px"><button type="submit" class="btn btn-primary">Conferma rinnovo</button><button type="button" class="btn btn-line" id="rn-cancel">Annulla</button></div>'+
      '</form>'
    );
    form.addEventListener("submit", async function(ev){
      ev.preventDefault();
      try {
        await rpc("app_admin_renew_client", {
          p_token: state.adminToken, p_client_id: c.id,
          p_add_lessons: parseInt(form.querySelector("#rn-qty").value,10) || 0,
          p_payment_date: form.querySelector("#rn-payment").value,
          p_pkg_name: form.querySelector("#rn-pkgname").value.trim()
        });
        state.adminClients = null;
        state.renewingClientId = null;
      } catch(e){ alert(e.message || "Errore."); }
      render();
    });
    form.querySelector("#rn-cancel").addEventListener("click", function(){ state.renewingClientId=null; render(); });
    row.appendChild(form);
    return row;
  }

  function renderClientEditRow(c){
    var row = el('<div class="inline-edit-row"></div>');
    var form = el(
      '<form>'+
        '<div class="field"><label>Nome e cognome</label><input type="text" id="eu-name" value="'+esc(c.name)+'" required></div>'+
        '<div class="field-row">'+
          '<div class="field"><label>Email</label><input type="email" id="eu-email" value="'+esc(c.email)+'" required></div>'+
          '<div class="field"><label>Nuovo PIN (lascia vuoto per non cambiarlo)</label><input type="text" id="eu-pin" inputmode="numeric" maxlength="6"></div>'+
        '</div>'+
        '<div class="field"><label>Nome pacchetto</label><input type="text" id="eu-pkgname" value="'+esc(c.pkg_name)+'" required></div>'+
        '<div class="field"><label>Scadenza certificato medico</label><input type="date" id="eu-cert" value="'+(c.med_cert_expiry||"")+'"></div>'+
        '<div style="display:flex;gap:8px">'+
          '<button type="submit" class="btn btn-primary">Salva</button>'+
          '<button type="button" class="btn btn-line" id="eu-cancel">Annulla</button>'+
          '<button type="button" class="btn btn-danger" id="eu-delete" style="margin-left:auto">Elimina cliente</button>'+
        '</div>'+
      '</form>'
    );
    form.addEventListener("submit", async function(ev){
      ev.preventDefault();
      try {
        await rpc("app_admin_update_client", {
          p_token: state.adminToken, p_client_id: c.id,
          p_name: form.querySelector("#eu-name").value.trim(),
          p_email: form.querySelector("#eu-email").value.trim(),
          p_pin: form.querySelector("#eu-pin").value.trim() || null,
          p_pkg_name: form.querySelector("#eu-pkgname").value.trim(),
          p_med_cert_expiry: form.querySelector("#eu-cert").value || null
        });
        state.adminClients = null;
        state.editingClientId = null;
      } catch(e){ alert(e.message || "Errore."); }
      render();
    });
    form.querySelector("#eu-cancel").addEventListener("click", function(){ state.editingClientId=null; render(); });
    form.querySelector("#eu-delete").addEventListener("click", async function(){
      if(confirm("Eliminare "+c.name+" e le sue prenotazioni?")){
        try { await rpc("app_admin_delete_client", { p_token: state.adminToken, p_client_id: c.id }); state.adminClients=null; state.editingClientId=null; }
        catch(e){ alert(e.message || "Errore."); }
        render();
      }
    });
    row.appendChild(form);
    return row;
  }

  function renderAdminPrenotazioni(){
    ensureAdminData();
    var wrap = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    wrap.appendChild(renderWeekNav(function(){return state.weekOffset;}, function(v){state.weekOffset=v;}));

    if(state.adminClasses===null){
      wrap.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
      return wrap;
    }
    if(state.adminClasses.length===0){
      wrap.appendChild(el('<div class="card"><div class="empty-note">Nessun orario configurato. Aggiungine uno dalla sezione Orari.</div></div>'));
      return wrap;
    }

    var wstart = weekStartISO(state.weekOffset);
    var bookingRows = state.adminBookingsCache[wstart];
    if(bookingRows === undefined && !state.adminBookingsLoading){
      loadAdminBookings(wstart);
    }
    if(state.adminBookingsLoading || bookingRows===undefined){
      wrap.appendChild(el('<div class="loading-row"><div class="spinner"></div></div>'));
      return wrap;
    }

    var days = weekDates(state.weekOffset);
    var todayIso = todayISO();
    var times = Array.from(new Set(state.adminClasses.map(function(c){ return c.time; }))).sort();

    var calWrap = el('<div class="cal-wrap"></div>');
    var grid = el('<div class="cal-grid" style="grid-template-columns:64px repeat(7,minmax(94px,1fr))"></div>');
    grid.appendChild(el('<div class="cal-corner">ORA</div>'));
    days.forEach(function(d, idx){
      var iso = toISODate(d);
      grid.appendChild(el('<div class="cal-daylabel'+(iso===todayIso?" today":"")+'">'+DAY_NAMES_SHORT[idx].toUpperCase()+'<br>'+d.getDate()+'/'+(d.getMonth()+1)+'</div>'));
    });

    times.forEach(function(t){
      grid.appendChild(el('<div class="cal-timecell">'+t+'</div>'));
      days.forEach(function(d, idx){
        var iso = toISODate(d);
        var cls = state.adminClasses.find(function(c){ return c.time===t && classOccursOn(c, iso, idx); });
        if(!cls){ grid.appendChild(el('<div class="cal-cell empty"></div>')); return; }
        var bs = bookingRows.filter(function(b){ return b.class_id===cls.id && b.booking_date===iso; });
        var full = bs.length >= cls.capacity;
        var key = cls.id+"_"+iso;
        var selected = state.selectedSlotKey===key;
        var cell = el('<div class="cal-cell slot'+(iso===todayIso?" today-col":"")+(selected?" selected":"")+'"></div>');
        cell.appendChild(el('<div class="cal-slot-time">'+t+'</div>'));
        cell.appendChild(el('<div class="cal-slot-label">'+ACTIVITY_SHORT+'</div>'));
        var chips = el('<div class="cal-chips"></div>');
        bs.slice(0,2).forEach(function(b){ chips.appendChild(el('<span class="cal-chip">'+esc(surname(b.client_name))+'</span>')); });
        if(bs.length>2) chips.appendChild(el('<span class="cal-chip more">+'+(bs.length-2)+'</span>'));
        cell.appendChild(chips);
        cell.appendChild(el('<div class="cal-count'+(full?" full":"")+' tabular">'+bs.length+'/'+cls.capacity+'</div>'));
        cell.addEventListener("click", function(){ state.selectedSlotKey = selected ? null : key; render(); });
        grid.appendChild(cell);
      });
    });
    calWrap.appendChild(grid);
    wrap.appendChild(calWrap);
    wrap.appendChild(el('<div class="hint">Tocca un turno per vedere l\'elenco completo dei prenotati e gestire le cancellazioni.</div>'));
    return wrap;
  }

  function renderSlotModal(){
    if(!state.selectedSlotKey || state.mode!=="admin" || !state.adminAuthed) return null;
    var us = state.selectedSlotKey.indexOf("_");
    var selClassId = state.selectedSlotKey.slice(0,us);
    var selDate = state.selectedSlotKey.slice(us+1);
    var wstart = weekStartISO(state.weekOffset);
    var bookingRows = state.adminBookingsCache[wstart] || [];
    var selCls = (state.adminClasses||[]).find(function(c){ return c.id===selClassId; });
    if(!selCls) return null;
    var bs = bookingRows.filter(function(b){ return b.class_id===selClassId && b.booking_date===selDate; });
    var dd = new Date(selDate+"T00:00:00");

    var overlay = el('<div class="modal-overlay"></div>');
    var box = el('<div class="modal-box"></div>');
    box.appendChild(el(
      '<div class="modal-head"><div><div style="font-family:Fredoka;font-weight:600;font-size:16px">'+esc(fmtDayLabel(dd))+'</div>'+
      '<div class="hint" style="margin-top:2px">'+esc(selCls.time)+' · '+bs.length+'/'+selCls.capacity+' posti prenotati</div></div>'+
      '<button class="modal-close" aria-label="Chiudi">✕</button></div>'
    ));
    box.querySelector(".modal-close").addEventListener("click", function(){ state.selectedSlotKey=null; render(); });

    var list = el('<div></div>');
    if(bs.length===0){
      list.appendChild(el('<div class="empty-note">Nessuna prenotazione per questo turno.</div>'));
    } else {
      bs.forEach(function(b){
        var row = el(
          '<div class="list-item"><div class="imain"><div class="ititle" style="font-weight:600">'+esc(b.client_name)+'</div>'+
          '<div class="isub">'+esc(b.client_email)+'</div></div>'+
          '<div class="iactions"><button class="btn btn-danger btn-sm">Annulla</button></div></div>'
        );
        row.querySelector("button").addEventListener("click", async function(){
          try {
            await rpc("app_admin_cancel_booking", { p_token: state.adminToken, p_booking_id: b.booking_id });
            delete state.adminBookingsCache[wstart];
            state.adminClients = null;
          } catch(e){ alert(e.message || "Errore."); }
          render();
        });
        list.appendChild(row);
      });
    }
    box.appendChild(list);
    overlay.appendChild(box);
    overlay.addEventListener("click", function(ev){ if(ev.target===overlay){ state.selectedSlotKey=null; render(); } });
    return overlay;
  }

  function renderPrivacyModal(){
    if(!state.showPrivacy) return null;
    var overlay = el('<div class="modal-overlay"></div>');
    var box = el('<div class="modal-box" style="max-width:520px"></div>');
    box.appendChild(el(
      '<div class="modal-head"><div style="font-family:Fredoka;font-weight:600;font-size:16px">Informativa privacy</div>'+
      '<button class="modal-close" aria-label="Chiudi">✕</button></div>'
    ));
    box.querySelector(".modal-close").addEventListener("click", function(){ state.showPrivacy=false; render(); });
    PRIVACY_SECTIONS.forEach(function(s){
      box.appendChild(el('<div style="font-family:Fredoka;font-weight:600;font-size:13.5px;margin-top:14px;margin-bottom:4px;color:var(--magenta-ink)">'+esc(s.h)+'</div>'));
      box.appendChild(el('<div style="font-size:13px;color:var(--ink-soft);line-height:1.5">'+esc(s.body)+'</div>'));
    });
    overlay.appendChild(box);
    overlay.addEventListener("click", function(ev){ if(ev.target===overlay){ state.showPrivacy=false; render(); } });
    return overlay;
  }

  render();
})();
