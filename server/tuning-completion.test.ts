import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompletedAppointmentServiceRecords,
  getTripPianoServiceGroups,
  hasTuningService,
  isLaterServiceDate,
  parseServiceDate,
  shouldRecordCompletedServices,
} from "./tuning-completion";

test("completed appointments preserve per-piano tuning and misc service lines", () => {
  const result = buildCompletedAppointmentServiceRecords(
    JSON.stringify([
      { pianoId: 222, lines: [{ name: "Tuning", isTuning: true }] },
      { pianoId: null, lines: [{ name: "Travel", isTuning: false }] },
    ]),
    null,
    null,
  );
  assert.equal(result.pianoRecords.length, 1);
  assert.equal(result.pianoRecords[0].pianoId, 222);
  assert.equal(result.pianoRecords[0].isTuning, true);
  assert.deepEqual(JSON.parse(result.miscServices), [{ name: "Travel", isTuning: false }]);

  const legacy = buildCompletedAppointmentServiceRecords(null, 9, "Check-up tuning");
  assert.equal(legacy.pianoRecords[0].pianoId, 9);
  assert.equal(legacy.pianoRecords[0].isTuning, true);
});

test("service date comparison supports legacy slash dates and ISO dates", () => {
  assert.equal(isLaterServiceDate("5/11/26", "8/7/24"), true);
  assert.equal(isLaterServiceDate("2026-05-11", "5/11/26"), false);
  assert.equal(isLaterServiceDate("2/30/26", "1/1/24"), false);
  assert.equal(parseServiceDate("2026-05-11"), Date.UTC(2026, 4, 11));
});

test("only completed results write service records", () => {
  assert.equal(shouldRecordCompletedServices("completed"), true);
  assert.equal(shouldRecordCompletedServices("no-show"), false);
  assert.equal(shouldRecordCompletedServices("cancelled"), false);
});

test("tuning is recognized from pianoscope service wording even if the flag is false", () => {
  assert.equal(hasTuningService(false, "Pitch Raise + Fine Tuning", "[]"), true);
  assert.equal(hasTuningService(false, "Regulation", JSON.stringify([{ name: "Tuning", isTuning: false }])), true);
  assert.equal(hasTuningService(false, "Regulation", "[]"), false);
});

test("trip service groups preserve piano tuning flags and support legacy services", () => {
  const groups = getTripPianoServiceGroups(
    JSON.stringify([{ pianoId: 42, lines: [{ name: "Tuning", isTuning: true }] }]),
    7,
    "Regulation",
  );
  assert.deepEqual(groups, [{ pianoId: 42, lines: [{ name: "Tuning", isTuning: true }] }]);

  assert.deepEqual(getTripPianoServiceGroups(null, 7, "Regulation, Tuning"), [{
    pianoId: 7,
    lines: [
      { name: "Regulation", isTuning: false },
      { name: "Tuning", isTuning: true },
    ],
  }]);
  assert.equal(getTripPianoServiceGroups("[]", 7, "Tuning")[0]?.pianoId, 7);
});
