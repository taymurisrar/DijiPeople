const test = require("node:test");
const assert = require("node:assert/strict");

const {
  emptyListDescription,
  emptyListTitle,
} = require("./empty-list-message");

/*
 * BUG-1752, BUG-1559 — and BUG-1654 before both, which fixed the first half in
 * `apps/web` and left `apps/admin` carrying it.
 *
 * The admin default read "Create a <thing> or adjust the current view and
 * filters" for every empty list. Wrong twice: it blamed filters that were not
 * set, and it instructed the operator to create a record on screens with no
 * create control.
 *
 * These assertions are mostly about the *unfiltered* case, because that is the
 * one the old wording got wrong and the one a new workspace always sees first.
 */

test("an empty list does not blame a filter nobody set", () => {
  const description = emptyListDescription({ filtered: false });
  assert.ok(!/filter/i.test(description), description);
  assert.ok(!/search/i.test(description), description);
});

test("a filtered list says the filters are why", () => {
  const description = emptyListDescription({ filtered: true });
  assert.match(description, /search or filters/i);
  assert.match(description, /clear/i);
});

test("the title distinguishes the two states as well as the body", () => {
  // The title is what a scanning eye reads, and "no matches" and "nothing yet"
  // are different situations.
  assert.equal(emptyListTitle({ filtered: false, plural: "Leads" }), "No leads yet");
  assert.equal(
    emptyListTitle({ filtered: true, plural: "Leads" }),
    "No matching leads",
  );
});

test("suggests creating only where a create control exists", () => {
  assert.match(
    emptyListDescription({ filtered: false, canCreate: true, singular: "Lead" }),
    /create a lead/i,
  );
  assert.ok(
    !/create/i.test(
      emptyListDescription({ filtered: false, canCreate: false, singular: "Invoice" }),
    ),
  );
});

test("says where records come from when they cannot be created here", () => {
  const description = emptyListDescription({
    filtered: false,
    canCreate: false,
    singular: "Invoice",
    origin: "Invoices are raised automatically when a subscription bills.",
  });
  assert.match(description, /raised automatically/);
  assert.ok(!/create/i.test(description), description);
});

test("a filtered list never suggests creating", () => {
  // The operator is looking for something specific. "Create one" is not an
  // answer to "I cannot find the one I want".
  const description = emptyListDescription({
    filtered: true,
    canCreate: true,
    singular: "Lead",
  });
  assert.ok(!/create/i.test(description), description);
});

test("degrades to something honest with nothing to work from", () => {
  assert.equal(emptyListDescription({ filtered: false }), "Nothing here yet.");
  assert.equal(emptyListDescription({}), "Nothing here yet.");
  assert.equal(emptyListTitle({}), "No records yet");
});

/*
 * BUG-1558. "Create a invoice" was on a production screen an operator used
 * daily. Sound decides the article, not spelling, which is why the words where
 * the two disagree are listed rather than left to a vowel check.
 */
test("chooses the article from the word", () => {
  const { indefiniteArticle } = require("./empty-list-message");
  assert.equal(indefiniteArticle("invoice"), "an");
  assert.equal(indefiniteArticle("lead"), "a");
  assert.equal(indefiniteArticle("employee"), "an");
  assert.equal(indefiniteArticle("partner"), "a");
});

test("gets the words where sound and spelling disagree right", () => {
  const { indefiniteArticle } = require("./empty-list-message");
  assert.equal(indefiniteArticle("user"), "a", "a user, not an user");
  assert.equal(indefiniteArticle("hour"), "an", "an hour, not a hour");
  assert.equal(indefiniteArticle("unit"), "a");
  assert.equal(indefiniteArticle("honest broker"), "an");
});

test("never returns nothing for junk input", () => {
  const { indefiniteArticle } = require("./empty-list-message");
  assert.equal(indefiniteArticle(""), "a");
  assert.equal(indefiniteArticle(undefined), "a");
});

test("the create suggestion reads grammatically", () => {
  assert.match(
    emptyListDescription({ filtered: false, canCreate: true, singular: "Invoice" }),
    /Create an invoice/,
  );
  assert.match(
    emptyListDescription({ filtered: false, canCreate: true, singular: "Lead" }),
    /Create a lead/,
  );
});
