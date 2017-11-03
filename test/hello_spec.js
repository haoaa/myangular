var sayHello = require('../src/hello'); 

describe('Hello', function(){
  it('say Hello', function(){
    expect(sayHello('John')).toBe('Hello, John!');
  });

  it('one plus one equals to two', function(){
    expect(1+1).toBe(2);
  });
});