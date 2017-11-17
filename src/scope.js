"use strict";

var _ = require('lodash');

function initWatchVal() {}

function Scope(params) {
    this.$$watchers = [];
    this.$$lastDirtyWatch = null;
    this.$$asyncQueue = [];
    this.$$applyAsyncQueue = [];
    this.$$applyAsyncId = null;
    this.$$postDigestQueue = [];
    this.$root = this;
    this.$$children = [];
    this.$$listeners = {};
    this.$$phase = null;
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
    var self = this;
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function() { },
        valueEq: !!valueEq,
        last: initWatchVal
    };
    this.$$watchers.unshift(watcher);
    this.$root.$$lastDirtyWatch = null;

    return function() {
        var index = self.$$watchers.indexOf(watcher);
        if (~index) {
            self.$$watchers.splice(index, 1);
            self.$root.$$lastDirtyWatch = null;
        }
    };
};

Scope.prototype.$digest = function () {
    var dirty, ttl = 10;

    this.$root.$$lastDirtyWatch = null;
    this.$beginPhase('$digest');

    if (this.$root.$$applyAsyncId) {
        clearTimeout(this.$root.$$applyAsyncId);
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
    var self = this,
        continueLoop = true,
        dirty;

    self.$$everyScope(function (scope) {
        var newValue, oldValue;
        _.forEachRight(scope.$$watchers, function (watcher) {
            try {
                if (watcher) {
                    newValue = watcher.watchFn(scope);
                    oldValue = watcher.last;

                    if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                        self.$root.$$lastDirtyWatch = watcher;
                        watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
                        watcher.listenerFn(newValue,
                            (oldValue === initWatchVal ? newValue : oldValue),
                            scope);
                        dirty = true;
                    } else if (self.$root.$$lastDirtyWatch === watcher) {
                        continueLoop = false;
                        return false;
                    }
                }
            } catch (e) {
                // console.error('$$digestOnce ' + e);
            }
        });
        return continueLoop;
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
        this.$root.$digest();
    }
};

// $evalAsync takes a function and schedules it to run later but still during the ongoing digest
Scope.prototype.$evalAsync = function (expr) {
    var self = this;
    if (!self.$$phase && !self.$$asyncQueue.length) { // If there’s something in the queue, we already have a timeout set and it will eventually drain the queue.
        setTimeout(function () {
            if (self.$$asyncQueue.length) {
                self.$root.$digest();
            }
        }, 0);
    }
    this.$$asyncQueue.push({scope : this, expression : expr});
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
    if (self.$root.$$applyAsyncId === null) {
        self.$root.$$applyAsyncId = setTimeout(function () {
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
    this.$root.$$applyAsyncId = null;
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
        self.$evalAsync(function () {
            if (shouldCall) {
                listenerFn(newValues, oldValues, self);
            }
        });
        return function () {
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

    var destroyFunctions = _.map(watchFns, function (watchFn, i) {
        return self.$watch(
            watchFn,
            function (newValue, oldValue, scope) {
                newValues[i] = newValue;
                oldValues[i] = oldValue;

                if (!changeReactionScheduled) {
                    changeReactionScheduled = true;
                    self.$evalAsync(watchGroupListener);
                }
            }
        );
    });

    return function () {
        _.each(destroyFunctions, function (destroyFunction) {
            destroyFunction();
        });
    };
};

Scope.prototype.$$new = function () {
    var ChildScope = function () {
    };
    ChildScope.prototype = this;
    var child = new ChildScope();
    return child;
};
Scope.prototype.$new = function (isolate, parent) {
    var childScope;
    parent = parent || this;
    if (isolate) {
        childScope = new Scope();
        childScope.$root = parent.$root;
        childScope.$$asyncQueue = parent.$$asyncQueue;
        childScope.$$postDigestQueue = parent.$$postDigestQueue;
        childScope.$$applyAsyncQueue = parent.$$applyAsyncQueue;
    } else {
        childScope = Object.create(this); // behavior delegation
        childScope.$$watchers = [];
        childScope.$$children = [];
        childScope.$$listeners = {};
    }
    childScope.$parent = parent;
    parent.$$children.push(childScope);
    return childScope;
};

Scope.prototype.$$everyScope = function (fn) {
    if (fn(this)) {
        return this.$$children.every(function (child) {
            return child.$$everyScope(fn);
        });
    } else {
        return false;
    }
};

Scope.prototype.$destroy = function () {
    this.$broadcast('$destroy');
    if (this.$parent) {
        var siblings = this.$parent.$$children;
        var idxOfThis = siblings.indexOf(this);
        if (idxOfThis) {
            siblings.splice(idxOfThis, 1);
        }
    }
    this.$$watchers = null;
    this.$$listeners = {};
};

Scope.prototype.$watchCollection = function (watchFn, listenerFn) {
    var self = this;
    var newValue,
        oldValue,
        oldLength,
        veryOldValue,
        trackVeryOldValue = (listenerFn.length > 1),
        changeCount = 0,
        firstRun = true;

    var internalWatchFn = function (scope) {
        var newLength;
        newValue = watchFn(scope);

        if (_.isObject(newValue)) {
            if (isArrayLike(newValue)) {
                if (!_.isArray(oldValue)) {
                    changeCount++;
                    oldValue = [];
                }
                if (newValue.length !== oldValue.length) { // compare partial difference with the last change
                    oldValue.length = newValue.length;
                    changeCount++;
                }
                _.each(newValue, function (item, i) {
                    if (!self.$$areEqual(item, oldValue[i], false)) {
                        oldValue[i] = item;
                        changeCount++;
                    }
                });
            } else {
                if (!_.isObject(oldValue) || isArrayLike(oldValue)) {
                    changeCount++;
                    oldValue = {};
                    oldLength = 0;
                }
                newLength = 0;
                _.forOwn(newValue, function (newVal, key) {
                    newLength++;
                    if (oldValue.hasOwnProperty(key)) {
                        if (!self.$$areEqual(oldValue[key], newVal, false)) {
                            changeCount++;
                            oldValue[key] = newVal;
                        }
                    } else {
                        changeCount++;
                        oldLength++;
                        oldValue[key] = newVal;
                    }
                });
                if (oldLength > newLength) {
                    changeCount++;
                    _.forOwn(oldValue, function (newVal, key) {
                        if (!newValue.hasOwnProperty(key)) {
                            oldLength--;
                            delete oldValue[key];
                        }
                    });
                }
            }
        } else {
            if (!self.$$areEqual(newValue, oldValue, false)) {
                changeCount++;
            }
            oldValue = newValue;
        }

        return changeCount;
    };
    var internalListenerFn = function () {
        if (firstRun) {
            listenerFn(newValue, newValue, self);
            firstRun = false;
        } else {
            listenerFn(newValue, veryOldValue, self);
        }

        if (trackVeryOldValue) {
            veryOldValue = _.clone(newValue);
        }
    };
    return this.$watch(internalWatchFn, internalListenerFn);
};

function isArrayLike(obj) {
    if (_.isNull(obj) || _.isUndefined(obj)) {
        return false;
    }
    var length = obj.length;
    return length === 0 || (_.isNumber(length) && length > 0 && (length - 1) in obj);
}

Scope.prototype.$on = function (eventName, listener) {
    var listeners = this.$$listeners[eventName] || (this.$$listeners[eventName] = []);
    listeners.push(listener);

    return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners[index] = null;
        }
    };
};

Scope.prototype.$emit = function (eventName) {
    var propagationStopped = false;
    var event = {
        name : eventName,
        targetScope : this,
        stopPropagation : function () {
            propagationStopped = true;
        },
        preventDefault : function () {
            event.defaultPrevented = true;
        }
    };
    var listenerArgs = [event].concat(_.tail(arguments));
    var scope = this;
    do {
        event.currentScope = scope;
        scope.$$fireEventOnScope(eventName, listenerArgs);
        scope = scope.$parent;
    } while (scope && !propagationStopped);
    event.currentScope = null;
    return event;
};

Scope.prototype.$broadcast = function (eventName) {
    var event = {
        name : eventName,
        targetScope : this,
        preventDefault : function () {
            event.defaultPrevented = true;
        }
    };
    var listenerArgs = [event].concat(_.tail(arguments));
    this.$$everyScope(function (scope) {
        event.currentScope = scope;
        scope.$$fireEventOnScope(eventName, listenerArgs);
        return true;
    });
    event.currentScope = null;
    return event;
};

Scope.prototype.$$fireEventOnScope = function (eventName, listenerArgs) {
    var listeners = this.$$listeners[eventName] || [];
    var i = 0;
    while (i < listeners.length) {
        if (listeners[i] === null) {
            listeners.splice(i, 1);
        } else {
            try {
                listeners[i].apply(null, listenerArgs);
            } catch (e) {
                console.error(e);
            }
            i++;
        }
    }
};
module.exports = Scope;
