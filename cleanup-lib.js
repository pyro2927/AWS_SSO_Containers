// Pure, browser-free matching logic for container cleanup.
// Loaded as a classic script in the background (attaches to globalThis),
// and require()d by the Node test suite via the module.exports guard.
var CleanupLib = (function () {
  const VARIABLE_TOKENS = ["name", "email", "number", "role", "subdomain"];

  // The static leftover of a template: template with every variable token
  // removed. Longer tokens first so shorter tokens are not mis-stripped.
  function templateLeftover(template) {
    let s = template;
    for (const token of [...VARIABLE_TOKENS].sort((a, b) => b.length - a.length)) {
      s = s.split(token).join("");
    }
    return s;
  }

  // Trim whitespace and common separators, count alphanumerics.
  function templateSignatureQualifies(template) {
    const leftover = templateLeftover(template);
    const alnum = (leftover.match(/[a-z0-9]/gi) || []).length;
    return alnum >= 3;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Build the inner pattern (no anchors): variable tokens -> ".+?", literals escaped.
  function templatePattern(template) {
    const tokens = [...VARIABLE_TOKENS].sort((a, b) => b.length - a.length);
    let pattern = "";
    let i = 0;
    outer: while (i < template.length) {
      for (const token of tokens) {
        if (template.startsWith(token, i)) {
          pattern += ".+?";
          i += token.length;
          continue outer;
        }
      }
      pattern += escapeRegex(template[i]);
      i += 1;
    }
    return pattern;
  }

  function templateToRegex(template) {
    return new RegExp("^" + templatePattern(template) + "$");
  }

  // Segments of the template: each variable token -> ".+?", each literal char escaped.
  function templateSegments(template) {
    const tokens = [...VARIABLE_TOKENS].sort((a, b) => b.length - a.length);
    const segs = [];
    let i = 0;
    outer: while (i < template.length) {
      for (const token of tokens) {
        if (template.startsWith(token, i)) {
          segs.push(".+?");
          i += token.length;
          continue outer;
        }
      }
      segs.push(escapeRegex(template[i]));
      i += 1;
    }
    return segs;
  }

  // A regex matching any PREFIX of a full render: nest each segment (after the
  // first) inside an optional group -> seg0 (?:seg1 (?:seg2 ...)? )?
  // Variables still require >=1 char, so a hand-made "Personal" cannot match.
  function templatePrefixRegex(template) {
    const segs = templateSegments(template);
    let inner = "";
    for (let k = segs.length - 1; k >= 0; k--) {
      inner = segs[k] + (inner ? "(?:" + inner + ")?" : "");
    }
    return new RegExp("^(?:" + inner + ")?$");
  }

  function matchesTemplate(name, template) {
    if (templateToRegex(template).test(name)) {
      return true;
    }
    // Truncated variant: names ending in "..." keep only a prefix of the render.
    if (name.endsWith("...")) {
      const prefix = name.slice(0, -3);
      return templatePrefixRegex(template).test(prefix);
    }
    return false;
  }

  return {
    VARIABLE_TOKENS,
    templateLeftover,
    templateSignatureQualifies,
    escapeRegex,
    templatePattern,
    templateSegments,
    templateToRegex,
    templatePrefixRegex,
    matchesTemplate,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.CleanupLib = CleanupLib;
}
if (typeof module !== "undefined") {
  module.exports = CleanupLib;
}
