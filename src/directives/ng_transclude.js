'use strict';

var ngTranscludeDirective = function() {
    return {
        restrict: 'AEC',
        link : function(scope, element, attrs, ctrl, transclude) {
            transclude(function(clone) {
                element.empty();
                element.append(clone);
            });
        }
    };
};

module.exports = ngTranscludeDirective;
