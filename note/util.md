## promise
### promise chain 
This is how chained then calls work. Each one creates a new Deferred and, by association, a new
Promise. The new Deferred is independent from the original, but is resolved when the original 
one is resolved.
### how promise work
Defer have a promise inside. Promise call then to add callback to process queue.
Then after Defer call resolve/reject, the process queue execute with value that resolve/reject just pass in.

Although there's more details to cover with, this is basic idea how promise works.  

### promise finally
So, in summary, whenever a finally returns a Promise, we wait for it to become resolved before 
continuing. We ignore that Promise’s resolution in favor of the original one, except when it rejects, 
in which case we pass the rejection forward in the chain.

### es6 & $q promise style
```js
var deferred = Q.defer();
doAsyncStuff(function(err) {
  if (err) {
    deferred.reject(err);
  } else {
    deferred.resolve();
  }
});
return deferred.promise;
```
```js
return new Promise(function(resolve, reject) {
  doAsyncStuff(function(err) {
    if (err) {
      reject(err);
          } else {
      resolve();
    }
  });
});
```

### $http `status`
All that remains to be done in $http is a “normalization” of the status code. In error responses, 
$httpBackend may return negative status codes, but $http never resolves to anything smaller 
than 0: `status = Math.max(status, 0); `