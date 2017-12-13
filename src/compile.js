'use strict';

var _ = require('lodash');
var $ = require('jquery');

var PREFIX_REGEXP = /(x[\:\-_]|data[\:\-_])/i;
var BOOLEAN_ATTRS = {
    multiple: true,
    selected: true,
    checked: true,
    disabled: true,
    readOnly: true,
    required: true,
    open: true
};
var BOOLEAN_ELEMENTS = {
    INPUT: true,
    SELECT: true,
    OPTION: true,
    TEXTAREA: true,
    BUTTON: true,
    FORM: true,
    DETAILS: true
};
var REQUIRE_PREFIX_REGEXP = /^(\^\^?)?(\?)?(\^\^?)?/;


function nodeName(element) {
    return element.nodeName ? element.nodeName : element[0].nodeName;
}

/** strip away the x/data/-/: prefix **/
function directiveNormalize(name) {
    return _.camelCase(name.replace(PREFIX_REGEXP, ''));
}

function isBooleanAttribute(node, attrName) {
    return BOOLEAN_ATTRS[attrName] && BOOLEAN_ELEMENTS[node.nodeName];
}

function parseIsolateBindings(scope) {
    var bindings = {};
    _.forEach(scope, function(definition, scopeName) {
        var match = definition.match(/\s*([@<&]|=(\*?))(\??)\s*(\w*)\s*/);
        bindings[scopeName] = {
            mode : match[1][0],
            collection : match[2],
            optional : match[3],
            attrName : match[4] || scopeName
        };
    });
    return bindings;
}

function parseDirectiveBindings(directive) {
    var bindings = {};
    if (_.isObject(directive.scope)) {
        if (directive.bindToController) {
            bindings.bindToController = parseIsolateBindings(directive.scope);
        } else {
            bindings.isolateScope = parseIsolateBindings(directive.scope);
        }
    }
    if (_.isObject(directive.bindToController)) {
        bindings.bindToController = parseIsolateBindings(directive.bindToController);
    }
    return bindings;
}

// deal with object as require value
function getDirectiveRequire(directive, name) {
    var require = directive.require || (directive.controller && name);
    if (!_.isArray(require) && _.isObject(require)) {
        _.forEach(require, function(value, key) {
            var prefix = value.match(REQUIRE_PREFIX_REGEXP);
            var name = value.substring(prefix[0].length);
            if (!name) {
                require[key] = prefix[0] + key;
            }
        });
    }
    return require;
}

