
    (function () {
      try {
        var KEY = 'prerounding.mobileChoice.v1';
        var params = new URLSearchParams(window.location.search);
        if (params.get('full') === '1') {
          try { window.localStorage.setItem(KEY, 'full'); } catch { /* Browser storage or media query unavailable. */ }
          try { window.history.replaceState(null, '', window.location.pathname); } catch { /* Browser storage or media query unavailable. */ }
          return;
        }
        var choice = null;
        try { choice = window.localStorage.getItem(KEY); } catch { /* Browser storage or media query unavailable. */ }
        if (choice === 'full') return;
        var small = false;
        try { small = window.matchMedia('(max-width: 700px)').matches; } catch { /* Browser storage or media query unavailable. */ }
        if (choice === 'mobile' || small) {
          window.location.replace('./mobile.html');
        }
      } catch { /* never block the full app on a redirect helper */ }
    })();
