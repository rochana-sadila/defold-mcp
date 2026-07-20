import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCollection,
  serializeCollection,
  setProperty,
  addGameObject,
  addComponent,
  type Doc,
} from "../src/project/collection.js";

// A minimal collection with one embedded game object we can mutate.
function baseDoc(): Doc {
  return addGameObject([], { id: "hero", position: [0, 0, 0] });
}

// Helper: serialize a doc and return the line containing `key:`.
function lineFor(doc: Doc, key: string): string {
  const text = serializeCollection(doc);
  const line = text.split("\n").find((l) => l.trim().startsWith(`${key}:`));
  assert.ok(line, `expected a line for key "${key}" in:\n${text}`);
  return line!.trim();
}

test("set_property: numeric value is written as an UNQUOTED numeric literal", () => {
  const doc = setProperty(baseDoc(), {
    gameObjectId: "hero",
    key: "score",
    value: 400,
  });
  const line = lineFor(doc, "score");
  // Must be `score: 400`, NOT `score: "400"`.
  assert.equal(line, "score: 400");
  assert.ok(!line.includes('"'), `numeric value must not be quoted, got: ${line}`);
});

test("set_property: numeric value round-trips back to a number (not a string)", () => {
  const doc = setProperty(baseDoc(), {
    gameObjectId: "hero",
    key: "score",
    value: 400,
  });
  const serialized = serializeCollection(doc);
  const reparsed = parseCollection(serialized);
  const go = reparsed.find((n) => n.key === "embedded_instances");
  assert.ok(go && Array.isArray(go.value), "embedded_instances block missing");
  const scoreNode = (go!.value as Doc).find((c) => c.key === "score");
  assert.ok(scoreNode, "score node missing after round-trip");
  assert.equal(typeof scoreNode!.value, "number");
  assert.equal(scoreNode!.value, 400);
});

test("set_property: float numeric literal preserved unquoted", () => {
  const doc = setProperty(baseDoc(), {
    gameObjectId: "hero",
    key: "speed",
    value: 50.5,
  });
  assert.equal(lineFor(doc, "speed"), "speed: 50.5");
  const reparsed = parseCollection(serializeCollection(doc));
  const go = reparsed.find((n) => n.key === "embedded_instances")!;
  const node = (go.value as Doc).find((c) => c.key === "speed")!;
  assert.equal(typeof node.value, "number");
  assert.equal(node.value, 50.5);
});

test("set_property: string value is QUOTED and round-trips as a string", () => {
  const doc = setProperty(baseDoc(), {
    gameObjectId: "hero",
    key: "label",
    value: "player one",
  });
  const line = lineFor(doc, "label");
  assert.equal(line, 'label: "player one"');

  const reparsed = parseCollection(serializeCollection(doc));
  const go = reparsed.find((n) => n.key === "embedded_instances")!;
  const node = (go.value as Doc).find((c) => c.key === "label")!;
  assert.equal(typeof node.value, "string");
  assert.equal(node.value, "player one");
});

test("set_property: boolean value is written UNQUOTED and round-trips as a boolean", () => {
  const doc = setProperty(baseDoc(), {
    gameObjectId: "hero",
    key: "enabled",
    value: true,
  });
  assert.equal(lineFor(doc, "enabled"), "enabled: true");

  const reparsed = parseCollection(serializeCollection(doc));
  const go = reparsed.find((n) => n.key === "embedded_instances")!;
  const node = (go.value as Doc).find((c) => c.key === "enabled")!;
  assert.equal(typeof node.value, "boolean");
  assert.equal(node.value, true);
});

test("set_property: overwriting an existing property replaces the value", () => {
  let doc = setProperty(baseDoc(), { gameObjectId: "hero", key: "hp", value: 10 });
  doc = setProperty(doc, { gameObjectId: "hero", key: "hp", value: 25 });
  assert.equal(lineFor(doc, "hp"), "hp: 25");
});

test("add_gameobject/add_component/set_property round-trip is stable", () => {
  let doc = addGameObject([], { id: "enemy", position: [100, 200, 0] });
  doc = addComponent(doc, {
    gameObjectId: "enemy",
    componentId: "sprite",
    componentPath: "/assets/enemy.sprite",
  });
  doc = setProperty(doc, { gameObjectId: "enemy", key: "x", value: 400 });

  const serialized = serializeCollection(doc);
  // Idempotent: parse -> serialize yields the same text.
  const reserialized = serializeCollection(parseCollection(serialized));
  assert.equal(reserialized, serialized);
});
