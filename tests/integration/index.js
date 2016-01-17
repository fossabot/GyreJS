import GyreJS from "../../src/index";
const expect = require("chai").expect;
import Immutable from "immutable";

const DebugInstance = function() {
  this.gyres = {};
};

DebugInstance.prototype.addGyre = function(id, gyre) {
  const self = this;
  self.gyres[id] = {
    gyre: {},
    log: {
      calls: [],
      dispatcherCalls: [],
      busCalls: [],
      events: [],
      commands: []
    },
    bus: {},
    dispatcher: {}
  };

  return Object.keys(gyre).reduce((methods, gyreMethod) => {
    methods[gyreMethod] = (...args) => {
      self.gyres[id].log.calls.push([gyreMethod, Date.now(), ...args]);
      return gyre[gyreMethod](...args);
    };
    return methods;
  }, self.gyres[id].gyre);
};

DebugInstance.prototype.addBus = function(id, bus) {
  const self = this;
  return Object.keys(bus).reduce((methods, busMethod) => {
    methods[busMethod] = (...args) => {
      self.gyres[id].log.busCalls.push([busMethod, Date.now(), ...args]);
      return bus[busMethod](...args);
    };
    return methods;
  }, self.gyres[id].bus);
};

DebugInstance.prototype.addDispatcher = function(id, dispatcher) {
  const self = this;
  return Object.keys(dispatcher).reduce((methods, dpMethod) => {
    methods[dpMethod] = (...args) => {
      self.gyres[id].log.dispatcherCalls.push([dpMethod, Date.now(), ...args]);
      return dispatcher[dpMethod](...args);
    };
    return methods;
  }, self.gyres[id].dispatcher);
};

DebugInstance.prototype.getGyres = function() {
  return this.gyres;
};

DebugInstance.prototype.getLogs = function(id) {
  return this.gyres[id].log;
};

DebugInstance.prototype.resetGyre = function(id) {
  return this.gyres[id].bus.trigger(Object.freeze({type: "__RESET__"}));
};

let debugInstance = new DebugInstance();
GyreJS.attachDebugger(debugInstance);

