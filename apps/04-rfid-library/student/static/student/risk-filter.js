/* EduSense risk-filter enhancement (additive, no backend change).
   Reads ?band=thriving,steady,support,at-risk (comma-separated, OR logic).
   Click toggles band in URL (preserves other params) -> server may filter or ignore.
   Also sets .active from URL and fills .risk-count from [data-risk] rows when empty. */
(function () {
  function bands() {
    var p = new URLSearchParams(location.search);
    return (p.get("band") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function setBands(list) {
    var url = new URL(location.href);
    if (list.length) url.searchParams.set("band", list.join(","));
    else url.searchParams.delete("band");
    location.href = url.toString();
  }
  document.addEventListener("DOMContentLoaded", function () {
    var groups = document.querySelectorAll(".risk-filter-group");
    if (!groups.length) return;
    var active = bands();
    // Live counts: if pill has empty count, count rows with matching data-risk
    document.querySelectorAll(".risk-pill[data-band]").forEach(function (pill) {
      var countEl = pill.querySelector(".risk-count");
      if (countEl && !countEl.textContent.trim()) {
        var b = pill.getAttribute("data-band");
        var n = document.querySelectorAll('[data-risk="' + b + '"]').length;
        if (n) countEl.textContent = n;
      }
      var b = pill.getAttribute("data-band");
      if (b && active.indexOf(b) > -1) pill.classList.add("active");
      pill.addEventListener("click", function (e) {
        if (pill.tagName === "BUTTON") {
          e.preventDefault();
          var cur = bands(), i = cur.indexOf(b);
          if (b === "all") setBands([]);
          else if (i > -1) cur.splice(i, 1);
          else cur.push(b);
          setBands(cur);
        }
      });
    });
    // Anchor pills: mark active via CSS :target fallback handled here too
    document.querySelectorAll('a.risk-pill[href*="band="]').forEach(function (a) {
      try {
        var u = new URL(a.href, location.origin);
        var tb = (u.searchParams.get("band") || "").split(",").filter(Boolean);
        if (tb.some(function (b) { return active.indexOf(b) > -1; })) a.classList.add("active");
        if (!active.length && a.getAttribute("data-band") === "all") a.classList.add("active");
      } catch (e) {}
    });
  });
})();
