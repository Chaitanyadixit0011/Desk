(function () {
  "use strict";

  var KEY = "desk-journal-v1";
  var STARTING_CASH = 10000;
  var INR_PER_USD = 88;
  var EXIT_REASONS = [
    "5m Buy joined 10m",
    "10m Buy confirmed 5m",
    "5m Sell joined 10m",
    "10m Sell confirmed 5m",
    "first_5m",
    "PM_high",
    "PM_low",
    "cloud2_red",
    "cloud2_green",
    "name_stop_-50",
    "manual",
  ];
  var MAIN = ["TSLA", "SPCX", "INTC", "ORCL", "IREN", "RKLB", "ARKK", "CRWV", "MRVL", "NVDA", "SKHY", "AAPL"];
  var TEMP = [
    "AAOI", "AEHR", "AMAT", "AMD", "AMZN", "ANET", "ARM", "ASTS", "AVAV", "AVGO", "AZO", "BE", "BULL",
    "CEG", "CRDO", "CRM", "DELL", "FN", "GLW", "HOOD", "IWM", "LQDA", "MRNA", "MSFT", "MU", "NBIS",
    "NFLX", "NKE", "NOW", "NVO", "PANW", "QQQ", "RDDT", "ROSS", "SMCI", "SMH", "SNDK", "SOFI", "TJX",
    "TMDX", "URA", "VST", "WYFI",
  ];
  var NAV = [
    ["dashboard", "Dashboard", "dash"],
    ["watchlists", "Watchlists", "star"],
    ["open", "Open", "book"],
    ["closed", "Closed", "book"],
    ["journal", "Journal", "cal"],
    ["add", "Add trade", "plus"],
    ["io", "Import / Export", "down"],
    ["settings", "Settings", "gear"],
  ];

  var ui = {
    route: "dashboard",
    editId: null,
    closingId: null,
    watchTab: "main",
    closedTicker: "",
    closedSide: "all",
    menu: false,
    ocrBusy: false,
    ocrErr: "",
    ocrRaw: "",
    ioMsg: "",
    draft: null,
    cal: null,
    journalYear: new Date().getFullYear(),
    journalMonth: new Date().getMonth(),
    journalDay: "",
    journalFilter: "all",
    monthPick: false,
  };

  function seedWatch() {
    return MAIN.map(function (s) {
      return { symbol: s, list: "main", note: "", event: "", permission: "none" };
    }).concat(
      TEMP.map(function (s) {
        return { symbol: s, list: "temp", note: "", event: "", permission: "none" };
      })
    );
  }

  function emptyBook() {
    return {
      startingCash: STARTING_CASH,
      inrPerUsd: INR_PER_USD,
      nextId: 1,
      trades: [],
      watch: seedWatch(),
      range: "30d",
      rangeFrom: "",
      rangeTo: "",
      watchTab: "main",
      watchOpen: { main: [], temp: [] },
    };
  }

  var book = emptyBook();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return emptyBook();
      var parsed = JSON.parse(raw);
      var s = parsed && parsed.state ? parsed.state : parsed;
      var next = emptyBook();
      if (s.startingCash && s.startingCash > 0) next.startingCash = s.startingCash;
      if (s.inrPerUsd && s.inrPerUsd > 0) next.inrPerUsd = s.inrPerUsd;
      if (s.nextId && s.nextId > 0) next.nextId = s.nextId;
      if (Array.isArray(s.trades)) next.trades = s.trades;
      if (Array.isArray(s.watch) && s.watch.length) next.watch = s.watch;
      if (s.range === "7d" || s.range === "30d" || s.range === "90d" || s.range === "all" || s.range === "custom") {
        next.range = s.range;
      }
      if (s.rangeFrom) next.rangeFrom = s.rangeFrom;
      if (s.rangeTo) next.rangeTo = s.rangeTo;
      if (s.watchTab === "main" || s.watchTab === "temp") next.watchTab = s.watchTab;
      if (s.watchOpen && typeof s.watchOpen === "object") {
        next.watchOpen = {
          main: Array.isArray(s.watchOpen.main) ? s.watchOpen.main : [],
          temp: Array.isArray(s.watchOpen.temp) ? s.watchOpen.temp : [],
        };
      }
      return next;
    } catch (e) {
      return emptyBook();
    }
  }

  function save() {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          startingCash: book.startingCash,
          inrPerUsd: book.inrPerUsd || INR_PER_USD,
          nextId: book.nextId,
          trades: book.trades,
          watch: book.watch,
          range: book.range,
          rangeFrom: book.rangeFrom || "",
          rangeTo: book.rangeTo || "",
          watchTab: book.watchTab || "main",
          watchOpen: book.watchOpen || { main: [], temp: [] },
        },
        version: 0,
      })
    );
  }

  function padId(n) {
    return "T" + String(n).padStart(3, "0");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;")
      .replace(/'/g, "&#39;");
  }

  function fx() {
    var r = Number(book.inrPerUsd);
    return r > 0 ? r : INR_PER_USD;
  }

  function rupees(usd, digits) {
    if (digits == null) digits = 0;
    var n = usd * fx();
    var sign = n < 0 ? "-" : "";
    return (
      sign +
      "₹" +
      Math.abs(n).toLocaleString("en-IN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    );
  }

  function money(n, digits) {
    if (digits == null) digits = 2;
    var sign = n < 0 ? "-" : "";
    return (
      sign +
      "$" +
      Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    );
  }

  function signedMoney(n, digits) {
    if (digits == null) digits = 2;
    var sign = n > 0 ? "+" : n < 0 ? "-" : "";
    return (
      sign +
      "$" +
      Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    );
  }

  function fmtNum(n, digits) {
    return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function parseLocalDateTime(value) {
    if (!value) return nowIso();
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return nowIso();
    try {
      return d.toISOString();
    } catch (e) {
      return nowIso();
    }
  }

  function toDatetimeLocal(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    function p(n) {
      return String(n).padStart(2, "0");
    }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function splitLocal(value) {
    var d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) d = new Date();
    var h24 = d.getHours();
    var ampm = h24 >= 12 ? "PM" : "AM";
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return {
      date: d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()),
      hour: String(h12),
      min: pad2(d.getMinutes()),
      ampm: ampm,
    };
  }

  function joinLocal(date, hour, min, ampm) {
    if (!date) date = splitLocal("").date;
    var h = Number(hour);
    if (!Number.isFinite(h) || h < 1) h = 12;
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return date + "T" + pad2(h) + ":" + pad2(Number(min) || 0);
  }

  function prettyDate(isoDate) {
    if (!isoDate) return "Pick date";
    var p = isoDate.split("-").map(Number);
    if (p.length < 3 || !p[0]) return "Pick date";
    var d = new Date(p[0], p[1] - 1, p[2]);
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  }

  function clockParts(zone) {
    var now = new Date();
    return {
      date: new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        day: "2-digit",
        month: "short",
      }).format(now),
      time: new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now),
    };
  }

  function hourOptions(selected) {
    var html = "";
    for (var i = 1; i <= 12; i++) {
      html += '<option value="' + i + '"' + (String(selected) === String(i) ? " selected" : "") + ">" + i + "</option>";
    }
    return html;
  }

  function minOptions(selected) {
    var html = "";
    for (var i = 0; i < 60; i++) {
      var v = pad2(i);
      html += '<option value="' + v + '"' + (selected === v ? " selected" : "") + ">" + v + "</option>";
    }
    return html;
  }

  function dateTimeField(name, localValue) {
    var p = splitLocal(localValue);
    var joined = joinLocal(p.date, p.hour, p.min, p.ampm);
    return (
      '<div class="dt" data-dt="' +
      esc(name) +
      '"><button type="button" class="dt-date" data-act="open-cal" data-target="' +
      esc(name) +
      '" data-iso="' +
      esc(p.date) +
      '">' +
      esc(prettyDate(p.date)) +
      "</button>" +
      '<button type="button" class="btn btn-sm cal-btn" data-act="open-cal" data-target="' +
      esc(name) +
      '" aria-label="Open calendar">' +
      icon("cal") +
      "</button>" +
      '<select data-part="hour">' +
      hourOptions(p.hour) +
      "</select>" +
      '<select data-part="min">' +
      minOptions(p.min) +
      "</select>" +
      '<select data-part="ampm"><option value="AM"' +
      (p.ampm === "AM" ? " selected" : "") +
      '>AM</option><option value="PM"' +
      (p.ampm === "PM" ? " selected" : "") +
      ">PM</option></select>" +
      '<input type="hidden" name="' +
      esc(name) +
      '" id="' +
      esc(name) +
      '" value="' +
      esc(joined) +
      '"></div>'
    );
  }

  function calendarHtml() {
    var cal = ui.cal;
    if (!cal) return "";
    var year = cal.year;
    var month = cal.month;
    var first = new Date(year, month, 1);
    var start = first.getDay();
    var days = new Date(year, month + 1, 0).getDate();
    var title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(first);
    var cells = "";
    var i;
    for (i = 0; i < start; i++) cells += "<span></span>";
    for (i = 1; i <= days; i++) {
      var iso = year + "-" + pad2(month + 1) + "-" + pad2(i);
      var on = cal.selected === iso ? " on" : "";
      cells +=
        '<button type="button" class="cal-day' +
        on +
        '" data-act="cal-day" data-iso="' +
        iso +
        '">' +
        i +
        "</button>";
    }
    return (
      '<div class="cal-back" data-act="cal-close"><div class="cal-pop" id="cal-pop">' +
      '<div class="cal-nav"><button type="button" class="btn btn-sm btn-ghost" data-act="cal-prev" aria-label="Previous month">' +
      "‹</button><p>" +
      esc(title) +
      '</p><button type="button" class="btn btn-sm btn-ghost" data-act="cal-next" aria-label="Next month">›</button></div>' +
      '<div class="cal-wk"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>' +
      '<div class="cal-grid">' +
      cells +
      "</div></div></div>"
    );
  }

  function monthPickHtml() {
    if (!ui.monthPick) return "";
    var y = ui.journalYear;
    var names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var cells = names
      .map(function (name, i) {
        return (
          '<button type="button" class="cal-day' +
          (i === ui.journalMonth ? " on" : "") +
          '" data-act="j-pick-month" data-month="' +
          i +
          '">' +
          name +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="cal-back" data-act="j-month-close"><div class="cal-pop" id="month-pop">' +
      '<div class="cal-nav"><button type="button" class="btn btn-sm btn-ghost" data-act="j-year-prev">‹</button><p>' +
      y +
      '</p><button type="button" class="btn btn-sm btn-ghost" data-act="j-year-next">›</button></div>' +
      '<div class="month-grid">' +
      cells +
      "</div></div></div>"
    );
  }

  function openCalFor(target) {
    var wrap = document.querySelector('[data-dt="' + target + '"]');
    var iso = "";
    if (wrap) {
      var btn = wrap.querySelector(".dt-date");
      iso = (btn && btn.getAttribute("data-iso")) || "";
    }
    if (!iso) iso = splitLocal(target.indexOf("range") === 0 ? book[target === "range-from" ? "rangeFrom" : "rangeTo"] : "").date;
    var parts = iso.split("-").map(Number);
    ui.cal = {
      target: target,
      year: parts[0] || new Date().getFullYear(),
      month: (parts[1] || new Date().getMonth() + 1) - 1,
      selected: iso,
    };
  }

  function applyCalDay(iso) {
    var target = ui.cal && ui.cal.target;
    ui.cal = null;
    if (!target) return;
    var wrap = document.querySelector('[data-dt="' + target + '"]');
    var hour = "12";
    var min = "00";
    var ampm = "AM";
    if (wrap) {
      hour = wrap.querySelector('[data-part="hour"]').value;
      min = wrap.querySelector('[data-part="min"]').value;
      ampm = wrap.querySelector('[data-part="ampm"]').value;
    }
    var joined = joinLocal(iso, hour, min, ampm);
    if (target === "range-from" || target === "range-to") {
      if (target === "range-from") book.rangeFrom = joined;
      else book.rangeTo = joined;
      book.range = "custom";
      save();
      render();
      return;
    }
    var form = document.getElementById("trade-form");
    if (form) ui.draft = readForm(form);
    if (!ui.draft) ui.draft = emptyDraft();
    ui.draft[target] = joined;
    render();
  }

  function syncDtWrap(wrap) {
    if (!wrap) return "";
    var iso = wrap.querySelector(".dt-date").getAttribute("data-iso") || "";
    var hour = wrap.querySelector('[data-part="hour"]').value;
    var min = wrap.querySelector('[data-part="min"]').value;
    var ampm = wrap.querySelector('[data-part="ampm"]').value;
    var joined = joinLocal(iso, hour, min, ampm);
    var hidden = wrap.querySelector("input[type=hidden]");
    if (hidden) hidden.value = joined;
    return joined;
  }

  function nyDate(d) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function formatZone(iso, zone) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: zone === "IST" ? "Asia/Kolkata" : "America/New_York",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch (e) {
      return "—";
    }
  }

  function clockLabel(zone) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date());
  }

  function openWatchList(tab) {
    if (!book.watchOpen) book.watchOpen = { main: [], temp: [] };
    if (!Array.isArray(book.watchOpen[tab])) book.watchOpen[tab] = [];
    return book.watchOpen[tab];
  }

  function isWatchPinned(tab, symbol) {
    return openWatchList(tab).indexOf(symbol) >= 0;
  }

  function toggleWatchPin(tab, symbol) {
    var list = openWatchList(tab);
    var i = list.indexOf(symbol);
    if (i >= 0) list.splice(i, 1);
    else list.push(symbol);
  }

  function dropWatchPin(symbol) {
    ["main", "temp"].forEach(function (tab) {
      book.watchOpen[tab] = openWatchList(tab).filter(function (s) {
        return s !== symbol;
      });
    });
  }

  function realizedPnl(t) {
    if (t.status !== "closed" || t.exitPrice == null) return 0;
    var exitCharges = t.exitCharges || 0;
    var move = t.side === "long" ? (t.exitPrice - t.entryPrice) * t.shares : (t.entryPrice - t.exitPrice) * t.shares;
    return move - t.entryCharges - exitCharges;
  }

  function unrealizedPnl(t) {
    if (t.status !== "open") return 0;
    var mark = t.markPrice || t.entryPrice;
    return t.side === "long" ? (mark - t.entryPrice) * t.shares : (t.entryPrice - mark) * t.shares;
  }

  function cashAfter(startingCash, trades) {
    var cash = startingCash;
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (t.side === "long") {
        cash -= t.sizeUsd + t.entryCharges;
        if (t.status === "closed" && t.exitPrice != null) cash += t.shares * t.exitPrice - (t.exitCharges || 0);
      } else {
        cash += t.sizeUsd - t.entryCharges;
        if (t.status === "closed" && t.exitPrice != null) cash -= t.shares * t.exitPrice + (t.exitCharges || 0);
      }
    }
    return cash;
  }

  function openMarketValue(trades) {
    var v = 0;
    var open = trades.filter(function (x) {
      return x.status === "open";
    });
    for (var i = 0; i < open.length; i++) {
      var t = open[i];
      var mark = t.markPrice || t.entryPrice;
      if (t.side === "long") v += t.shares * mark;
      else v -= t.shares * mark;
    }
    return v;
  }

  function rangeBound(iso, endOfDay) {
    if (!iso) return null;
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay && iso.length <= 10) d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function inRange(iso, range) {
    if (!iso) return range === "all";
    var t = new Date(iso).getTime();
    if (Number.isNaN(t)) return false;
    if (range === "all") return true;
    if (range === "custom") {
      var from = rangeBound(book.rangeFrom, false);
      var to = rangeBound(book.rangeTo, true);
      if (from != null && t < from) return false;
      if (to != null && t > to) return false;
      return from != null || to != null;
    }
    var days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    return Date.now() - t <= days * 86400000;
  }

  function weekStartNy(d) {
    var parts = nyDate(d || new Date()).split("-").map(Number);
    var utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    var wd = utc.getUTCDay();
    utc.setUTCDate(utc.getUTCDate() + (wd === 0 ? -6 : 1 - wd));
    return utc;
  }

  function isSameNyDay(iso, d) {
    return nyDate(new Date(iso)) === nyDate(d || new Date());
  }

  function isThisNyWeek(iso) {
    var start = weekStartNy();
    var end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    var parts = nyDate(new Date(iso)).split("-").map(Number);
    var t = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getTime();
    return t >= start.getTime() && t < end.getTime();
  }

  function equityPoints(startingCash, trades, range) {
    var closed = trades
      .filter(function (t) {
        return t.status === "closed" && t.exitIso && inRange(t.exitIso, range);
      })
      .slice()
      .sort(function (a, b) {
        return a.exitIso > b.exitIso ? 1 : -1;
      });
    var eq = startingCash;
    var startT = Date.now();
    if (range === "custom" && book.rangeFrom) {
      var customStart = rangeBound(book.rangeFrom, false);
      if (customStart != null) startT = customStart;
    } else if (range === "all") startT = Date.now() - 86400000 * 30;
    else if (range === "7d") startT = Date.now() - 7 * 86400000;
    else if (range === "30d") startT = Date.now() - 30 * 86400000;
    else if (range === "90d") startT = Date.now() - 90 * 86400000;
    var pts = [{ t: startT, v: startingCash, id: "start" }];
    for (var i = 0; i < closed.length; i++) {
      eq += realizedPnl(closed[i]);
      pts.push({ t: new Date(closed[i].exitIso).getTime(), v: eq, id: closed[i].id });
    }
    var openU = trades
      .filter(function (t) {
        return t.status === "open";
      })
      .reduce(function (s, t) {
        return s + unrealizedPnl(t);
      }, 0);
    pts.push({ t: Date.now(), v: eq + openU, id: "now" });
    return pts;
  }

  function csvEsc(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function tradesToCsv(trades) {
    var header = [
      "id", "ticker", "side", "status", "entryIso", "entryPrice", "shares", "sizeUsd", "entryCharges",
      "note", "markPrice", "exitIso", "exitPrice", "exitCharges", "exitReason", "reviewNote", "realizedPnl",
    ].join(",");
    var rows = trades.map(function (t) {
      return [
        t.id, t.ticker, t.side, t.status, t.entryIso, t.entryPrice, t.shares, t.sizeUsd, t.entryCharges,
        t.note, t.markPrice, t.exitIso || "", t.exitPrice != null ? t.exitPrice : "",
        t.exitCharges != null ? t.exitCharges : "", t.exitReason || "", t.reviewNote || "",
        t.status === "closed" ? realizedPnl(t) : "",
      ]
        .map(csvEsc)
        .join(",");
    });
    return [header].concat(rows).join("\n");
  }

  function splitCsvLine(line) {
    var out = [];
    var cur = "";
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  }

  function num(v, fallback) {
    if (fallback == null) fallback = 0;
    if (v == null || v === "") return fallback;
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function csvToTrades(text) {
    var lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (l) {
      return l.trim();
    });
    if (lines.length < 2) return [];
    var header = splitCsvLine(lines[0]).map(function (h) {
      return h.trim().toLowerCase();
    });
    function idx(name, alts) {
      var keys = [name].concat(alts || []).map(function (k) {
        return k.toLowerCase();
      });
      for (var i = 0; i < header.length; i++) if (keys.indexOf(header[i]) >= 0) return i;
      return -1;
    }
    function get(cols, i) {
      return i >= 0 ? cols[i] || "" : "";
    }
    var iId = idx("id", ["trade_id"]);
    var iTicker = idx("ticker");
    var iSide = idx("side");
    var iStatus = idx("status");
    var iEntry = idx("entryiso", ["entry_time", "fill_ist", "entry"]);
    var iPx = idx("entryprice", ["fill_price", "entry_price", "price"]);
    var iSh = idx("shares");
    var iSize = idx("sizeusd", ["size_usd", "size"]);
    var iCh = idx("entrycharges", ["charges", "entry_charges"]);
    var iNote = idx("note");
    var iMark = idx("markprice", ["last_price", "mark"]);
    var iExit = idx("exitiso", ["exit_time", "exit_ist"]);
    var iExPx = idx("exitprice", ["exit_price"]);
    var iExCh = idx("exitcharges", ["exit_charges"]);
    var iReason = idx("exitreason", ["exit_reason"]);
    var iRev = idx("reviewnote", ["review_note"]);
    var trades = [];
    lines.slice(1).forEach(function (line, n) {
      var cols = splitCsvLine(line);
      var ticker = get(cols, iTicker).toUpperCase().trim();
      if (!ticker) return;
      var sideRaw = get(cols, iSide).toLowerCase();
      var side = sideRaw.indexOf("short") >= 0 || sideRaw.indexOf("sell") >= 0 ? "short" : "long";
      var statusRaw = get(cols, iStatus).toLowerCase();
      var exitPx = get(cols, iExPx);
      var status = statusRaw === "closed" || exitPx ? "closed" : "open";
      var entryPrice = num(get(cols, iPx));
      var shares = num(get(cols, iSh), 1);
      var sizeUsd = num(get(cols, iSize), entryPrice * shares);
      trades.push({
        id: get(cols, iId) || "IMP" + (n + 1),
        ticker: ticker,
        side: side,
        status: status,
        entryIso: get(cols, iEntry) || nowIso(),
        entryPrice: entryPrice,
        shares: shares,
        sizeUsd: sizeUsd,
        entryCharges: num(get(cols, iCh)),
        note: get(cols, iNote),
        markPrice: num(get(cols, iMark), entryPrice),
        exitIso: get(cols, iExit) || undefined,
        exitPrice: exitPx ? num(exitPx) : undefined,
        exitCharges: get(cols, iExCh) ? num(get(cols, iExCh)) : undefined,
        exitReason: get(cols, iReason) || undefined,
        reviewNote: get(cols, iRev) || undefined,
      });
    });
    return trades;
  }

  function exportBundle() {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: nowIso(),
        startingCash: book.startingCash,
        inrPerUsd: book.inrPerUsd || INR_PER_USD,
        nextId: book.nextId,
        trades: book.trades,
        watch: book.watch,
        watchTab: book.watchTab || "main",
        watchOpen: book.watchOpen || { main: [], temp: [] },
      },
      null,
      2
    );
  }

  function importBundle(raw) {
    try {
      var data = JSON.parse(raw);
      if (!Array.isArray(data.trades) && !Array.isArray(data.watch)) return null;
      return {
        startingCash: data.startingCash,
        inrPerUsd: data.inrPerUsd,
        nextId: data.nextId,
        trades: data.trades,
        watch: data.watch,
        watchTab: data.watchTab,
        watchOpen: data.watchOpen,
      };
    } catch (e) {
      return null;
    }
  }

  function grab(re, text) {
    var m = text.match(re);
    return m && m[1] ? m[1].trim() : undefined;
  }

  function numFrom(s) {
    if (!s) return undefined;
    var n = Number(String(s).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }

  function parseOrderText(text) {
    var raw = text.replace(/\r/g, "");
    var upper = raw.toUpperCase();
    var ticker = grab(/STOCK\s*TICKER\s*[:\s]+([A-Z.]{1,6})/i, raw) || grab(/\bTICKER\s*[:\s]+([A-Z.]{1,6})/i, raw) || grab(/\$([A-Z]{1,5})\b/, raw);
    var isSell = /\bSELL\b/.test(upper);
    var isBuy = /\bBUY\b/.test(upper);
    var side;
    if (/\bSHORT\b/.test(upper)) side = "short";
    if (isBuy) side = "long";
    var ot = grab(/ORDER\s*TYPE\s*[:\s]+([A-Z, ]+)/i, raw);
    if (ot && /\bSHORT\b/.test(ot.toUpperCase())) side = "short";
    if (ot && /\bBUY\b/.test(ot.toUpperCase())) side = "long";
    var avg = numFrom(grab(/AVG\.?\s*PRICE\s*[:\s$]*([0-9,]+\.?[0-9]*)/i, raw) || grab(/\bPRICE\s*[:\s$]*([0-9,]+\.?[0-9]*)/i, raw));
    var qty = numFrom(grab(/QUANTITY\s*[:\s]*([0-9,]+\.?[0-9]*)/i, raw) || grab(/\bQTY\s*[:\s]*([0-9,]+\.?[0-9]*)/i, raw) || grab(/\bSHARES\s*[:\s]*([0-9,]+\.?[0-9]*)/i, raw));
    var value = numFrom(grab(/ORDER\s*VALUE\s*[:\s$]*([0-9,]+\.?[0-9]*)/i, raw) || grab(/\bVALUE\s*[:\s$]*([0-9,]+\.?[0-9]*)/i, raw));
    var charges = numFrom(grab(/CHARGES?\s*[:\s$]*([0-9,]+\.?[0-9]*)/i, raw) || grab(/\bFEE[S]?\s*[:\s$]*([0-9,]+\.?[0-9]*)/i, raw));
    return {
      ticker: ticker ? ticker.replace(/\./g, "") : undefined,
      side: side,
      entryPrice: avg,
      shares: qty,
      sizeUsd: value,
      charges: charges,
      isBuy: isBuy,
      isSell: isSell,
      raw: raw,
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("Could not load OCR engine"));
      };
      document.head.appendChild(s);
    });
  }

  function ocrImage(file) {
    if (location.protocol === "file:") {
      return Promise.reject(new Error("Screenshot OCR needs the journal hosted (GitHub Pages). Type the fill, or paste the order text."));
    }
    var p = window.Tesseract ? Promise.resolve() : loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    return p.then(function () {
      return window.Tesseract.recognize(file, "eng");
    }).then(function (res) {
      return parseOrderText((res && res.data && res.data.text) || "");
    });
  }

  function icon(name) {
    var paths = {
      dash: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
      book: '<path d="M5 5h10v14H5z"/><path d="M9 5v14"/>',
      star: '<polygon points="12 3 14.5 8.8 21 9.3 16.2 13.4 17.6 20 12 16.8 6.4 20 7.8 13.4 3 9.3 9.5 8.8"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      down: '<path d="M12 5v12M6 13l6 6 6-6"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>',
      cal: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 4v4M16 4v4M4 11h16"/>',
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  }

  function hashRoute() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var parts = h.split("?");
    var path = parts[0] || "dashboard";
    var q = {};
    if (parts[1]) {
      parts[1].split("&").forEach(function (pair) {
        var kv = pair.split("=");
        q[decodeURIComponent(kv[0] || "")] = decodeURIComponent(kv[1] || "");
      });
    }
    if (path === "" || path === "index.html") path = "dashboard";
    return { path: path, q: q };
  }

  function go(path) {
    location.hash = "#/" + path.replace(/^\//, "");
  }

  function titles() {
    return {
      dashboard: "Dashboard",
      journal: "Journal",
      open: "Open trades",
      closed: "Closed trades",
      watchlists: "Watchlists",
      add: ui.editId ? "Edit " + ui.editId : "Add trade",
      io: "Import / Export",
      settings: "Settings",
    };
  }

  function emptyDraft(partial) {
    var d = {
      ticker: "",
      side: "long",
      entryLocal: toDatetimeLocal(),
      entryPrice: "",
      shares: "",
      sizeUsd: "900",
      entryCharges: "0",
      note: "",
      markPrice: "",
      asClosed: false,
      exitLocal: toDatetimeLocal(),
      exitPrice: "",
      exitCharges: "0",
      exitReason: "manual",
      reviewNote: "",
    };
    if (partial) Object.keys(partial).forEach(function (k) { d[k] = partial[k]; });
    return d;
  }

  function tradeToDraft(t) {
    return emptyDraft({
      ticker: t.ticker,
      side: t.side,
      entryLocal: toDatetimeLocal(t.entryIso),
      entryPrice: String(t.entryPrice),
      shares: String(t.shares),
      sizeUsd: String(t.sizeUsd),
      entryCharges: String(t.entryCharges),
      note: t.note || "",
      markPrice: String(t.markPrice || ""),
      asClosed: t.status === "closed",
      exitLocal: toDatetimeLocal(t.exitIso),
      exitPrice: t.exitPrice != null ? String(t.exitPrice) : "",
      exitCharges: String(t.exitCharges || 0),
      exitReason: t.exitReason || "manual",
      reviewNote: t.reviewNote || "",
    });
  }

  function n(v) {
    var x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  function draftToTrade(d) {
    var entryPrice = n(d.entryPrice);
    var shares = n(d.shares);
    var sizeUsd = n(d.sizeUsd);
    if (shares && entryPrice && !sizeUsd) sizeUsd = shares * entryPrice;
    if (sizeUsd && entryPrice && !shares) shares = sizeUsd / entryPrice;
    var mark = n(d.markPrice) || entryPrice;
    var status = d.asClosed ? "closed" : "open";
    return {
      ticker: String(d.ticker || "").trim().toUpperCase(),
      side: d.side,
      status: status,
      entryIso: parseLocalDateTime(d.entryLocal),
      entryPrice: entryPrice,
      shares: shares,
      sizeUsd: sizeUsd,
      entryCharges: n(d.entryCharges),
      note: d.note || "",
      markPrice: mark,
      exitIso: d.asClosed ? parseLocalDateTime(d.exitLocal) : undefined,
      exitPrice: d.asClosed ? n(d.exitPrice) : undefined,
      exitCharges: d.asClosed ? n(d.exitCharges) : undefined,
      exitReason: d.asClosed ? d.exitReason : undefined,
      reviewNote: d.asClosed ? d.reviewNote : undefined,
    };
  }

  function estimatedPnl(d) {
    var entry = n(d.entryPrice);
    var shares = n(d.shares) || (n(d.sizeUsd) && entry ? n(d.sizeUsd) / entry : 0);
    var exit = n(d.exitPrice);
    if (!entry || !shares || !exit) return 0;
    var move = d.side === "long" ? (exit - entry) * shares : (entry - exit) * shares;
    return move - n(d.entryCharges) - n(d.exitCharges);
  }

  function field(label, inner, extraClass) {
    return '<label class="field ' + (extraClass || "") + '"><span>' + esc(label) + "</span>" + inner + "</label>";
  }

  function tradeFormHtml(d, submitLabel, forceClose) {
    d = d || emptyDraft();
    var closed = forceClose || d.asClosed;
    var pnl = estimatedPnl(d);
    var reasons = EXIT_REASONS.map(function (r) {
      return '<option value="' + esc(r) + '"' + (d.exitReason === r ? " selected" : "") + ">" + esc(r) + "</option>";
    }).join("");
    var exitBlock = closed
      ? '<div class="card" style="padding:16px;border-radius:16px">' +
        "<p>Exit review</p>" +
        '<div class="grid-2">' +
        field("Exit time", dateTimeField("exitLocal", d.exitLocal)) +
        field("Exit price", '<input inputmode="decimal" name="exitPrice" value="' + esc(d.exitPrice) + '">') +
        field("Exit charges", '<input inputmode="decimal" name="exitCharges" value="' + esc(d.exitCharges) + '">') +
        field("Exit reason", '<select name="exitReason">' + reasons + "</select>") +
        "</div><p class=\"mono\" style=\"margin:8px 0 0\">Estimated P&L: <span class=\"" +
        (pnl >= 0 ? "up" : "down") +
        '">' +
        (pnl >= 0 ? "+" : "") +
        pnl.toFixed(2) +
        "</span></p>" +
        field(pnl >= 0 ? "What went right?" : "What went wrong / what did you do wrong?", '<textarea name="reviewNote" required placeholder="Required before save">' + esc(d.reviewNote) + "</textarea>") +
        "</div>"
      : "";
    return (
      '<form id="trade-form" class="stack">' +
      '<div class="card ocr-box"><p class="ocr-title">Enter from screenshot</p>' +
      '<p class="muted">Upload the buy ticket first. Upload the sell ticket next and DESK fills the exit. On a local file, paste the order text if the image cannot be read.</p>' +
      '<input class="file" type="file" accept="image/*" name="ocrFile">' +
      (ui.ocrBusy ? '<p class="muted">Reading image…</p>' : "") +
      (ui.ocrErr ? '<p class="down">' + esc(ui.ocrErr) + "</p>" : "") +
      '<p class="muted" style="margin-top:12px">Or paste order text</p>' +
      '<textarea name="ocrPaste" placeholder="STOCK TICKER : ORCL …">' +
      esc(ui.ocrRaw || "") +
      "</textarea>" +
      '<div class="row" style="margin-top:8px"><button type="button" class="btn btn-sm" data-act="parse-paste">Parse pasted text</button></div></div>' +
      (ui.ocrRaw ? "<pre class=\"ocr\">" + esc(ui.ocrRaw) + "</pre>" : "") +
      '<div class="grid-2">' +
      field("Ticker", '<input name="ticker" value="' + esc(d.ticker) + '">') +
      field("Side", '<select name="side"><option value="long"' + (d.side === "long" ? " selected" : "") + ">Long / buy</option><option value=\"short\"" + (d.side === "short" ? " selected" : "") + ">Short / sell</option></select>") +
      field("Entry (your local time)", dateTimeField("entryLocal", d.entryLocal), "span-2") +
      field("Entry price", '<input inputmode="decimal" name="entryPrice" value="' + esc(d.entryPrice) + '">') +
      field("Shares", '<input inputmode="decimal" name="shares" value="' + esc(d.shares) + '">') +
      field("Size $", '<input inputmode="decimal" name="sizeUsd" value="' + esc(d.sizeUsd) + '">') +
      field("Entry charges", '<input inputmode="decimal" name="entryCharges" value="' + esc(d.entryCharges) + '">') +
      field("Mark / last (unrealized)", '<input inputmode="decimal" name="markPrice" value="' + esc(d.markPrice) + '">') +
      field("Note", '<textarea name="note">' + esc(d.note) + "</textarea>", "span-2") +
      "</div>" +
      (forceClose
        ? ""
        : '<label class="field" style="flex-direction:row;align-items:center;height:44px;gap:8px"><input type="checkbox" name="asClosed"' +
          (d.asClosed ? " checked" : "") +
          ' data-act="toggle-closed"> Log as already closed</label>') +
      exitBlock +
      '<button type="submit" class="btn btn-primary"' +
      (!d.ticker ? "" : "") +
      ">" +
      esc(submitLabel) +
      "</button></form>"
    );
  }

  function readForm(form) {
    var fd = new FormData(form);
    function g(k) {
      return String(fd.get(k) || "");
    }
    return emptyDraft({
      ticker: g("ticker"),
      side: g("side") === "short" ? "short" : "long",
      entryLocal: g("entryLocal"),
      entryPrice: g("entryPrice"),
      shares: g("shares"),
      sizeUsd: g("sizeUsd"),
      entryCharges: g("entryCharges"),
      note: g("note"),
      markPrice: g("markPrice"),
      asClosed: form.querySelector('[name=asClosed]') ? form.querySelector('[name=asClosed]').checked : true,
      exitLocal: g("exitLocal") || toDatetimeLocal(),
      exitPrice: g("exitPrice"),
      exitCharges: g("exitCharges") || "0",
      exitReason: g("exitReason") || "manual",
      reviewNote: g("reviewNote"),
    });
  }

  function applyParsed(parsed) {
    var form = document.getElementById("trade-form");
    if (!form) return;
    var asExit = parsed.isSell && !parsed.isBuy && (form.ticker.value || parsed.ticker);
    if (asExit && (form.entryPrice.value || form.ticker.value)) {
      ui.draft = readForm(form);
      ui.draft.asClosed = true;
      if (parsed.ticker) ui.draft.ticker = parsed.ticker;
      if (parsed.entryPrice != null) ui.draft.exitPrice = String(parsed.entryPrice);
      if (parsed.shares != null) ui.draft.shares = String(parsed.shares);
      if (parsed.charges != null) ui.draft.exitCharges = String(parsed.charges);
      if (parsed.raw) ui.ocrRaw = (ui.ocrRaw ? ui.ocrRaw + "\n\n--- SELL ---\n" : "") + parsed.raw;
      render();
      return;
    }
    if (parsed.ticker) form.ticker.value = parsed.ticker;
    if (parsed.side) form.side.value = parsed.side;
    if (parsed.entryPrice != null) form.entryPrice.value = String(parsed.entryPrice);
    if (parsed.shares != null) form.shares.value = String(parsed.shares);
    if (parsed.sizeUsd != null) form.sizeUsd.value = String(Number(parsed.sizeUsd).toFixed(2));
    else if (parsed.entryPrice && parsed.shares) form.sizeUsd.value = (parsed.entryPrice * parsed.shares).toFixed(2);
    if (parsed.charges != null) form.entryCharges.value = String(parsed.charges);
    if (parsed.raw) ui.ocrRaw = parsed.raw;
  }

  function tradeTable(trades, mode, actions) {
    if (!trades.length) {
      return '<div class="empty">No ' + mode + ' trades.<div style="margin-top:12px"><a href="#/add">Add a trade</a></div></div>';
    }
    var rows = trades
      .map(function (t) {
        var pnl = mode === "open" ? unrealizedPnl(t) : realizedPnl(t);
        var timeIso = mode === "open" ? t.entryIso : t.exitIso || t.entryIso;
        var px = mode === "open" ? t.entryPrice : t.exitPrice != null ? t.exitPrice : t.entryPrice;
        var btns = "";
        if (actions) {
          if (actions.edit) btns += '<button type="button" class="btn btn-sm" data-act="edit" data-id="' + esc(t.id) + '">Edit</button>';
          if (mode === "open" && actions.close) btns += '<button type="button" class="btn btn-sm btn-primary" data-act="close" data-id="' + esc(t.id) + '">Close</button>';
          if (actions.del) btns += '<button type="button" class="btn btn-sm btn-ghost" data-act="delete" data-id="' + esc(t.id) + '">Delete</button>';
        }
        return (
          "<tr><td class=\"mono\">" +
          esc(t.id) +
          "</td><td>" +
          esc(t.ticker) +
          '</td><td class="' +
          (t.side === "long" ? "up" : "down") +
          '">' +
          t.side.toUpperCase() +
          '</td><td class="mono">' +
          esc(formatZone(timeIso, "IST")) +
          '</td><td class="mono">' +
          esc(formatZone(timeIso, "NY")) +
          '</td><td class="mono">' +
          fmtNum(px, 4) +
          '</td><td class="mono">$' +
          fmtNum(t.sizeUsd, 2) +
          '</td><td class="mono">' +
          fmtNum(t.shares, 6) +
          '</td><td class="mono ' +
          (pnl > 0 ? "up" : pnl < 0 ? "down" : "") +
          '">' +
          signedMoney(pnl) +
          "</td>" +
          (mode === "closed" ? "<td>" + esc(t.exitReason || "—") + "</td>" : "") +
          "<td>" +
          esc(t.note || t.reviewNote || "—") +
          '</td><td><div class="row" style="justify-content:flex-end">' +
          btns +
          "</div></td></tr>"
        );
      })
      .join("");
    return (
      '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Ticker</th><th>Side</th><th>IST</th><th>NY</th><th>Price</th><th>Size</th><th>Shares</th><th>P&L</th>' +
      (mode === "closed" ? "<th>Reason</th>" : "") +
      "<th>Note</th><th></th></tr></thead><tbody>" +
      rows +
      "</tbody></table></div>"
    );
  }

  function renderChart(pts) {
    if (pts.length < 2) {
      return '<div class="chart empty" style="height:224px;display:flex;align-items:center;justify-content:center">Close a trade to start the equity curve.</div>';
    }
    var w = 800;
    var h = 180;
    var pad = { l: 56, r: 12, t: 12, b: 28 };
    var xs = pts.map(function (p) { return p.t; });
    var ys = pts.map(function (p) { return p.v; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    if (maxX === minX) maxX = minX + 1;
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var spanY = maxY - minY || 1;
    function X(t) {
      return pad.l + ((t - minX) / (maxX - minX)) * (w - pad.l - pad.r);
    }
    function Y(v) {
      return pad.t + (1 - (v - minY) / spanY) * (h - pad.t - pad.b);
    }
    var d = pts
      .map(function (p, i) {
        return (i ? "L" : "M") + X(p.t).toFixed(1) + " " + Y(p.v).toFixed(1);
      })
      .join(" ");
    var area = d + " L" + X(pts[pts.length - 1].t).toFixed(1) + " " + (h - pad.b) + " L" + X(pts[0].t).toFixed(1) + " " + (h - pad.b) + " Z";
    return (
      '<div class="chart"><h3>Equity curve</h3><svg viewBox="0 0 ' +
      w +
      " " +
      h +
      '" preserveAspectRatio="none"><path d="' +
      area +
      '" fill="rgba(93,186,138,0.18)"></path><path d="' +
      d +
      '" fill="none" stroke="#5dba8a" stroke-width="1.75"></path></svg></div>'
    );
  }

  function stat(label, value, tone) {
    return '<div class="stat"><p>' + esc(label) + '</p><p class="stat-value ' + (tone || "") + '">' + esc(value) + "</p></div>";
  }

  function headerBalances() {
    var cash = cashAfter(book.startingCash, book.trades);
    var current = cash + openMarketValue(book.trades);
    var openAmt = book.startingCash;
    var tone = current > openAmt ? "up" : current < openAmt ? "down" : "";
    return (
      '<div class="mini-stats">' +
      '<div class="mini"><p>Opening</p><p class="mini-val">' +
      esc(money(openAmt)) +
      '</p></div>' +
      '<div class="mini"><p>Current</p><p class="mini-val ' +
      tone +
      '">' +
      esc(money(current)) +
      ' <span class="mini-inr">(' +
      esc(rupees(current, 0)) +
      ")</span></p></div></div>"
    );
  }

  function viewDashboard() {
    var trades = book.trades;
    var open = trades.filter(function (t) { return t.status === "open"; });
    var closed = trades.filter(function (t) { return t.status === "closed"; });
    var cash = cashAfter(book.startingCash, trades);
    var openPnl = open.reduce(function (s, t) { return s + unrealizedPnl(t); }, 0);
    var realized = closed.reduce(function (s, t) { return s + realizedPnl(t); }, 0);
    var equity = cash + openMarketValue(trades);
    var ranged = closed.filter(function (t) { return inRange(t.exitIso, book.range); });
    var dayPnl = closed.filter(function (t) { return t.exitIso && isSameNyDay(t.exitIso); }).reduce(function (s, t) { return s + realizedPnl(t); }, 0);
    var weekPnl = closed.filter(function (t) { return t.exitIso && isThisNyWeek(t.exitIso); }).reduce(function (s, t) { return s + realizedPnl(t); }, 0);
    return (
      '<div class="stack">' +
      '<div class="stats">' +
      stat("Cash", rupees(cash, 0)) +
      stat("Equity", money(equity)) +
      stat("Realized", signedMoney(realized), realized > 0 ? "up" : realized < 0 ? "down" : "") +
      stat("Open P&L", signedMoney(openPnl), openPnl > 0 ? "up" : openPnl < 0 ? "down" : "") +
      stat("Open", String(open.length)) +
      "</div>" +
      '<div class="pnl-grid"><div class="panel"><p>Day P&L (NY)</p><p class="num ' +
      (dayPnl >= 0 ? "up" : "down") +
      '">' +
      signedMoney(dayPnl) +
      '</p></div><div class="panel"><p>Week P&L (NY)</p><p class="num ' +
      (weekPnl >= 0 ? "up" : "down") +
      '">' +
      signedMoney(weekPnl) +
      "</p></div></div>" +
      renderChart(equityPoints(book.startingCash, trades, book.range)) +
      '<div class="section-head"><h2>Open</h2><a href="#/open">View all</a></div>' +
      tradeTable(open.slice(0, 6), "open") +
      '<div class="section-head"><h2>Closed in range (' +
      ranged.length +
      ')</h2><a href="#/closed">View all</a></div>' +
      tradeTable(ranged.slice(0, 6), "closed") +
      "</div>"
    );
  }

  function journalMonthLabel(y, m) {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(y, m, 1));
  }

  function closedByNyDay() {
    var map = {};
    book.trades.forEach(function (t) {
      if (t.status !== "closed" || !t.exitIso) return;
      var day = nyDate(new Date(t.exitIso));
      if (!map[day]) map[day] = [];
      map[day].push(t);
    });
    return map;
  }

  function dayStats(list) {
    var pnl = 0;
    (list || []).forEach(function (t) {
      pnl += realizedPnl(t);
    });
    return { pnl: pnl, n: (list || []).length };
  }

  function viewJournal() {
    var y = ui.journalYear;
    var m = ui.journalMonth;
    var byDay = closedByNyDay();
    var firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
    var daysIn = new Date(y, m + 1, 0).getDate();
    var monthPnl = 0;
    var monthN = 0;
    var dayCells = [];
    var i;
    for (i = 0; i < firstDow; i++) dayCells.push('<div class="jday empty-day"></div>');
    var weekPnl = 0;
    var weekN = 0;
    function weekCell(label, pnl, n) {
      var tone = n ? (pnl > 0 ? " up" : pnl < 0 ? " down" : "") : "";
      return (
        '<div class="jday jweek' +
        tone +
        '"><p class="jwk">' +
        esc(label) +
        "</p>" +
        (n
          ? '<p class="jpnl ' +
            (pnl > 0 ? "up" : pnl < 0 ? "down" : "") +
            '">' +
            esc(signedMoney(pnl)) +
            "</p><p class=\"jcount\">" +
            n +
            (n === 1 ? " trade" : " trades") +
            "</p>"
          : '<p class="jpnl muted">—</p>') +
        "</div>"
      );
    }
    var weekNo = 1;
    for (i = 1; i <= daysIn; i++) {
      var iso = y + "-" + pad2(m + 1) + "-" + pad2(i);
      var list = byDay[iso] || [];
      if (ui.journalFilter === "win") list = list.filter(function (t) { return realizedPnl(t) > 0; });
      if (ui.journalFilter === "loss") list = list.filter(function (t) { return realizedPnl(t) < 0; });
      var st = dayStats(list);
      monthPnl += st.pnl;
      monthN += st.n;
      weekPnl += st.pnl;
      weekN += st.n;
      var tone = st.n ? (st.pnl > 0 ? " up" : st.pnl < 0 ? " down" : "") : "";
      var on = ui.journalDay === iso ? " on" : "";
      dayCells.push(
        '<button type="button" class="jday' +
          tone +
          on +
          '" data-act="j-day" data-day="' +
          iso +
          '"><p class="jd">' +
          i +
          "</p>" +
          (st.n
            ? '<p class="jpnl ' +
              (st.pnl > 0 ? "up" : st.pnl < 0 ? "down" : "") +
              '">' +
              esc(signedMoney(st.pnl)) +
              "</p><p class=\"jcount\">" +
              st.n +
              (st.n === 1 ? " trade" : " trades") +
              "</p>"
            : '<p class="jpnl muted">—</p>') +
          "</button>"
      );
      if ((firstDow + i) % 7 === 0 || i === daysIn) {
        if (i === daysIn && (firstDow + i) % 7 !== 0) {
          var pad = 7 - ((firstDow + i) % 7);
          var p;
          for (p = 0; p < pad; p++) dayCells.push('<div class="jday empty-day"></div>');
        }
        dayCells.push(weekCell("Week " + weekNo, weekPnl, weekN));
        weekNo += 1;
        weekPnl = 0;
        weekN = 0;
      }
    }
    var selected = ui.journalDay ? byDay[ui.journalDay] || [] : [];
    if (ui.journalFilter === "win") selected = selected.filter(function (t) { return realizedPnl(t) > 0; });
    if (ui.journalFilter === "loss") selected = selected.filter(function (t) { return realizedPnl(t) < 0; });
    var chips = [
      ["all", "All"],
      ["win", "Winners"],
      ["loss", "Losers"],
    ]
      .map(function (c) {
        return (
          '<button type="button" class="chip' +
          (ui.journalFilter === c[0] ? " on" : "") +
          '" data-act="j-filter" data-filter="' +
          c[0] +
          '">' +
          c[1] +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="stack">' +
      '<div class="jhead"><div><p class="muted">Calendar · NY session</p><button type="button" class="jmonth" data-act="j-month">' +
      esc(journalMonthLabel(y, m)) +
      '</button></div><div class="row"><button type="button" class="btn btn-sm" data-act="j-prev">‹</button><button type="button" class="btn btn-sm cal-btn" data-act="j-month" aria-label="Choose month">' +
      icon("cal") +
      '</button><button type="button" class="btn btn-sm" data-act="j-next">›</button></div><p class="jmonth-sum">Month: <span class="' +
      (monthPnl > 0 ? "up" : monthPnl < 0 ? "down" : "") +
      '">' +
      esc(signedMoney(monthPnl)) +
      "</span> · " +
      monthN +
      (monthN === 1 ? " trade" : " trades") +
      "</p></div>" +
      '<div class="jcal">' +
      '<p>Mon</p><p>Tue</p><p>Wed</p><p>Thu</p><p>Fri</p><p>Sat</p><p>Sun</p><p>Week</p>' +
      dayCells.join("") +
      "</div>" +
      '<p class="muted">Each cell is that day’s realized P&amp;L. The last column is the week. Click a day to open its trades.</p>' +
      '<div class="chips">' +
      chips +
      '<a class="chip" href="#/add">+ Add from screenshot</a></div>' +
      (ui.journalDay
        ? '<div class="section-head"><h2>' +
          esc(ui.journalDay) +
          "</h2><button type=\"button\" class=\"btn btn-sm btn-ghost\" data-act=\"j-clear\">Clear day</button></div>" +
          tradeTable(selected, "closed", { edit: true, del: true })
        : "") +
      "</div>"
    );
  }

  function viewOpen() {
    var trades = book.trades.filter(function (t) { return t.status === "open"; });
    var closing = ui.closingId
      ? book.trades.filter(function (t) { return t.id === ui.closingId; })[0]
      : null;
    var modal = "";
    if (closing) {
      var d = emptyDraft(tradeToDraft(closing));
      d.asClosed = true;
      d.exitPrice = String(closing.markPrice || closing.entryPrice);
      modal =
        '<div class="modal-back" data-act="cancel-close"><div class="modal" id="close-modal">' +
        '<div class="modal-head"><h2>Close ' +
        esc(closing.id) +
        " " +
        esc(closing.ticker) +
        '</h2><button type="button" class="btn btn-sm btn-ghost" data-act="cancel-close">Cancel</button></div>' +
        tradeFormHtml(d, "Save close", true) +
        "</div></div>";
    }
    return tradeTable(trades, "open", { edit: true, close: true, del: true }) + modal;
  }

  function viewClosed() {
    var trades = book.trades
      .filter(function (t) { return t.status === "closed"; })
      .filter(function (t) { return inRange(t.exitIso, book.range); })
      .filter(function (t) { return !ui.closedTicker || t.ticker.indexOf(ui.closedTicker.toUpperCase()) >= 0; })
      .filter(function (t) { return ui.closedSide === "all" || t.side === ui.closedSide; });
    var wins = trades.filter(function (t) { return realizedPnl(t) > 0; }).length;
    var reviews = trades.filter(function (t) { return t.reviewNote; });
    var reviewHtml = reviews.length
      ? '<div class="stack" style="margin-top:24px"><h2>Reviews</h2>' +
        reviews
          .map(function (t) {
            return (
              '<article class="card note-card"><p class="muted">' +
              esc(t.id) +
              " " +
              esc(t.ticker) +
              " · " +
              esc(t.exitReason || "") +
              "</p><p style=\"margin:8px 0 0\">" +
              esc(t.reviewNote) +
              "</p></article>"
            );
          })
          .join("") +
        "</div>"
      : "";
    return (
      '<div class="row" style="margin-bottom:16px">' +
      '<input id="closed-ticker" placeholder="Filter ticker" value="' +
      esc(ui.closedTicker) +
      '" style="max-width:10rem">' +
      '<select id="closed-side" style="max-width:10rem"><option value="all"' +
      (ui.closedSide === "all" ? " selected" : "") +
      '>All sides</option><option value="long"' +
      (ui.closedSide === "long" ? " selected" : "") +
      '>Long</option><option value="short"' +
      (ui.closedSide === "short" ? " selected" : "") +
      ">Short</option></select>" +
      '<p class="muted" style="align-self:center">' +
      trades.length +
      " trades · " +
      wins +
      " wins</p></div>" +
      tradeTable(trades, "closed", { del: true }) +
      reviewHtml
    );
  }

  function viewWatch() {
    var tab = book.watchTab || ui.watchTab || "main";
    ui.watchTab = tab;
    var shown = book.watch.filter(function (w) { return w.list === tab; });
    var pinned = shown.filter(function (w) { return isWatchPinned(tab, w.symbol); });
    var chips = shown
      .map(function (w) {
        var flag =
          w.permission === "wait"
            ? '<span class="warn" style="margin-left:8px">WAIT</span>'
            : w.permission === "yes"
              ? '<span class="up" style="margin-left:8px">YES</span>'
              : w.permission === "no"
                ? '<span class="down" style="margin-left:8px">NO</span>'
                : "";
        var on = isWatchPinned(tab, w.symbol);
        return (
          '<button type="button" class="chip' +
          (on ? " on" : "") +
          '" data-act="pin-watch" data-symbol="' +
          esc(w.symbol) +
          '">' +
          esc(w.symbol) +
          flag +
          "</button>"
        );
      })
      .join("");
    var cards = pinned.length
      ? pinned
      .map(function (w) {
        return (
          '<div class="card watch-card"><div class="head"><p class="mono">' +
          esc(w.symbol) +
          '</p><div class="row"><button type="button" class="btn btn-sm" data-act="move" data-symbol="' +
          esc(w.symbol) +
          '">Move to ' +
          (w.list === "main" ? "TEMP" : "MAIN") +
          '</button><button type="button" class="btn btn-sm btn-ghost" data-act="remove-watch" data-symbol="' +
          esc(w.symbol) +
          '">Remove</button></div></div><div class="grid-2">' +
          '<input data-watch="' +
          esc(w.symbol) +
          '" data-field="event" placeholder="Event (e.g. earnings Thu AMC)" value="' +
          esc(w.event) +
          '">' +
          '<select data-watch="' +
          esc(w.symbol) +
          '" data-field="permission"><option value="none"' +
          (w.permission === "none" ? " selected" : "") +
          ">Permission: none</option><option value=\"wait\"" +
          (w.permission === "wait" ? " selected" : "") +
          ">WAIT — this week, undecided</option><option value=\"yes\"" +
          (w.permission === "yes" ? " selected" : "") +
          ">YES — paper ok this week</option><option value=\"no\"" +
          (w.permission === "no" ? " selected" : "") +
          ">NO — skip this week</option></select>" +
          '<textarea class="span-2" data-watch="' +
          esc(w.symbol) +
          '" data-field="note" placeholder="Ticker note">' +
          esc(w.note) +
          "</textarea></div></div>"
        );
      })
      .join("")
      : '<p class="muted">Click a ticker to open its card. DESK remembers the last names you had open on Main and Temp.</p>';
    return (
      '<div class="tabs">' +
      '<button type="button" class="' +
      (tab === "main" ? "active" : "") +
      '" data-act="tab" data-tab="main">main (' +
      book.watch.filter(function (w) { return w.list === "main"; }).length +
      ')</button>' +
      '<button type="button" class="' +
      (tab === "temp" ? "active" : "") +
      '" data-act="tab" data-tab="temp">temp (' +
      book.watch.filter(function (w) { return w.list === "temp"; }).length +
      ")</button></div>" +
      '<form id="add-watch" class="row" style="margin-bottom:24px"><input name="symbol" placeholder="Add ticker" style="max-width:10rem"><button class="btn btn-primary" type="submit">Add to ' +
      tab +
      "</button></form>" +
      '<div class="chips">' +
      chips +
      "</div>" +
      cards
    );
  }

  function viewAdd() {
    var existing = ui.editId
      ? book.trades.filter(function (t) { return t.id === ui.editId; })[0]
      : null;
    var d = ui.draft || (existing ? tradeToDraft(existing) : emptyDraft());
    return (
      '<p class="muted max" style="margin-top:0">Type the fill, or drop a broker screenshot. Review the numbers before save. Closed trades need an exit reason and a short note on what went right or wrong.</p>' +
      tradeFormHtml(d, existing ? "Save changes" : "Save trade", false)
    );
  }

  function viewIo() {
    return (
      '<div class="max stack"><p class="muted">Everything lives in this browser. Export after a session. On a new phone, import the file. A public GitHub page does not include your trades unless you upload this backup yourself.</p>' +
      '<div class="row"><button type="button" class="btn btn-primary" data-act="export-json">Export JSON</button>' +
      '<button type="button" class="btn" data-act="export-csv">Export CSV</button></div>' +
      '<label class="muted">Import JSON or CSV<input class="file" type="file" accept=".json,.csv,text/csv,application/json" id="import-file"></label>' +
      (ui.ioMsg ? "<p>" + esc(ui.ioMsg) + "</p>" : "") +
      "</div>"
    );
  }

  function viewSettings() {
    return (
      '<div class="max stack">' +
      field("Starting cash (USD)", '<input id="start-cash" inputmode="decimal" value="' + esc(String(book.startingCash)) + '">') +
      field("Rupees per 1 USD", '<input id="fx-inr" inputmode="decimal" value="' + esc(String(book.inrPerUsd || INR_PER_USD)) + '">') +
      '<p class="muted">Cash on the dashboard is shown in rupees using this rate. Current balance is equity in dollars, with rupees in brackets. Changing starting cash recalculates equity. Data stays on this device until you export.</p>' +
      '<button type="button" class="btn btn-danger" data-act="reset">Reset journal</button></div>'
    );
  }

  function rangePills() {
    var custom =
      book.range === "custom"
        ? '<div class="range-custom">' +
          '<label class="field"><span>From</span>' +
          dateTimeField("range-from", book.rangeFrom) +
          "</label>" +
          '<label class="field"><span>To</span>' +
          dateTimeField("range-to", book.rangeTo) +
          "</label></div>"
        : "";
    return (
      '<div class="range-block"><div class="pills">' +
      ["7d", "30d", "90d", "all", "custom"]
        .map(function (k) {
          return (
            '<button type="button" class="' +
            (book.range === k ? "on" : "") +
            '" data-act="range" data-range="' +
            k +
            '">' +
            k +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      custom +
      "</div>"
    );
  }

  function navHtml() {
    return (
      '<nav class="nav"><div class="brand"><p class="mark">DESK</p><p class="sub">Trading journal</p></div>' +
      NAV.map(function (item) {
        return (
          '<a href="#/' +
          item[0] +
          '" class="' +
          (ui.route === item[0] ? "active" : "") +
          '">' +
          icon(item[2]) +
          item[1] +
          "</a>"
        );
      }).join("") +
      "</nav>"
    );
  }

  function render() {
    var route = ui.route;
    var showRange = route === "dashboard" || route === "closed";
    var content =
      route === "open"
        ? viewOpen()
        : route === "closed"
          ? viewClosed()
          : route === "watchlists"
            ? viewWatch()
            : route === "add"
              ? viewAdd()
              : route === "io"
                ? viewIo()
                : route === "settings"
                  ? viewSettings()
                  : route === "journal"
                    ? viewJournal()
                    : viewDashboard();
    document.getElementById("app").innerHTML =
      '<div class="app">' +
      '<aside class="sidebar desk">' +
      navHtml() +
      "</aside>" +
      (ui.menu ? '<div class="drawer on"><button type="button" class="shade" data-act="menu" aria-label="Close menu"></button><aside class="sidebar">' + navHtml() + "</aside></div>" : "") +
      '<div class="main-col"><header class="topbar"><div class="topbar-left">' +
      '<button type="button" class="menu-btn" data-act="menu" aria-label="Menu">' +
      icon(ui.menu ? "x" : "menu") +
      "</button><h1>" +
      esc(titles()[route] || "DESK") +
      "</h1>" +
      (route === "dashboard" ? headerBalances() : "") +
      '</div><div class="topbar-right">' +
      (showRange ? rangePills() : "") +
      '<div class="clocks"><span class="clock"><span class="clock-lab">IST</span> <span id="clock-ist-date" class="clock-date">' +
      esc(clockParts("Asia/Kolkata").date) +
      '</span> <span id="clock-ist" class="clock-ist-time">' +
      esc(clockParts("Asia/Kolkata").time) +
      '</span></span><span class="clock"><span class="clock-lab">NY</span> <span id="clock-ny-date" class="clock-date">' +
      esc(clockParts("America/New_York").date) +
      '</span> <span id="clock-ny" class="clock-time">' +
      esc(clockParts("America/New_York").time) +
      "</span></span></div></div></header><main class=\"content\">" +
      content +
      calendarHtml() +
      monthPickHtml() +
      "</main></div></div>";
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onRoute() {
    var r = hashRoute();
    ui.route = r.path;
    ui.editId = r.q.id || null;
    ui.menu = false;
    ui.draft = null;
    ui.ocrRaw = "";
    ui.ocrErr = "";
    render();
  }

  function bind() {
    var root = document.getElementById("app");
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act]");
      if (!t) return;
      var act = t.getAttribute("data-act");
      if (act === "menu") {
        ui.menu = !ui.menu;
        render();
      } else if (act === "range") {
        book.range = t.getAttribute("data-range");
        if (book.range === "custom") {
          if (!book.rangeFrom) book.rangeFrom = toDatetimeLocal(new Date(Date.now() - 30 * 86400000).toISOString());
          if (!book.rangeTo) book.rangeTo = toDatetimeLocal();
        }
        save();
        render();
      } else if (act === "tab") {
        ui.watchTab = t.getAttribute("data-tab");
        book.watchTab = ui.watchTab;
        save();
        render();
      } else if (act === "pin-watch") {
        toggleWatchPin(book.watchTab || ui.watchTab || "main", t.getAttribute("data-symbol"));
        save();
        render();
      } else if (act === "edit") {
        go("add?id=" + t.getAttribute("data-id"));
      } else if (act === "close") {
        ui.closingId = t.getAttribute("data-id");
        render();
      } else if (act === "cancel-close") {
        if (t.classList.contains("modal-back") && e.target !== t) return;
        ui.closingId = null;
        render();
      } else if (act === "delete") {
        var id = t.getAttribute("data-id");
        var tr = book.trades.filter(function (x) { return x.id === id; })[0];
        if (tr && confirm("Delete " + tr.id + " " + tr.ticker + "?")) {
          book.trades = book.trades.filter(function (x) { return x.id !== id; });
          save();
          render();
        }
      } else if (act === "move") {
        var sym = t.getAttribute("data-symbol");
        var from = book.watchTab || ui.watchTab || "main";
        var to = from === "main" ? "temp" : "main";
        book.watch.forEach(function (w) {
          if (w.symbol === sym) w.list = to;
        });
        if (isWatchPinned(from, sym)) {
          toggleWatchPin(from, sym);
          if (!isWatchPinned(to, sym)) toggleWatchPin(to, sym);
        }
        save();
        render();
      } else if (act === "remove-watch") {
        var rem = t.getAttribute("data-symbol");
        book.watch = book.watch.filter(function (w) { return w.symbol !== rem; });
        dropWatchPin(rem);
        save();
        render();
      } else if (act === "export-json") {
        download("desk-backup.json", exportBundle(), "application/json");
      } else if (act === "export-csv") {
        download("desk-trades.csv", tradesToCsv(book.trades), "text/csv");
      } else if (act === "reset") {
        if (confirm("Reset all trades and restore the default watchlists?")) {
          var range = book.range;
          book = emptyBook();
          book.range = range;
          save();
          render();
        }
      } else if (act === "toggle-closed") {
        var form = document.getElementById("trade-form");
        if (form) ui.draft = readForm(form);
        render();
      } else if (act === "parse-paste") {
        var form2 = document.getElementById("trade-form");
        if (!form2) return;
        var parsed = parseOrderText(form2.ocrPaste.value || "");
        ui.ocrRaw = parsed.raw || form2.ocrPaste.value || "";
        applyParsed(parsed);
      } else if (act === "j-month") {
        ui.monthPick = true;
        render();
      } else if (act === "j-month-close") {
        if (t.classList.contains("cal-back") && e.target !== t) return;
        ui.monthPick = false;
        render();
      } else if (act === "j-year-prev") {
        ui.journalYear -= 1;
        render();
      } else if (act === "j-year-next") {
        ui.journalYear += 1;
        render();
      } else if (act === "j-pick-month") {
        ui.journalMonth = Number(t.getAttribute("data-month")) || 0;
        ui.monthPick = false;
        ui.journalDay = "";
        render();
      } else if (act === "j-prev") {
        ui.journalMonth -= 1;
        if (ui.journalMonth < 0) {
          ui.journalMonth = 11;
          ui.journalYear -= 1;
        }
        ui.journalDay = "";
        render();
      } else if (act === "j-next") {
        ui.journalMonth += 1;
        if (ui.journalMonth > 11) {
          ui.journalMonth = 0;
          ui.journalYear += 1;
        }
        ui.journalDay = "";
        render();
      } else if (act === "j-day") {
        ui.journalDay = t.getAttribute("data-day") || "";
        render();
      } else if (act === "j-filter") {
        ui.journalFilter = t.getAttribute("data-filter") || "all";
        render();
      } else if (act === "j-clear") {
        ui.journalDay = "";
        render();
      } else if (act === "open-cal") {
        var form3 = document.getElementById("trade-form");
        if (form3) ui.draft = readForm(form3);
        openCalFor(t.getAttribute("data-target"));
        render();
      } else if (act === "cal-close") {
        if (t.classList.contains("cal-back") && e.target !== t) return;
        ui.cal = null;
        render();
      } else if (act === "cal-prev") {
        if (ui.cal) {
          ui.cal.month -= 1;
          if (ui.cal.month < 0) {
            ui.cal.month = 11;
            ui.cal.year -= 1;
          }
          render();
        }
      } else if (act === "cal-next") {
        if (ui.cal) {
          ui.cal.month += 1;
          if (ui.cal.month > 11) {
            ui.cal.month = 0;
            ui.cal.year += 1;
          }
          render();
        }
      } else if (act === "cal-day") {
        applyCalDay(t.getAttribute("data-iso"));
      }
    });

    root.addEventListener("submit", function (e) {
      if (e.target.id === "add-watch") {
        e.preventDefault();
        var s = String(new FormData(e.target).get("symbol") || "").trim().toUpperCase();
        if (!s) return;
        book.watch = book.watch.filter(function (w) { return w.symbol !== s; });
        book.watch.unshift({ symbol: s, list: ui.watchTab, note: "", event: "", permission: "none" });
        if (!isWatchPinned(ui.watchTab, s)) toggleWatchPin(ui.watchTab, s);
        save();
        render();
        return;
      }
      if (e.target.id !== "trade-form") return;
      e.preventDefault();
      var d = readForm(e.target);
      if (ui.closingId) d.asClosed = true;
      if (!d.ticker.trim()) return;
      if (d.asClosed) {
        if (!d.exitReason || !d.reviewNote.trim()) return;
      }
      var body = draftToTrade(d);
      if (ui.closingId) {
        book.trades = book.trades.map(function (tr) {
          if (tr.id !== ui.closingId) return tr;
          return {
            id: tr.id,
            ticker: tr.ticker,
            side: tr.side,
            status: "closed",
            entryIso: tr.entryIso,
            entryPrice: tr.entryPrice,
            shares: tr.shares,
            sizeUsd: tr.sizeUsd,
            entryCharges: tr.entryCharges,
            note: tr.note,
            markPrice: tr.markPrice,
            exitIso: body.exitIso,
            exitPrice: body.exitPrice,
            exitCharges: body.exitCharges,
            exitReason: body.exitReason,
            reviewNote: body.reviewNote,
          };
        });
        ui.closingId = null;
        save();
        render();
        return;
      }
      if (ui.editId) {
        book.trades = book.trades.map(function (tr) {
          return tr.id === ui.editId ? Object.assign({}, tr, body) : tr;
        });
      } else {
        var id = padId(book.nextId);
        book.nextId += 1;
        book.trades = [Object.assign({ id: id }, body)].concat(book.trades);
      }
      save();
      go(body.status === "open" ? "open" : "closed");
    });

    root.addEventListener("change", function (e) {
      var el = e.target;
      if (el.name === "ocrFile" && el.files && el.files[0]) {
        ui.ocrBusy = true;
        ui.ocrErr = "";
        render();
        ocrImage(el.files[0])
          .then(function (parsed) {
            ui.ocrBusy = false;
            ui.ocrRaw = parsed.raw || "";
            render();
            applyParsed(parsed);
          })
          .catch(function (err) {
            ui.ocrBusy = false;
            ui.ocrErr = err && err.message ? err.message : "Could not read screenshot";
            render();
          });
        return;
      }
      if (el.id === "import-file" && el.files && el.files[0]) {
        var file = el.files[0];
        var reader = new FileReader();
        reader.onload = function () {
          var text = String(reader.result || "");
          if (file.name.slice(-5) === ".json" || text.trim().charAt(0) === "{") {
            var bundle = importBundle(text);
            if (!bundle) {
              ui.ioMsg = "That JSON is not a DESK backup.";
              render();
              return;
            }
            if (bundle.startingCash) book.startingCash = bundle.startingCash;
            if (bundle.inrPerUsd && bundle.inrPerUsd > 0) book.inrPerUsd = bundle.inrPerUsd;
            if (bundle.nextId) book.nextId = bundle.nextId;
            if (bundle.trades) book.trades = bundle.trades;
            if (bundle.watch) book.watch = bundle.watch;
            if (bundle.watchTab === "main" || bundle.watchTab === "temp") {
              book.watchTab = bundle.watchTab;
              ui.watchTab = bundle.watchTab;
            }
            if (bundle.watchOpen && typeof bundle.watchOpen === "object") {
              book.watchOpen = {
                main: Array.isArray(bundle.watchOpen.main) ? bundle.watchOpen.main : [],
                temp: Array.isArray(bundle.watchOpen.temp) ? bundle.watchOpen.temp : [],
              };
            }
            save();
            ui.ioMsg = "Imported JSON backup.";
            render();
            return;
          }
          var imported = csvToTrades(text);
          if (!imported.length) {
            ui.ioMsg = "No rows found in CSV.";
            render();
            return;
          }
          var maxNum = imported.reduce(function (m, t) {
            var n2 = Number(String(t.id).replace(/\D/g, ""));
            return Number.isFinite(n2) ? Math.max(m, n2) : m;
          }, book.nextId);
          book.trades = imported.concat(book.trades);
          book.nextId = maxNum + 1;
          save();
          ui.ioMsg = "Imported " + imported.length + " CSV rows.";
          render();
        };
        reader.readAsText(file);
        return;
      }
      if (el.id === "closed-ticker") {
        ui.closedTicker = el.value;
        render();
        var again = document.getElementById("closed-ticker");
        if (again) {
          again.focus();
          again.setSelectionRange(again.value.length, again.value.length);
        }
        return;
      }
      if (el.id === "closed-side") {
        ui.closedSide = el.value;
        render();
        return;
      }
      if (el.id === "start-cash") {
        book.startingCash = Number(el.value) || STARTING_CASH;
        save();
        return;
      }
      if (el.id === "fx-inr") {
        var rate = Number(el.value);
        book.inrPerUsd = rate > 0 ? rate : INR_PER_USD;
        save();
        return;
      }
      if (el.getAttribute("data-part")) {
        var wrap = el.closest("[data-dt]");
        var joined = syncDtWrap(wrap);
        var tgt = wrap && wrap.getAttribute("data-dt");
        if (tgt === "range-from") {
          book.rangeFrom = joined;
          book.range = "custom";
          save();
        } else if (tgt === "range-to") {
          book.rangeTo = joined;
          book.range = "custom";
          save();
        }
        return;
      }
      if (el.getAttribute("data-watch")) {
        var symbol = el.getAttribute("data-watch");
        var fieldName = el.getAttribute("data-field");
        book.watch.forEach(function (w) {
          if (w.symbol === symbol) w[fieldName] = el.value;
        });
        save();
      }
    });

    root.addEventListener("input", function (e) {
      var el = e.target;
      if (el.name === "entryPrice" || el.name === "shares") {
        var form = el.form;
        if (!form) return;
        var p = n(form.entryPrice.value);
        var s = n(form.shares.value);
        if (p && s) form.sizeUsd.value = (p * s).toFixed(2);
      }
    });

    setInterval(function () {
      var ist = clockParts("Asia/Kolkata");
      var ny = clockParts("America/New_York");
      var a = document.getElementById("clock-ist");
      var ad = document.getElementById("clock-ist-date");
      var b = document.getElementById("clock-ny");
      var bd = document.getElementById("clock-ny-date");
      if (ad) ad.textContent = ist.date;
      if (a) a.textContent = ist.time;
      if (bd) bd.textContent = ny.date;
      if (b) b.textContent = ny.time;
    }, 1000);
  }

  book = load();
  ui.watchTab = book.watchTab || "main";
  bind();
  window.addEventListener("hashchange", onRoute);
  onRoute();
})();
