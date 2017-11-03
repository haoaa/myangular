var _ = require('lodash');

module.exports = function sayHello(to) {
    // return 'Hello, world!';
    return _.template('Hello, <%= name %>!')({name: to});
};