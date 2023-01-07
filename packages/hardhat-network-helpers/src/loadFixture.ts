import type { SnapshotRestorer } from "./helpers/takeSnapshot";

import {
  FixtureAnonymousFunctionError,
  FixtureSnapshotError,
  InvalidSnapshotError,
} from "./errors";

type Fixture<T, P> = (fixtureParameters?:P) => Promise<T>;

interface Snapshot<T, P> {
  restorer: SnapshotRestorer;
  fixture: Fixture<T, P>;
  parameters: P
  data: T;
}

let snapshots: Array<Snapshot<any, any>> = [];

function isEqual(x: any, y: any): boolean{

  if (x === null || x === undefined || y === null || y === undefined) { return x === y; }
  // after this just checking type of one would be enough
  if (x.constructor !== y.constructor) { return false; }
  // if they are functions, they should exactly refer to same one (because of closures)
  if (x instanceof Function) { return x === y; }
  // if they are regexps, they should exactly refer to same one (it is hard to better equality check on current ES)
  if (x instanceof RegExp) { return x === y; }
  if (x === y || x.valueOf() === y.valueOf()) { return true; }
  if (Array.isArray(x) && x.length !== y.length) { return false; }

  // if they are dates, they must had equal valueOf
  if (x instanceof Date) { return false; }

  // if they are strictly equal, they both need to be object at least
  if (!(x instanceof Object)) { return false; }
  if (!(y instanceof Object)) { return false; }

  // recursive object equality check
  var p = Object.keys(x);
  return Object.keys(y).every(function (i) { return p.indexOf(i) !== -1; }) &&
      p.every(function (i) { return isEqual(x[i], y[i]); });
}

/**
 * Useful in tests for setting up the desired state of the network.
 *
 * Executes the given function and takes a snapshot of the blockchain. Upon
 * subsequent calls to `loadFixture` with the same function, rather than
 * executing the function again, the blockchain will be restored to that
 * snapshot.
 *
 * _Warning_: don't use `loadFixture` with an anonymous function, otherwise the
 * function will be executed each time instead of using snapshots:
 *
 * - Correct usage: `loadFixture(deployTokens, deployTokensParameters)`
 * - Incorrect usage: `loadFixture(async (parameters) => { ... })`
 */
export async function loadFixture<T, P>(fixture: Fixture<T,P>, parameters?: P): Promise<T> {
  if (fixture.name === "") {
    throw new FixtureAnonymousFunctionError();
  }

  const snapshot = snapshots.find(
    (s) => s.fixture === fixture
      && isEqual(s.parameters, parameters));

  if (snapshot !== undefined) {
    try {
      await snapshot.restorer.restore();
      snapshots = snapshots.filter(
        (s) =>
          Number(s.restorer.snapshotId) <= Number(snapshot.restorer.snapshotId)
      );
    } catch (e) {
      if (e instanceof InvalidSnapshotError) {
        throw new FixtureSnapshotError(e);
      }

      throw e;
    }

    return snapshot.data;
  } else {
    const { takeSnapshot } = await import("./helpers/takeSnapshot");
    const data = await fixture(parameters);
    const restorer = await takeSnapshot();

    snapshots.push({
      restorer,
      fixture,
      parameters,
      data,
    });

    return data;
  }
}