describe("GyreJS", function() {
  it("can create a new gyre", function() {
    // Aggregate business rule:
    // can't count below 0 and above 5
    const aggMethodCalls = [];
    const aggStates = [];
    const aggregates = {
      "counter": {
        eventFilter: (event) => ["incremented", "decremented"].indexOf(event.type) !== -1,
        // eventFilter: ["incremented", "decremented"],
        methods: {
          "increment": function(state, gyre, byValue) {
            aggMethodCalls.push(["i", byValue, state]);
            aggStates.push(state);
            if (
              state.count + byValue >= 0 &&
              state.count + byValue <= 5) {
              gyre.trigger("incremented", state.count, state.count + byValue, byValue);
            }
          },
          "decrement": function(state, gyre, byValue) {
            aggMethodCalls.push(["d", byValue, state]);
            aggStates.push(state);
            if (state.count - byValue >= 0) {
              gyre.trigger("decremented", state.count, state.count - byValue, -1 * byValue);
            }
          }
        },
        reducer: (state = {count: 0}, event) => {
          switch (event.type) {
            case "incremented":
            case "decremented":
              return Object.assign({}, state, {
                count: state.count + event.by
              });
            default:
              return state;
          }
        }
      }
    };

    // Commands
    const commands = {
      "incrementCounter": function(gyre, value) {
        // gyre.getAggregate
        // gyre.issue
        // gyre.trigger
        gyre.getAggregate("counter")
          .increment(value);
      },
      "decrementCounter": function(gyre, value) {
        gyre.getAggregate("counter")
          .decrement(value);
      },
      increment: "counter",
      decrement: ["counter", {foo: "bar"}]
    };

    // Events (as obj or array?)
    const events = {
      "incremented": (oldValue, newValue, by) => ({oldValue, newValue, by}),
      "decremented": ["oldValue", "newValue", "by"],
      "misc": ["misc"]
    };

    // projection 1: count
    // projection 2: number of increments / decrements / total actions
    // projection 3: number distance (abs(value) + abs(value)
    const projectionEvents = [];
    const projectionStates = [];
    const projectionIEvents = [];
    const projectionIStates = [];
    const projections = {
      test1_obj: {
        initialState: {count: 0},
        events: {
          "^(in|de)cremented$": (state, event) => Object.assign({}, state, {
            count: state.count + event.by
          })
        }
      },
      test1: (state = {count: 0}, event) => {
        projectionEvents.push(event);
        projectionStates.push(state);

        switch (event.type) {
          case "incremented":
          case "decremented":
            return Object.assign({}, state, {
              count: state.count + event.by
            });
          default:
            return state;
        }
      },
      test1_immutable: (state = Immutable.Map({count: 0}), event) => {
        projectionIEvents.push(event);
        projectionIStates.push(state.toJSON());

        switch (event.type) {
          case "incremented":
          case "decremented":
            return state.set("count", state.get("count") + event.by)
          default:
            return state;
        }
      },
      test1_number: (state = 0, event) => {
        switch (event.type) {
          case "incremented":
          case "decremented":
            return state + event.by;
          default:
            return state;
        }
      },
      test2: (state = {evtCount: 0, dCount: 0, iCount: 0}, event) => {
        switch (event.type) {
          case "incremented":
            return Object.assign({}, state, {
              evtCount: state.evtCount + 1,
              iCount: state.iCount + 1
            });
          case "decremented":
            return Object.assign({}, state, {
              evtCount: state.evtCount + 1,
              dCount: state.dCount + 1
            });
          default:
            return state;
        }
      },
      test3: (state = {absDistance: 0}, event) => {
        // Test event immutability
        try {
          // Add a prop
          event.someprop = 1;
        }
        catch(e) {
          expect(e.message).to.equal("Can't add property someprop, object is not extensible");
        }

        try {
          // Alter a prop
          event.type = "notrighttype";
        }
        catch(e) {
          expect(e.message).to.equal("Cannot assign to read only property \'type\' of #<Object>");
        }

        switch (event.type) {
          case "incremented":
          case "decremented":
            return Object.assign({}, state, {
              absDistance: state.absDistance + Math.abs(event.by)
            });
          default:
            return state;
        }
      }
    };

    // Create and register gyre factory
    const simpleGyre = GyreJS.createGyre("simple", {
      commands,
      events,
      aggregates,
      projections,
      ticker: "synchronous"
    })({testOption: "foo"});

    // Instantiate a gyre
    const simpleGyre1 = GyreJS.instantiateGyre("simple");

    // Test double commands, events, aggregates and projections protection.
    simpleGyre.addCommands(commands);
    simpleGyre.addEvents(events);
    simpleGyre.addAggregates(aggregates);
    simpleGyre.addProjections(projections);

    const stateArray = [];
    const test1L = simpleGyre.addListener("test1", (state) => {
      stateArray.push(state);
    });

    let test1_immutable_state;
    const test1_immutable = simpleGyre.addListener("test1_immutable", (state) => {
      test1_immutable_state = state;
    });

    let test1_number_state;
    let test1States = [];
    const test1_number = simpleGyre.addListener("test1_number", (state) => {
      test1_number_state = state;
      test1States.push(state);
    });

    let test2state;
    const test2L = simpleGyre.addListener("test2", (state) => {
      test2state = state;
    });

    let test3state;
    const test3L = simpleGyre.addListener("test3", (state) => {
      test3state = state;

      // test overriding state
      state = { test: "foo"};
    });

    let test3state_2;
    const test3L_2 = simpleGyre.addListener("test3", (state) => {
      test3state_2 = state;
    });

    // Issue commands
    simpleGyre
      .issue("incrementCounter", 2) // 2
      .issue("decrementCounter", 1) // 1
      .issue("decrement", 1) // 0
      .issue("increment", 1) // 1
      .issue("misc", 1) // 1
      .issue("misc", 1) // 1
      .issue("misc", 1) // 1
      .issue("decrementCounter", 7) // omitted; does not adhere to business rules
      .issue("incrementCounter", 3) // 4
      .issue("wrong-event", 3)      // omitted; does not exist
      .issue("decrementCounter", 2) // 2
      .issue("incrementCounter", 3);// 5

    console.log(aggMethodCalls);
    console.log(projectionEvents);
    console.log(projectionIEvents);
    console.log(projectionStates);
    console.log(projectionIStates);
    console.log(stateArray);
    console.log(aggStates);
    console.log(test1States);

    // TODO: fix why aggregate does not see updated state?
    expect(stateArray.length).to.equal(8);
    expect(Immutable.is(test1_immutable_state, Immutable.Map({count: 5}))).to.equal(true);
    expect(test1_number_state).to.equal(5);
    expect(test2state).to.deep.equal({ evtCount: 7, dCount: 3, iCount: 4 });
    expect(test3state).to.deep.equal({ absDistance: 13});
    expect(test3state_2).to.deep.equal({ absDistance: 13});

    // Test projection
    const evts = [
      { type: "incremented", oldValue: 0, newValue: 2, by: 2},
      { type: "incremented", oldValue: 2, newValue: 4, by: 2},
      { type: "decremented", oldValue: 4, newValue: 3, by: -1}
    ];

    const projectionState = evts.reduce((prevState, evt) => {
      return projections["test1"](prevState, evt);
    }, void(0));
    expect(projectionState).to.deep.equal({count: 3});

    // Debug instance tests
    const gyreList = Object.keys(debugInstance.getGyres());
    const simpleGyreId = gyreList[0];
    expect(gyreList).to.deep.equal(["simple-0", "simple-1"]);
    const gyreCallListFull = debugInstance.getLogs(simpleGyreId).calls.map(call => {
      const m = new Date(call[1]);
      return {
        id: call[0],
        timestamp: m.getUTCHours() + ":" + m.getUTCMinutes() + ":" + m.getUTCSeconds() + ":" + m.getUTCMilliseconds()
      };
    });
    const gyreCallList = debugInstance.getLogs(simpleGyreId).calls.map(call => {
      return call[0];
    });

    // Test reset functionality
    debugInstance.resetGyre(simpleGyreId);
    console.log(debugInstance.getLogs(simpleGyreId).busCalls.length);
    console.log(debugInstance.getLogs(simpleGyreId).busCalls[15]);
    expect(test2state).to.deep.equal({ evtCount: 0, dCount: 0, iCount: 0 });
    expect(test3state).to.deep.equal({ absDistance: 0});
    expect(test3state_2).to.deep.equal({ absDistance: 0});

    // Issue commands
    simpleGyre
      .issue("incrementCounter", 2) // 2
      .issue("decrementCounter", 1) // 1
      .issue("decrementCounter", 1) // 0
      .issue("incrementCounter", 1) // 1
      .issue("decrementCounter", 7) // omitted
      .issue("incrementCounter", 3) // 4
      .issue("wrong-event", 3)      // omitted
      .issue("decrementCounter", 2) // 2
      .issue("incrementCounter", 3);// 5

    // Manually trigger an event
    simpleGyre.trigger("incremented", 1, 2, 1);

    // TODO: fix aggregates listening to reset
    expect(test2state).to.deep.equal({ evtCount: 8, dCount: 3, iCount: 5 });
    expect(test3state).to.deep.equal({ absDistance: 14});
    expect(test3state_2).to.deep.equal({ absDistance: 14});

    // Test cleanup
    debugInstance.resetGyre(simpleGyreId);

    // Reset again
    debugInstance.resetGyre(simpleGyreId);

    // Cleanup listeners
    test1L();
    test2L();
    test3L();
    test3L_2();

    // Manually trigger an event again
    simpleGyre
      .issue("incrementCounter", 2);
    simpleGyre.trigger("incremented", 1, 2, 1);

    // State should remain the same as before triggering the events after the reset.
    expect(test2state).to.deep.equal({ evtCount: 0, dCount: 0, iCount: 0 });
    expect(test3state).to.deep.equal({ absDistance: 0});
    expect(test3state_2).to.deep.equal({ absDistance: 0});

    // Remove projections; should work now since listeners have been removed.
    expect(simpleGyre.removeProjection("test1")).to.equal(true);
    expect(simpleGyre.removeProjection("counter")).to.equal(false);

    // Unregister existing and non-existing gyres.
    expect(GyreJS.unRegisterGyre("simple")).to.equal(true);
    expect(GyreJS.unRegisterGyre("simple1")).to.equal(false);
  });
});
