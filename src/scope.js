"use strict";

var _ = require('lodash');

function initWatchVal() { }

function Scope(params) {
  this.$$watchers = [];
  this.$$lastDirtyWatch = null;
  this.$$asyncQueue = [];
  this.$$applyAsyncQueue = [];
  this.$$applyAsyncId = null;
  this.$$postDigestQueue = [];
  this.$$phase = null;
}

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
  var self = this;
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function () { },
    valueEq: !!valueEq,
    last: initWatchVal
  };
  this.$$watchers.unshift(watcher);
  this.$$lastDirtyWatch = null;

  return function () {
    var index = self.$$watchers.indexOf(watcher);
    if (~index) {
      self.$$watchers.splice(index, 1);
      self.$$lastDirtyWatch = null;
    }
  };
};

Scope.prototype.$digest = function () {
  var dirty, ttl = 10;

  this.$$lastDirtyWatch = null;
  this.$beginPhase('$digest');

  if (this.$$applyAsyncId) {
    clearTimeout(this.$$applyAsyncId);
    this.$$flushApplyAsync();
  }
  do {
    while (this.$$asyncQueue.length) {
      try {
        var asyncTask = this.$$asyncQueue.shift();
        asyncTask.scope.$eval(asyncTask.expression);
      } catch (error) {
        // console.log(error);
      }
    }

    dirty = this.$$digestOnce();
    if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
      this.$clearPhase();
      throw '10 digest iterations reached';
    }
  } while (dirty || this.$$asyncQueue.length);
  this.$clearPhase();

  while (this.$$postDigestQueue.length) {
    try {
      this.$$postDigestQueue.shift()();
    } catch (error) {
      // console.log(error);
    }
  }
};

Scope.prototype.$$digestOnce = function () {
  var self = this, newValue, oldValue, dirty;

  _.forEachRight(this.$$watchers, function (watcher) {
    try {
      if (watcher) {
        newValue = watcher.watchFn(self);
        oldValue = watcher.last;

        if (!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
          self.$$lastDirtyWatch = watcher;
          watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
          watcher.listenerFn(newValue,
            (oldValue === initWatchVal ? newValue : oldValue),
            self);
          dirty = true;
        } else if (self.$$lastDirtyWatch === watcher) {
          return false;
        }
      }
    } catch (e) {
      // console.error('$$digestOnce ' + e);
    }
  });

  return dirty;
};

Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue || typeof newValue === 'number' && typeof oldValue === 'number' && isNaN(newValue) && isNaN(oldValue);
  }
};

Scope.prototype.$eval = function (expr, locals) {
  return expr(this, locals);
};

Scope.prototype.$apply = function (expr) {
  try {
    this.$beginPhase('$apply');
    return this.$eval(expr);
  } finally {
    this.$clearPhase();
    this.$digest();
  }
};

// $evalAsync takes a function and schedules it to run later but still during the ongoing digest
Scope.prototype.$evalAsync = function (expr) {
  var self = this;
  if (!self.$$phase && !self.$$asyncQueue.length) { //If there’s something in the queue, we already have a timeout set and it will eventually drain the queue.
    setTimeout(function () {
      if (self.$$asyncQueue.length) {
        self.$digest();
      }
    }, 0);
  }
  this.$$asyncQueue.push({ scope: this, expression: expr });
};

Scope.prototype.$beginPhase = function (phase) {
  if (this.$$phase) {
    throw this.$$phase + ' already in progress';
  }
  this.$$phase = phase;
};

Scope.prototype.$clearPhase = function () {
  this.$$phase = null;
};

Scope.prototype.$applyAsync = function (expr) {
  var self = this;
  self.$$applyAsyncQueue.push(function () {
    self.$eval(expr);
  });
  if (self.$$applyAsyncId === null) {
    self.$$applyAsyncId = setTimeout(function () {
      self.$apply(_.bind(self.$$flushApplyAsync, self));
    }, 0);
  }
};

Scope.prototype.$$flushApplyAsync = function () {
  while (this.$$applyAsyncQueue.length) {
    try {
      this.$$applyAsyncQueue.shift()();
    } catch (error) {
      // console.log(error);
    }
  }
  this.$$applyAsyncId = null;
};

Scope.prototype.$$postDigest = function (fn) {
  this.$$postDigestQueue.push(fn);
};

Scope.prototype.$watchGroup = function (watchFns, listenerFn) {
  var self = this,
    oldValues = [],
    newValues = [],
    changeReactionScheduled = false,
    firstRun = true;

  if (watchFns.length === 0) {
    var shouldCall = true;
    self.$evalAsync(function(){
      if (shouldCall) {        
        listenerFn(newValues, oldValues, self); 
      }
    });
    return function(){
      shouldCall = false; 
    };
  }

  function watchGroupListener() {
    if (firstRun) {
      firstRun = false;
      listenerFn(newValues, newValues, self);
    } else {
      listenerFn(newValues, oldValues, self);
    }
    changeReactionScheduled = false;
  }

  var destroyFunctions = _.map(watchFns, function(watchFn, i){
    return self.$watch(
      watchFn,
      function(newValue, oldValue, scope){
        newValues[i] = newValue;
        oldValues[i] = oldValue;

        if (!changeReactionScheduled) {
          changeReactionScheduled = true;
          self.$evalAsync(watchGroupListener);
        }
      }
    ); 
  });

  return function(){
    _.each(destroyFunctions, function(destroyFunction){
      destroyFunction(); 
    }) ;
  };
};
module.exports = Scope;