function $CompileProvider($provide) {

    var hasDirectives = {};

    this.directive = function(name, directiveFactory) {
        if (_.isString(name)) {
            if (name === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid directive name';
            }

            if (!hasDirectives.hasOwnProperty(name)) {
                hasDirectives[name] = [];
                $provide.factory(name + 'Directive', ['$injector', function($injector) {
                    var factories =  hasDirectives[name];
                    return _.map(factories, function(factory, i) {
                        var directive = $injector.invoke(factory);
                        directive.restrict = directive.restrict || 'EA';
                        directive.priority = directive.priority || 0;
                        if (directive.link && !directive.compile) {
                            directive.compile = _.constant(directive.link);
                        }
                        directive.$$bindings = parseDirectiveBindings(directive);
                        directive.name = directive.name || name;
                        directive.require = getDirectiveRequire(directive, name);
                        directive.index = i;
                        return directive;
                    });
                }]);
            }
            hasDirectives[name].push(directiveFactory);
        } else {
            _.each(name, _.bind(function(directiveFactory, name) {
                this.directive(name, directiveFactory);
            }, this));
        }
    };

    this.$get = ['$injector', '$rootScope', '$parse', '$controller', function($injector, $rootScope, $parse, $controller) {

        function Attributes(element) {
            this.$$element = element;
            this.$attr = {};  // normalized-to-denormalized mapping
        }

        Attributes.prototype.$set = function(key, value, writeAttr, attrName) {
            this[key] = value;

            if(isBooleanAttribute(this.$$element[0], key)) {
                this.$$element.prop(key, value);
            }

            if (!attrName) {
                if (this.$attr[key]) {
                    attrName = this.$attr[key];
                } else {
                    attrName = this.$attr[key] = _.kebabCase(key);
                }
            } else {
                this.$attr[key] = attrName;
            }

            if (writeAttr !== false) {
                this.$$element.attr(attrName, value);
            }

            if (this.$$oberservers) {
                _.forEach(this.$$oberservers[key], function(observer) {
                    try{
                        observer(value);
                    }catch (e) {
                        console.log(e);
                    }
                });
            }
        };

        Attributes.prototype.$observe = function(key, fn) {
            var self = this;
            this.$$oberservers = this.$$oberservers || Object.create(null);
            this.$$oberservers[key] = this.$$oberservers[key] || [];
            this.$$oberservers[key].push(fn);

            $rootScope.$evalAsync(function() {
                fn(self[key]);
            });

            return function() {
                var index = self.$$oberservers[key].indexOf(fn);
                if (index !== -1) {
                    self.$$oberservers[key].splice(index, 1);
                }
            };
        };

        Attributes.prototype.$addClass = function(classVal) {
            this.$$element.addClass(classVal);
        };

        Attributes.prototype.$removeClass = function(classVal) {
            this.$$element.removeClass(classVal);
        };

        Attributes.prototype.$updateClass = function(newClassVal, oldClassVal) {
            var newClasses = newClassVal.split(/\s+/);
            var oldClasses = oldClassVal.split(/\s+/);
            var addedClasses = _.difference(newClasses, oldClasses);
            var removedClasses = _.difference(oldClasses, newClasses);

            if (addedClasses.length) {
                this.$$element.addClass(addedClasses.join(' '));
            }
            if (removedClasses.length) {
                this.$$element.removeClass(removedClasses.join(' '));
            }
        };

        /**
         * 1. entrance. compile & link(pre-post)
         */
        function compile($compileNodes) {
            var compositeLinkFn = compileNodes($compileNodes);

            return function publicLinkFn(scope) {
                $compileNodes.data('$scope', scope);
                compositeLinkFn(scope, $compileNodes);
            };
        }

        /**
         * collectDirectives, applyDirectivesToNode, recurring child. linkFns
         * @param $compileNodes
         * @returns {compositeLinkFn}
         */
        function compileNodes($compileNodes) {
            var linkFns = [];
            _.forEach($compileNodes, function(node, i) {
                var attrs = new Attributes($(node));
                var directives = collectDirectives(node, attrs);
                var nodeLinkFn;
                if (directives.length) {
                    nodeLinkFn = applyDirectivesToNode(directives, node, attrs);
                }
                var childLinkFn;
                if ((!nodeLinkFn || !nodeLinkFn.terminal) &&
                    node.childNodes && node.childNodes.length) {
                    childLinkFn = compileNodes(node.childNodes);
                }
                if (nodeLinkFn && nodeLinkFn.scope) {
                    attrs.$$element.addClass('ng-scope');
                }
                if (nodeLinkFn || childLinkFn) {
                    linkFns.push({
                        nodeLinkFn : nodeLinkFn,
                        childLinkFn : childLinkFn,
                        idx : i
                    });
                }
            });

            function compositeLinkFn(scope, linkNodes) {
                var stableNodeList = [];
                _.forEach(linkFns, function(linkFn) {
                    stableNodeList[linkFn.idx] = linkNodes[linkFn.idx];
                });
                _.forEach(linkFns, function(linkFn) {
                    var node = stableNodeList[linkFn.idx];
                    if (linkFn.nodeLinkFn) {
                        if (linkFn.nodeLinkFn.scope) {
                            scope = scope.$new();
                            $(node).data('$scope', scope);
                        }
                        linkFn.nodeLinkFn(
                            linkFn.childLinkFn,
                            scope,
                            node);
                    }else {
                        linkFn.childLinkFn(
                            scope,
                            node.childNodes
                        );
                    }
                });
            }

            return compositeLinkFn;
        }

        /**
         * mvp : construct  preLinkFn postLinkFn by iterating directives:array executing compile:function,
         * deal with different kind scope and set the flag. instantiate controller.
         * @param directives
         * @param compileNode
         * @param attrs
         * @returns {nodeLinkFn}
         */
        function applyDirectivesToNode(directives, compileNode, attrs) {
            var $compileNode = $(compileNode);
            var terminalPriority = -Number.MAX_VALUE;
            var terminal = false;
            var preLinkFns = [], postLinkFns = [], controllers = {};
            var newScopeDirective, newIsolateScopeDirective;
            var templateDirective;
            var controllerDirectives;

            // retrieve required controller
            function getControllers(require, $element) {
                if (_.isArray(require)) {
                    return _.map(require, function(r) {
                        return getControllers(r, $element);
                    });
                } else if(_.isObject(require)) {
                    return _.mapValues(require, function(r) {
                        return getControllers(r, $element);
                    });
                }
                else {
                    var value;
                    var match = require.match(REQUIRE_PREFIX_REGEXP);
                    var optional = match[2];
                    require = require.substring(match[0].length);
                    if (match[1] || match[3]) {
                        if (match[3] && !match[1]) {
                            match[1] = match[3];
                        }
                        if (match[1] === '^^') {
                            $element = $element.parent();
                        }
                        while ($element.length) {
                            value = $element.data('$' + require + 'Controller');
                            if (value) {
                                break;
                            } else {
                                $element = $element.parent();
                            }
                        }
                    } else {
                        if (controllers[require]) {
                            value = controllers[require].instance;
                        }
                    }
                    if (!value && !optional) {
                        throw 'Controller ' + require +
                        ' required by directive, cannot be found!';
                    }
                    return value || null;
                }
            }

            // add preLinkFn postLinkFn, set isolateScope to linkFns
            function addLinkFns(preLinkFn, postLinkFn, attrStart, attrEnd, isolateScope, require) {
                if (preLinkFn) {
                    if (attrStart) {
                        preLinkFn = groupElementsLinkFnWrapper(preLinkFn, attrStart, attrEnd);
                    }
                    preLinkFn.isolateScope = isolateScope;
                    preLinkFn.require = require;
                    preLinkFns.push(preLinkFn);
                }
                if (postLinkFn) {
                    if (attrStart) {
                        postLinkFn = groupElementsLinkFnWrapper(postLinkFn, attrStart, attrEnd);
                    }
                    postLinkFn.isolateScope = isolateScope;
                    postLinkFn.require = require;
                    postLinkFns.push(postLinkFn);
                }
            }
            // executing compile and set the scope flag.
            _.each(directives, function(directive) {
                if (directive.$$start) {
                    $compileNode = groupScan(compileNode, directive.$$start, directive.$$end);
                }
                if (directive.priority < terminalPriority) {
                    return false;
                }
                if (directive.scope) {
                    if (_.isObject(directive.scope)) {
                        if (newIsolateScopeDirective || newScopeDirective) {
                            throw 'Multiple directives asking for new/inherited scope';
                        }
                        newIsolateScopeDirective = directive;
                    } else {
                        if (newIsolateScopeDirective) {
                            throw 'Multiple directives asking for new/inherited scope';
                        }
                        newScopeDirective = newScopeDirective || directive;
                    }
                }

                if (directive.controller) {
                    controllerDirectives = controllerDirectives || {};
                    controllerDirectives[directive.name] = directive;
                }

                if (directive.compile) {
                    var linkFn = directive.compile($compileNode, attrs);
                    var isolateScope = (directive === newIsolateScopeDirective);
                    var attrStart = directive.$$start;
                    var attrEnd = directive.$$end;
                    var require = directive.require;
                    if (_.isFunction(linkFn)) {
                        addLinkFns(null, linkFn, attrStart, attrEnd, isolateScope, require);
                    } else if(linkFn) {
                        addLinkFns(linkFn.pre, linkFn.post, attrStart, attrEnd, isolateScope, require);
                    }
                }
                if (directive.template) {
                    if (templateDirective) {
                        throw 'Multiple directives asking for template';
                    }
                    templateDirective = directive;
                    $compileNode.html(_.isFunction(directive.template) ?
                        directive.template($compileNode, attrs) :
                        directive.template);
                }
                if (directive.terminal) {
                    terminal = true;
                    terminalPriority = directive.priority;
                }
            });

            function nodeLinkFn(childLinkFn, scope, linkNode) {
                var $element =  $(linkNode);

                var isolateScope;
                if (newIsolateScopeDirective) {
                    isolateScope = scope.$new(true);
                    $element.addClass('ng-isolate-scope');
                    $element.data('$isolateScope', isolateScope);
                }

                // controller instantiating in semi-constructed form
                if (controllerDirectives) {
                    _.forEach(controllerDirectives, function(directive) {
                        var locals = {
                            $scope : directive === newIsolateScopeDirective ? isolateScope : scope,
                            $element : $element,
                            $attrs : attrs
                        };
                        var controllerName = directive.controller;
                        if (controllerName === '@') {
                            controllerName = attrs[directive.name];
                        }
                        var controller =
                            $controller(controllerName, locals, true, directive.controllerAs);
                        controllers[directive.name] = controller;
                        $element.data('$' + directive.name + 'Controller', controller.instance);
                    });
                }

                // deal witch isolateScope binding before link fun exec
                if (newIsolateScopeDirective) {
                    initializeDirectiveBindings(
                        scope,
                        attrs,
                        isolateScope,
                        newIsolateScopeDirective.$$bindings.isolateScope,
                        isolateScope
                    );
                }

                var scopeDirective = newIsolateScopeDirective || newScopeDirective;
                if (scopeDirective && controllers[scopeDirective.name]) {
                    initializeDirectiveBindings(
                        scope,
                        attrs,
                        controllers[scopeDirective.name].instance,
                        scopeDirective.$$bindings.bindToController,
                        isolateScope
                    );
                }

                // invoke the semi-constructed controller functions
                _.forEach(controllers, function(controller) {
                    controller();
                });

                _.forEach(controllerDirectives, function(directive) {
                    var require = directive.require;
                    if (_.isObject(require) && !_.isArray(require) &&
                        directive.bindToController) {
                        var controllerInstance = controllers[directive.name].instance;
                        var requiredControllers = getControllers(require, $element);
                        _.assign(controllerInstance, requiredControllers);
                    }
                });

                _.forEach(preLinkFns, function(linkFn) {
                    linkFn(
                        linkFn.isolateScope ? isolateScope : scope,
                        $element,
                        attrs,
                        linkFn.require && getControllers(linkFn.require, $element)
                    );
                });

                if (childLinkFn) {
                    childLinkFn(scope, linkNode.childNodes);
                }
                _.forEachRight(postLinkFns, function(linkFn) {
                    linkFn(
                        linkFn.isolateScope ? isolateScope : scope,
                        $element,
                        attrs,
                        linkFn.require && getControllers(linkFn.require, $element)
                    );
                });
            }
            nodeLinkFn.terminal = terminal;
            nodeLinkFn.scope = newScopeDirective && newScopeDirective.scope;

            return nodeLinkFn;
        }

        function initializeDirectiveBindings(scope, attrs, destination, bindings, newScope) {
            _.forEach(
                bindings,
                function(definition, scopeName) {
                    var attrName = definition.attrName;
                    var parentGetParseFun, unwatch;

                    switch (definition.mode) {
                    case '@':
                        attrs.$observe(attrName, function(newAttrValue) {
                            destination[scopeName] = newAttrValue;
                        });
                        if (attrs[attrName]) {
                            destination[scopeName] = attrs[attrName];
                        }
                        break;
                    case '<':
                        if (definition.optional && !attrs[attrName]) {
                            break;
                        }
                        parentGetParseFun = $parse(attrs[attrName]);
                        destination[scopeName] = parentGetParseFun(scope);
                        unwatch = scope.$watch(parentGetParseFun,
                            function(newValue) {
                                destination[scopeName] = newValue;
                            });
                        newScope.$on('$destroy', unwatch);
                        break;
                    case '=':
                        if (definition.optional && !attrs[attrName]) {
                            break;
                        }
                        parentGetParseFun = $parse(attrs[attrName]);
                        var lastValue = destination[scopeName] = parentGetParseFun(
                            scope); // right now scope is empty

                        var parentValueWatch = function() {
                            var parentValue = parentGetParseFun(scope);
                            if (lastValue !== parentValue) {
                                destination[scopeName] = parentValue;
                            } else {
                                parentValue = destination[scopeName];
                                parentGetParseFun.assign(scope, parentValue);
                            }
                            lastValue = parentValue;
                            return lastValue;
                        };
                        if (definition.collection) {
                            unwatch = scope.$watchCollection(attrs[attrName],
                                parentValueWatch);
                        } else {
                            unwatch = scope.$watch(parentValueWatch);
                        }
                        newScope.$on('$destroy', unwatch);
                        break;
                    case '&':
                        var parentExpr = $parse(attrs[attrName]);
                        if (parentExpr === _.noop && definition.optional) {
                            break;
                        }
                        destination[scopeName] = function(locals) {
                            return parentExpr(scope, locals);
                        };
                    }
                });
        }
        /**
         * collect directive info from e/a/c/m, and set attributes to {attrs}(normalized name mapping)
         * sort direct by priority and name
         **/
        function collectDirectives(node, attrs) {
            var directives = [];
            var match;
            if (node.nodeType === Node.ELEMENT_NODE) {
                var normalizedNodeName = directiveNormalize(nodeName(node).toLowerCase());
                addDirective(directives, normalizedNodeName, 'E');

                _.forEach(node.attributes, function(attr) {
                    var attrStartName, attrEndName;
                    var name = attr.name;
                    var normalizedAttrName = directiveNormalize(attr.name.toLowerCase());
                    var isNgAttr = /^ngAttr[A-Z]/.test(normalizedAttrName);
                    if (isNgAttr) {
                        name = _.kebabCase(
                            normalizedAttrName[6].toLowerCase() +
                            normalizedAttrName.substring(7)
                        );
                        normalizedAttrName = directiveNormalize(name.toLowerCase());
                    }
                    attrs.$attr[normalizedAttrName] = name;

                    var directiveNName = normalizedAttrName.replace(/(Start|End)$/, '');
                    if (directiveIsMultiElement(directiveNName)) {
                        if (/Start$/.test(normalizedAttrName)) {
                            attrStartName = name;
                            attrEndName = name.substring(0, name.length - 5) + 'end';
                            name = name.substring(0, name.length - 6);
                        }
                    }
                    normalizedAttrName = directiveNormalize(name.toLowerCase());
                    addDirective(directives, normalizedAttrName, 'A', attrStartName, attrEndName);
                    if (isNgAttr || !attrs.hasOwnProperty(normalizedAttrName)) {
                        attrs[normalizedAttrName] = attr.value.trim();
                        if (isBooleanAttribute(node, normalizedAttrName)) {
                            attrs[normalizedAttrName] = true;
                        }
                    }
                });

                var className = node.className;
                if (_.isString(className) && !_.isEmpty(className)) {
                    var regExp = /([\d\w\-_]+)(?:\:([^;]+))?;?/g;
                    while ((match = regExp.exec(className))) {
                        var normalizedClassName = directiveNormalize(match[1]);
                        if (addDirective(directives, normalizedClassName, 'C')) {
                            attrs[normalizedClassName] = match[2] ? match[2].trim() : undefined;
                        }
                    }
                }

            } else if (node.nodeType === Node.COMMENT_NODE) {
                match = /^\s*directive\:\s*([\d\w\-_]+)\s*(.*)/.exec(node.nodeValue);
                if (match) {
                    if(addDirective(directives, directiveNormalize(match[1]), 'M')) {
                        attrs[directiveNormalize(match[1])] = match[2] ? match[2].trim() : undefined;
                    }
                }
            }

            directives.sort(byPriority);
            return directives;
        }

        /**
         * adding the match mode directive to directives:array
         * also set the multi element flag
         */
        function addDirective(directives, name, mode, attrStartName, attrEndName) {
            var match;
            if (hasDirectives.hasOwnProperty(name)) {
                var foundDirectives = $injector.get(name + 'Directive');
                var applicableDirectives = _.filter(foundDirectives, function(dir) {
                    return dir.restrict.indexOf(mode) !== -1;
                });

                _.forEach(applicableDirectives, function(directive) {
                    if (attrStartName) {
                        directive = _.create(directive, {
                            $$start : attrStartName,
                            $$end : attrEndName
                        });
                    }
                    directives.push(directive);
                    match = true;
                });
            }
            return match;
        }

        function byPriority(a, b) {
            var diff = b.priority - a.priority;
            if (diff !== 0) {
                return diff;
            } else {
                if (a.name !== b.name) {
                    return (a.name < b.name ? -1 : 1);
                } else {
                    return a.index - b.index;
                }
            }
        }

        function directiveIsMultiElement(name) {
            if(hasDirectives.hasOwnProperty(name)) {
                var directives = $injector.get(name + 'Directive');
                return _.some(directives, {multiElement: true});
            }
            return false;
        }

        function groupScan(node, startAttr, endAttr) {
            var nodes = [];
            if (node && startAttr && node.hasAttribute(startAttr)) {

                var depth = 0;
                do {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.hasAttribute(startAttr)) {
                            depth++;
                        } else  if (node.hasAttribute(endAttr)) {
                            depth--;
                        }
                    }
                    nodes.push(node);
                    node = node.nextSibling;
                }while (depth > 0);
            }else {
                nodes.push(node);
            }
            return $(nodes);
        }

        function groupElementsLinkFnWrapper(linkFn, attrStart, attrEnd) {
            return function(scope, $element, attrs, ctrl) {
                var group = groupScan($element[0], attrStart, attrEnd);
                return linkFn(scope, group, attrs, ctrl);
            };
        }

        return compile;
    }];
}

$CompileProvider.$inject = ['$provide'];

module.exports = $CompileProvider;
