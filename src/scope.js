"use strict";

var _ = require('lodash');

function Scope(params) {
  this.$$watchers = [];
  this.$$lastDirtyWatch = null;
}

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function () { },
    valueEq: !!valueEq,
    last: initWatchVal
  };
  this.$$watchers.push(watcher);
  this.$$lastDirtyWatch = null;
};

Scope.prototype.$digest = function () {
  this.$$lastDirtyWatch = null; 

  var dirty,ttl=10;
  do {
    dirty = this.$$digestOnce();
    if (dirty && !(ttl--)) {
      throw '10 digest iterations reached';
    }
  } while (dirty);
};

Scope.prototype.$$digestOnce = function () {
  var self = this, newValue, oldValue, dirty;

  _.forEach(this.$$watchers, function (watcher) {
    try {
      newValue = watcher.watchFn(self);
      oldValue = watcher.last;
  
      if (!self.$$areEqual(newValue, oldValue, watcher.valueEq)) {
        self.$$lastDirtyWatch = watcher;  
        watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
        watcher.listenerFn(newValue,
          (oldValue === initWatchVal ? newValue : oldValue),
          self);
        dirty = true;
      }else if(self.$$lastDirtyWatch === watcher){
        return false;
      }
    } catch (e) {
      console.error(e);
    }    
  });
  
  return dirty;
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq){
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue || typeof newValue === 'number' && typeof oldValue === 'number' && isNaN(newValue) && isNaN(oldValue);
  } 
};

function initWatchVal() {}
module.exports = Scope;