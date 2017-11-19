## parse
### ast construct precedence when it comes to ast node type.
- primary mix up by the other basic type nodes
```js
AST.prototype.primary = function () {  
    if (this.expect('[')) {
        return this.arrayDeclaration();
    } else if (this.expect('{')) {
        return this.object();
    } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
        return this.constants[this.consume().text];
    } else if (this.peek().identifier) {
        return this.identifier();
    } else {
        return this.constant();
    }
};
```
### property look up and assign
```js
case AST.Identifier:
    intoId = this.nextId();
    this.if_('s', this.assign(intoId, this.nonComputedMember('s', ast.name)));
    return intoId;
```
relate to this pattern
```js
function (s) {
  var v0;
  if (s) {
    v0 = s.aKey;
  }
  return v0;
}
```

### ast node look like these
```json
{
    "type":"Program",
    "body":{
        "type":"MemberExpression",
        "object":{
            "type":"Identifier",
            "name":"aKey"
        },
        "property":{
            "type":"Identifier",
            "name":"anotherKey"
        }
    }
}
```

### why constructor is unsafe
`someFn.constructor('return window')` is equivalent to 
`new Function('return window')();` 

### compile error vs runtime error
case AST.Identifier:
        ensureSafeMemberName(ast.name);
        
        VS.
        
this.addEnsureSafeObject(intoId);