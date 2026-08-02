const { test } = require("node:test");
const assert = require("node:assert");
const CleanupLib = require("../cleanup-lib.js");

test("templateSignatureQualifies: distinctive literal qualifies", () => {
  assert.equal(CleanupLib.templateSignatureQualifies("name role - AWS-SSO"), true);
});

test("templateSignatureQualifies: no literal does not qualify", () => {
  assert.equal(CleanupLib.templateSignatureQualifies("name role"), false);
});

test("templateSignatureQualifies: separator-only does not qualify", () => {
  assert.equal(CleanupLib.templateSignatureQualifies("name-role"), false);
});

test("templateSignatureQualifies: under 3 alnum does not qualify", () => {
  // leftover "AB" after stripping variables -> only 2 alnum chars
  assert.equal(CleanupLib.templateSignatureQualifies("name AB role"), false);
});

test("templateToRegex: structural match hits real name", () => {
  const re = CleanupLib.templateToRegex("name role - AWS-SSO");
  assert.equal(re.test("Prod InfraEng - AWS-SSO"), true);
});

test("templateToRegex: rejects a hand-made lookalike", () => {
  const re = CleanupLib.templateToRegex("name role - AWS-SSO");
  assert.equal(re.test("my AWS-SSO notes"), false);
});

test("templateToRegex: escapes literal regex metachars", () => {
  const re = CleanupLib.templateToRegex("name (role) - AWS-SSO");
  assert.equal(re.test("Prod (InfraEng) - AWS-SSO"), true);
  assert.equal(re.test("Prod InfraEng - AWS-SSO"), false);
});

test("matchesTemplate: accepts full match", () => {
  assert.equal(
    CleanupLib.matchesTemplate("Prod InfraEng - AWS-SSO", "name role - AWS-SSO"),
    true
  );
});

test("matchesTemplate: accepts truncated (...) form cut in a literal", () => {
  assert.equal(
    CleanupLib.matchesTemplate("Prod InfraEng - AW...", "name role - AWS-SSO"),
    true
  );
});

test("matchesTemplate: accepts truncated (...) form cut mid-variable", () => {
  assert.equal(
    CleanupLib.matchesTemplate("Prod Infr...", "name role - AWS-SSO"),
    true
  );
});

test("matchesTemplate: rejects unrelated name", () => {
  assert.equal(
    CleanupLib.matchesTemplate("Personal", "name role - AWS-SSO"),
    false
  );
});

test("matchesTemplate: rejects a non-truncated lookalike", () => {
  assert.equal(
    CleanupLib.matchesTemplate("my AWS-SSO notes", "name role - AWS-SSO"),
    false
  );
});
