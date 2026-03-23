/*
Paste this script into the LinkedIn feed page console to capture a debug dump.
It is intentionally self-contained so it can be copied into DevTools as-is.
*/
(function () {
  function text(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isScrollable(element) {
    if (!element) {
      return false;
    }

    var style = window.getComputedStyle(element);
    return (
      /(auto|scroll|overlay)/i.test(style.overflowY || "") &&
      element.scrollHeight > element.clientHeight + 8
    );
  }

  function findFeedRoot() {
    var explicitFeed = document.querySelector(
      'div[componentkey="container-update-list_mainFeed-lazy-container"]'
    );

    if (explicitFeed) {
      return explicitFeed;
    }

    var main = document.querySelector('div[role="main"]');

    if (!main) {
      return null;
    }

    var listItems = main.querySelectorAll('div[role="listitem"]');

    if (listItems.length) {
      return main;
    }

    return main;
  }

  var feedRoot = findFeedRoot();

  if (!feedRoot) {
    console.log(JSON.stringify({ error: "NO_FEED_FOUND" }, null, 2));
    return;
  }

  var postElements = Array.prototype.slice.call(
    feedRoot.querySelectorAll('div[role="listitem"]'),
    0,
    8
  );
  var scrollChain = [];
  var current = feedRoot;

  while (current) {
    scrollChain.push({
      tag: current.tagName,
      id: current.id || "",
      className: typeof current.className === "string" ? current.className : "",
      overflowY: window.getComputedStyle(current).overflowY,
      clientHeight: current.clientHeight,
      scrollHeight: current.scrollHeight,
      scrollTop: current.scrollTop,
      scrollable: isScrollable(current),
    });
    current = current.parentElement;
  }

  var payload = {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    feed: {
      tag: feedRoot.tagName,
      id: feedRoot.id || "",
      className: typeof feedRoot.className === "string" ? feedRoot.className : "",
      childListItems: feedRoot.querySelectorAll('div[role="listitem"]').length,
    },
    scrollChain: scrollChain,
    posts: postElements.map(function (postElement, index) {
      return {
        index: index,
        textPreview: text(postElement.innerText || "").slice(0, 800),
        html: String(postElement.outerHTML || "").slice(0, 20000),
      };
    }),
  };

  console.log(JSON.stringify(payload, null, 2));
})();
