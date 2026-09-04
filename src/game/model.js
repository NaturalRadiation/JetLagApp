// the source of truth for a game is an ordered question log; the possible hider
// region is never stored, it's replayed through the reducer.
// a Question is { id, type, askedFrom:{lat,lng,timestamp}, params, answer, createdAt, note? }.
// a GameSession is { id, schemaVersion, mapBounds, questions[], createdAt, updatedAt }.
// everything is plain JSON so the session round-trips through localStorage today
// and becomes the synced payload for multiple devices later.

// bump when the question/param shape changes, so old localStorage sessions get
// dropped instead of replayed through a reducer that no longer understands them
export const SCHEMA_VERSION = 2;

// statute mile in metres — the ruleset states all distances in miles
export const METERS_PER_MILE = 1609.344;

export const ANSWERS_BY_TYPE = {
  radar: ["yes", "no", "null"],
  thermometer: ["hotter", "colder", "null"],
  measuring: ["closer", "further", "null"],
  matching: ["yes", "no", "null"],
  tentacle: ["yes", "no", "null"],
  photo: ["null"],
};
