/**
 * reducer()
 *
 * @param {Object} store Store instance
 * @param {String} matcher Matcher
 * @param {Function} cb Callback
 * @param {String} nameSpace Namespace
 * @returns {Function} Un-register function
 */
const reducer = (store, matcher, cb, nameSpace) => {
  // Private functions
  const update = (stateVar) => {
    const state = nameSpace ? stateVar.get(nameSpace) : stateVar;

    if (state) {
      const data = state.get(matcher);
      if (data) {
        cb(true, data);
      }
      else {
        cb(false);
      }
    }
  };

  // Return the un-register function right away.
  return store.addReducer(update);
};

export default reducer;
