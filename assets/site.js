/* Progressive enhancement for the Witness Circles documentation site:
   theme toggle, small-screen navigation, and build-free local search.
   Every page is fully readable with this file blocked or disabled. */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  /* ---------- theme ---------- */

  var STORAGE_KEY = "witc-theme";
  var root = document.documentElement;

  function storedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function activeTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "dark" || explicit === "light") return explicit;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var button = document.querySelector("[data-theme-toggle]");
    if (button) {
      button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      button.textContent = theme === "light" ? "Dark theme" : "Light theme";
    }
  }

  var saved = storedTheme();
  if (saved === "dark" || saved === "light") applyTheme(saved);

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest && event.target.closest("[data-theme-toggle]");
    if (!toggle) return;
    var next = activeTheme() === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      /* storage is unavailable; the choice simply does not persist */
    }
  });

  applyTheme(activeTheme());

  /* ---------- navigation ---------- */

  var navToggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  if (navToggle && nav) {
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", open ? "false" : "true");
      navToggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
  }

  /* ---------- search ---------- */

  var input = document.querySelector("[data-search-input]");
  var results = document.querySelector("[data-search-results]");
  if (!input || !results) return;

  var base = input.getAttribute("data-search-base") || "";
  var index = null;
  var loading = false;
  var pending = false;

  function load() {
    if (index !== null || loading) return;
    loading = true;
    fetch(base + "search-index.json", { credentials: "omit" })
      .then(function (response) {
        if (!response.ok) throw new Error("index unavailable");
        return response.json();
      })
      .then(function (data) {
        index = Array.isArray(data.entries) ? data.entries : [];
        loading = false;
        if (pending) render();
      })
      .catch(function () {
        loading = false;
        index = [];
        results.innerHTML =
          '<li><span>The search index could not be loaded. Every page is linked from the navigation above.</span></li>';
      });
  }

  function score(entry, terms) {
    var haystack = (entry.heading + " " + entry.page + " " + entry.text + " " + (entry.aliases || []).join(" ")).toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i += 1) {
      var position = haystack.indexOf(terms[i]);
      if (position === -1) return 0;
      total += position < 60 ? 3 : 1;
      if (entry.heading.toLowerCase().indexOf(terms[i]) !== -1) total += 4;
      if ((entry.aliases || []).join(" ").toLowerCase().indexOf(terms[i]) !== -1) total += 2;
    }
    return total;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
    });
  }

  function render() {
    pending = false;
    var query = input.value.trim().toLowerCase();
    if (query.length < 2) {
      results.innerHTML = "";
      return;
    }
    if (index === null) {
      pending = true;
      results.innerHTML = "<li><span>Loading the index.</span></li>";
      load();
      return;
    }
    var terms = query.split(/\s+/);
    var matches = [];
    for (var i = 0; i < index.length; i += 1) {
      var value = score(index[i], terms);
      if (value > 0) matches.push({ entry: index[i], score: value });
    }
    matches.sort(function (a, b) {
      return b.score - a.score;
    });
    if (matches.length === 0) {
      results.innerHTML =
        "<li><span>No match for " +
        escapeHtml(input.value.trim()) +
        ". Try WITC, marker, lineage, shard, fee share, reorg, state hash, or an error code such as SUCCESSOR_DUST.</span></li>";
      return;
    }
    var html = "";
    for (var m = 0; m < Math.min(matches.length, 10); m += 1) {
      var entry = matches[m].entry;
      html +=
        '<li><a href="' +
        escapeHtml(base + entry.url) +
        '"><strong>' +
        escapeHtml(entry.heading) +
        "</strong><em>" +
        escapeHtml(entry.page + " . " + entry.text.slice(0, 110)) +
        "</em></a></li>";
    }
    results.innerHTML = html;
  }

  input.addEventListener("focus", load);
  input.addEventListener("input", render);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      input.value = "";
      results.innerHTML = "";
      input.blur();
    }
    if (event.key === "ArrowDown") {
      var first = results.querySelector("a");
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    var active = document.activeElement;
    var tag = active && active.tagName ? active.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select" || (active && active.isContentEditable)) return;
    event.preventDefault();
    input.focus();
    input.select();
  });

  document.addEventListener("click", function (event) {
    if (!results.contains(event.target) && event.target !== input) results.innerHTML = "";
  });
})();
